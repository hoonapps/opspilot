import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { ElasticsearchService } from "../agent/elasticsearch.service";
import { EmbeddingService } from "../agent/embedding.service";
import { sha256 } from "../shared/hash";
import { ChunkerService } from "./chunker.service";
import { parseMarkdownDocument } from "./frontmatter";
import { RedactionService } from "./redaction.service";

type IngestedDocument = {
  path: string;
  title: string;
  chunks: number;
  changed: boolean;
};

type DocumentInventoryRow = {
  id: string;
  path: string;
  title: string;
  visibility: string;
  teamSlug?: string | null;
  metadata: Record<string, unknown>;
  contentHash: string;
  chunkCount: number | string;
  latestVersion: number | string;
  updatedAt: string;
};

type ChunkPreviewRow = {
  id: string;
  documentId: string;
  chunkIndex: number;
  contentPreview: string;
  contentLength: number | string;
  heading?: string | null;
};

type DocumentVersionRow = {
  id: string;
  documentId: string;
  version: number | string;
  contentHash: string;
  content: string;
  createdAt: Date | string;
};

type IndexQualityRow = {
  id: string;
  path: string;
  title: string;
  visibility: string;
  teamSlug?: string | null;
  metadata: Record<string, unknown>;
  contentHash: string;
  updatedAt: Date | string;
  chunkCount: number | string;
  totalContentLength: number | string;
  avgChunkLength: number | string | null;
  maxChunkLength: number | string | null;
  minChunkLength: number | string | null;
  headingChunkCount: number | string;
  emptyChunkCount: number | string;
  oversizedChunkCount: number | string;
  tinyChunkCount: number | string;
  latestVersion: number | string;
  latestContentLength: number | string;
};

type DocumentImpactRow = {
  answerId: string;
  questionId: string;
  question: string;
  answerPreview: string;
  confidence: number | string;
  needsHumanReview: boolean;
  answerCreatedAt: Date | string;
  sourceRank: number | string;
  sourceScore: number | string;
  sourceChunkCount: number | string;
};

export type DocumentInventoryItem = {
  id: string;
  path: string;
  title: string;
  visibility: string;
  teamSlug?: string | null;
  contentHash: string;
  metadata: Record<string, unknown>;
  chunkCount: number;
  latestVersion: number;
  updatedAt: string;
  chunks: Array<{
    id: string;
    chunkIndex: number;
    heading?: string | null;
    contentPreview: string;
    contentLength: number;
  }>;
};

export type DocumentVersionHistory = {
  document: {
    id: string;
    path: string;
    title: string;
    visibility: string;
    teamSlug?: string | null;
    latestVersion: number;
  };
  versions: Array<{
    id: string;
    version: number;
    contentHash: string;
    contentLength: number;
    contentPreview: string;
    createdAt: string;
    diffFromPrevious: DocumentVersionDiff | null;
  }>;
  latestDiff: DocumentVersionDiff | null;
};

export type DocumentVersionDiff = {
  method: "line_set_diff_v1";
  fromVersion: number;
  toVersion: number;
  addedLineCount: number;
  removedLineCount: number;
  unchangedLineCount: number;
  addedPreview: string[];
  removedPreview: string[];
};

export type DocumentIndexQualityReport = {
  generatedAt: string;
  status: "healthy" | "warning" | "critical";
  score: number;
  summary: {
    totalDocuments: number;
    totalChunks: number;
    avgChunksPerDocument: number;
    avgChunkLength: number;
    maxChunkLength: number;
    minChunkLength: number;
    publicDocuments: number;
    teamDocuments: number;
    restrictedDocuments: number;
    redactionCount: number;
    promptInjectionRiskCount: number;
    missingChunkDocuments: number;
    oversizedChunkCount: number;
    emptyChunkCount: number;
    unversionedDocuments: number;
  };
  gates: Array<{
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    metric: number;
    threshold: number;
    message: string;
  }>;
  documents: Array<{
    id: string;
    path: string;
    title: string;
    visibility: string;
    teamSlug?: string | null;
    updatedAt: string;
    contentHash: string;
    chunkCount: number;
    latestVersion: number;
    contentLength: number;
    avgChunkLength: number;
    maxChunkLength: number;
    minChunkLength: number;
    emptyChunkCount: number;
    oversizedChunkCount: number;
    tinyChunkCount: number;
    headingCoverageRatio: number;
    redactionCount: number;
    promptInjectionRisk: boolean;
    promptInjectionPatternCount: number;
    checks: Array<{
      id: string;
      label: string;
      status: "pass" | "warn" | "fail";
      message: string;
    }>;
    recommendations: string[];
  }>;
};

export type DocumentImpactReport = {
  generatedAt: string;
  document: {
    id: string;
    path: string;
    title: string;
    visibility: string;
    teamSlug?: string | null;
    latestVersion: number;
    updatedAt: string;
    contentHash: string;
  };
  summary: {
    affectedAnswerCount: number;
    affectedQuestionCount: number;
    topSourceAnswerCount: number;
    staleAnswerCount: number;
    humanReviewAnswerCount: number;
    latestAnswerAt: string | null;
    riskLevel: "low" | "medium" | "high";
  };
  recommendations: string[];
  affectedAnswers: Array<{
    answerId: string;
    questionId: string;
    question: string;
    answerPreview: string;
    confidence: number;
    needsHumanReview: boolean;
    answerCreatedAt: string;
    sourceRank: number;
    sourceScore: number;
    sourceChunkCount: number;
    staleAfterDocumentUpdate: boolean;
  }>;
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly orm: MikroORM,
    private readonly chunker: ChunkerService,
    private readonly embeddings: EmbeddingService,
    private readonly elasticsearch: ElasticsearchService,
    private readonly redaction: RedactionService
  ) {}

  async ingestSeedDocuments(): Promise<{ documents: IngestedDocument[] }> {
    const seedDir = process.env.SEED_DOCUMENTS_DIR ?? "../../seed/documents";
    const rootDir = join(process.cwd(), seedDir);
    const files = await findMarkdownFiles(rootDir);
    const documents: IngestedDocument[] = [];

    for (const file of files) {
      const raw = await readFile(file, "utf8");
      const path = relative(rootDir, file);
      documents.push(await this.ingestMarkdown(path, raw));
    }

    return { documents };
  }

  async listInventory(limit = 50): Promise<{ documents: DocumentInventoryItem[] }> {
    const em = this.orm.em.fork();
    const connection = em.getConnection();
    const documents = (await connection.execute<DocumentInventoryRow[]>(
      `
        select
          d.id,
          d.path,
          d.title,
          d.visibility,
          d.team_slug as "teamSlug",
          d.metadata,
          d.content_hash as "contentHash",
          count(distinct c.id)::int as "chunkCount",
          coalesce(max(v.version), 0)::int as "latestVersion",
          d.updated_at as "updatedAt"
        from documents d
        left join document_chunks c on c.document_id = d.id
        left join document_versions v on v.document_id = d.id
        group by d.id
        order by d.updated_at desc
        limit ?;
      `,
      [limit]
    )) as DocumentInventoryRow[];

    if (documents.length === 0) {
      return { documents: [] };
    }

    const chunkRows = (await connection.execute<ChunkPreviewRow[]>(
      `
        with ranked as (
          select
            c.id,
            c.document_id as "documentId",
            c.chunk_index as "chunkIndex",
            left(c.content, 360) as "contentPreview",
            char_length(c.content)::int as "contentLength",
            c.metadata ->> 'heading' as heading,
            row_number() over (partition by c.document_id order by c.chunk_index) as rank
          from document_chunks c
          where c.document_id in (${documents.map(() => "?::uuid").join(", ")})
        )
        select
          id,
          "documentId",
          "chunkIndex",
          "contentPreview",
          "contentLength",
          heading
        from ranked
        where rank <= 3
        order by "documentId", "chunkIndex";
      `,
      documents.map((document) => document.id)
    )) as ChunkPreviewRow[];

    const chunksByDocumentId = new Map<string, DocumentInventoryItem["chunks"]>();
    for (const chunk of chunkRows) {
      const chunks = chunksByDocumentId.get(chunk.documentId) ?? [];
      chunks.push({
        id: chunk.id,
        chunkIndex: chunk.chunkIndex,
        heading: chunk.heading,
        contentPreview: chunk.contentPreview,
        contentLength: Number(chunk.contentLength)
      });
      chunksByDocumentId.set(chunk.documentId, chunks);
    }

    return {
      documents: documents.map((document) => ({
        id: document.id,
        path: document.path,
        title: document.title,
        visibility: document.visibility,
        teamSlug: document.teamSlug,
        contentHash: document.contentHash,
        metadata: document.metadata,
        chunkCount: Number(document.chunkCount),
        latestVersion: Number(document.latestVersion),
        updatedAt: document.updatedAt,
        chunks: chunksByDocumentId.get(document.id) ?? []
      }))
    };
  }

  async getVersionHistory(documentId: string): Promise<DocumentVersionHistory | null> {
    const connection = this.orm.em.fork().getConnection();
    const [document] = (await connection.execute<DocumentInventoryRow[]>(
      `
        select
          d.id,
          d.path,
          d.title,
          d.visibility,
          d.team_slug as "teamSlug",
          d.metadata,
          d.content_hash as "contentHash",
          0::int as "chunkCount",
          coalesce(max(v.version), 0)::int as "latestVersion",
          d.updated_at as "updatedAt"
        from documents d
        left join document_versions v on v.document_id = d.id
        where d.id = ?::uuid
        group by d.id;
      `,
      [documentId]
    )) as DocumentInventoryRow[];

    if (!document) {
      return null;
    }

    const rows = (await connection.execute<DocumentVersionRow[]>(
      `
        select
          id,
          document_id as "documentId",
          version,
          content_hash as "contentHash",
          content,
          created_at as "createdAt"
        from document_versions
        where document_id = ?::uuid
        order by version asc;
      `,
      [documentId]
    )) as DocumentVersionRow[];
    const versionsAscending = rows.map((row, index) => {
      const previous = index > 0 ? rows[index - 1] : undefined;
      return {
        id: row.id,
        version: Number(row.version),
        contentHash: row.contentHash,
        contentLength: row.content.length,
        contentPreview: previewText(row.content),
        createdAt: toIsoString(row.createdAt),
        diffFromPrevious: previous ? diffVersions(Number(previous.version), previous.content, Number(row.version), row.content) : null
      };
    });

    return {
      document: {
        id: document.id,
        path: document.path,
        title: document.title,
        visibility: document.visibility,
        teamSlug: document.teamSlug,
        latestVersion: Number(document.latestVersion)
      },
      versions: [...versionsAscending].reverse(),
      latestDiff: versionsAscending[versionsAscending.length - 1]?.diffFromPrevious ?? null
    };
  }

  async getIndexQualityReport(): Promise<DocumentIndexQualityReport> {
    const connection = this.orm.em.fork().getConnection();
    const rows = (await connection.execute<IndexQualityRow[]>(
      `
        select
          d.id,
          d.path,
          d.title,
          d.visibility,
          d.team_slug as "teamSlug",
          d.metadata,
          d.content_hash as "contentHash",
          d.updated_at as "updatedAt",
          count(c.id)::int as "chunkCount",
          coalesce(sum(char_length(c.content)), 0)::int as "totalContentLength",
          coalesce(avg(char_length(c.content)), 0)::int as "avgChunkLength",
          coalesce(max(char_length(c.content)), 0)::int as "maxChunkLength",
          coalesce(min(char_length(c.content)), 0)::int as "minChunkLength",
          count(c.id) filter (where coalesce(nullif(c.metadata ->> 'heading', ''), '') <> '')::int as "headingChunkCount",
          count(c.id) filter (where btrim(c.content) = '')::int as "emptyChunkCount",
          count(c.id) filter (where char_length(c.content) > 1400)::int as "oversizedChunkCount",
          count(c.id) filter (where char_length(c.content) < 80)::int as "tinyChunkCount",
          coalesce(max(v.version), 0)::int as "latestVersion",
          coalesce(max(char_length(v.content)) filter (
            where v.version = (
              select max(v2.version)
              from document_versions v2
              where v2.document_id = d.id
            )
          ), 0)::int as "latestContentLength"
        from documents d
        left join document_chunks c on c.document_id = d.id
        left join document_versions v on v.document_id = d.id
        group by d.id
        order by d.updated_at desc;
      `
    )) as IndexQualityRow[];

    const documents = rows.map((row) => {
      const chunkCount = Number(row.chunkCount);
      const avgChunkLength = Number(row.avgChunkLength ?? 0);
      const maxChunkLength = Number(row.maxChunkLength ?? 0);
      const minChunkLength = Number(row.minChunkLength ?? 0);
      const headingChunkCount = Number(row.headingChunkCount);
      const emptyChunkCount = Number(row.emptyChunkCount);
      const oversizedChunkCount = Number(row.oversizedChunkCount);
      const tinyChunkCount = Number(row.tinyChunkCount);
      const latestVersion = Number(row.latestVersion);
      const redactionCount = getSecurityNumber(row.metadata, "redactionCount");
      const promptInjectionRisk = getSecurityBoolean(row.metadata, "promptInjectionRisk");
      const promptInjectionPatternCount = getSecurityNumber(row.metadata, "promptInjectionPatternCount");
      const headingCoverageRatio = chunkCount === 0 ? 0 : headingChunkCount / chunkCount;
      const checks = [
        buildDocumentCheck(
          "chunks_present",
          "청크 생성",
          chunkCount > 0 ? "pass" : "fail",
          chunkCount > 0 ? `청크 ${chunkCount}개가 생성됐습니다.` : "검색 가능한 청크가 없습니다."
        ),
        buildDocumentCheck(
          "versioned",
          "버전 저장",
          latestVersion > 0 ? "pass" : "fail",
          latestVersion > 0 ? `최신 버전 v${latestVersion}가 저장됐습니다.` : "문서 변경 이력이 없습니다."
        ),
        buildDocumentCheck(
          "chunk_size",
          "청크 크기",
          emptyChunkCount > 0 || oversizedChunkCount > 0 ? "warn" : "pass",
          emptyChunkCount > 0 || oversizedChunkCount > 0
            ? `빈 청크 ${emptyChunkCount}개, 과대 청크 ${oversizedChunkCount}개를 확인해야 합니다.`
            : `평균 ${Math.round(avgChunkLength)}자로 검색 컨텍스트에 적합합니다.`
        ),
        buildDocumentCheck(
          "heading_coverage",
          "헤딩 보존",
          chunkCount === 0 ? "fail" : headingCoverageRatio >= 0.5 ? "pass" : "warn",
          `헤딩이 있는 청크 비율은 ${Math.round(headingCoverageRatio * 100)}%입니다.`
        ),
        buildDocumentCheck(
          "prompt_injection",
          "프롬프트 주입 격리",
          promptInjectionRisk ? "warn" : "pass",
          promptInjectionRisk
            ? `위험 패턴 ${promptInjectionPatternCount}개가 탐지되어 메타데이터로 격리됐습니다.`
            : "프롬프트 주입 위험 패턴이 없습니다."
        )
      ];

      return {
        id: row.id,
        path: row.path,
        title: row.title,
        visibility: row.visibility,
        teamSlug: row.teamSlug,
        updatedAt: toIsoString(row.updatedAt),
        contentHash: row.contentHash,
        chunkCount,
        latestVersion,
        contentLength: Number(row.latestContentLength) || Number(row.totalContentLength),
        avgChunkLength,
        maxChunkLength,
        minChunkLength,
        emptyChunkCount,
        oversizedChunkCount,
        tinyChunkCount,
        headingCoverageRatio,
        redactionCount,
        promptInjectionRisk,
        promptInjectionPatternCount,
        checks,
        recommendations: buildIndexRecommendations({
          chunkCount,
          avgChunkLength,
          maxChunkLength,
          emptyChunkCount,
          oversizedChunkCount,
          tinyChunkCount,
          headingCoverageRatio,
          latestVersion,
          promptInjectionRisk
        })
      };
    });

    const summary = buildQualitySummary(documents);
    const gates = buildQualityGates(summary);
    const passCount = gates.filter((gate) => gate.status === "pass").length;
    const score = gates.length === 0 ? 0 : passCount / gates.length;
    const status = gates.some((gate) => gate.status === "fail") ? "critical" : gates.some((gate) => gate.status === "warn") ? "warning" : "healthy";

    return {
      generatedAt: new Date().toISOString(),
      status,
      score,
      summary,
      gates,
      documents
    };
  }

  async getImpactReport(documentId: string): Promise<DocumentImpactReport | null> {
    const connection = this.orm.em.fork().getConnection();
    const [document] = (await connection.execute<DocumentInventoryRow[]>(
      `
        select
          d.id,
          d.path,
          d.title,
          d.visibility,
          d.team_slug as "teamSlug",
          d.metadata,
          d.content_hash as "contentHash",
          0::int as "chunkCount",
          coalesce(max(v.version), 0)::int as "latestVersion",
          d.updated_at as "updatedAt"
        from documents d
        left join document_versions v on v.document_id = d.id
        where d.id = ?::uuid
        group by d.id;
      `,
      [documentId]
    )) as DocumentInventoryRow[];

    if (!document) {
      return null;
    }

    const rows = (await connection.execute<DocumentImpactRow[]>(
      `
        with source_rows as (
          select
            a.id as answer_id,
            q.id as question_id,
            q.text as question,
            a.text as answer_text,
            a.confidence,
            a.needs_human_review,
            a.created_at,
            s.rank,
            s.score,
            s.chunk_id::text as chunk_key
          from answer_sources s
          join answers a on a.id = s.answer_id
          join questions q on q.id = a.question_id
          where s.document_id = ?::uuid
          union all
          select
            a.id as answer_id,
            q.id as question_id,
            q.text as question,
            a.text as answer_text,
            a.confidence,
            a.needs_human_review,
            a.created_at,
            coalesce((source.value ->> 'rank')::int, 999) as rank,
            coalesce((source.value ->> 'score')::float, 0) as score,
            coalesce(source.value ->> 'chunkId', source.value ->> 'path', a.id::text) as chunk_key
          from answers a
          join questions q on q.id = a.question_id
          cross join lateral jsonb_array_elements(coalesce(a.metadata -> 'sources', '[]'::jsonb)) as source(value)
          where source.value ->> 'documentId' = ?
        )
        select
          answer_id as "answerId",
          question_id as "questionId",
          question,
          left(answer_text, 320) as "answerPreview",
          confidence,
          needs_human_review as "needsHumanReview",
          created_at as "answerCreatedAt",
          min(rank)::int as "sourceRank",
          max(score) as "sourceScore",
          count(distinct chunk_key)::int as "sourceChunkCount"
        from source_rows
        group by answer_id, question_id, question, answer_text, confidence, needs_human_review, created_at
        order by created_at desc
        limit 20;
      `,
      [documentId, documentId]
    )) as DocumentImpactRow[];

    const documentUpdatedAt = new Date(document.updatedAt);
    const affectedAnswers = rows.map((row) => ({
      answerId: row.answerId,
      questionId: row.questionId,
      question: row.question,
      answerPreview: row.answerPreview,
      confidence: Number(row.confidence),
      needsHumanReview: row.needsHumanReview,
      answerCreatedAt: toIsoString(row.answerCreatedAt),
      sourceRank: Number(row.sourceRank),
      sourceScore: Number(row.sourceScore),
      sourceChunkCount: Number(row.sourceChunkCount),
      staleAfterDocumentUpdate: new Date(row.answerCreatedAt).getTime() < documentUpdatedAt.getTime()
    }));
    const affectedQuestionIds = new Set(affectedAnswers.map((answer) => answer.questionId));
    const staleAnswerCount = affectedAnswers.filter((answer) => answer.staleAfterDocumentUpdate).length;
    const humanReviewAnswerCount = affectedAnswers.filter((answer) => answer.needsHumanReview).length;
    const topSourceAnswerCount = affectedAnswers.filter((answer) => answer.sourceRank === 1).length;
    const riskLevel = buildImpactRiskLevel({
      affectedAnswerCount: affectedAnswers.length,
      staleAnswerCount,
      humanReviewAnswerCount,
      visibility: document.visibility
    });

    return {
      generatedAt: new Date().toISOString(),
      document: {
        id: document.id,
        path: document.path,
        title: document.title,
        visibility: document.visibility,
        teamSlug: document.teamSlug,
        latestVersion: Number(document.latestVersion),
        updatedAt: toIsoString(document.updatedAt),
        contentHash: document.contentHash
      },
      summary: {
        affectedAnswerCount: affectedAnswers.length,
        affectedQuestionCount: affectedQuestionIds.size,
        topSourceAnswerCount,
        staleAnswerCount,
        humanReviewAnswerCount,
        latestAnswerAt: affectedAnswers[0]?.answerCreatedAt ?? null,
        riskLevel
      },
      recommendations: buildImpactRecommendations({
        affectedAnswerCount: affectedAnswers.length,
        staleAnswerCount,
        humanReviewAnswerCount,
        topSourceAnswerCount,
        visibility: document.visibility,
        riskLevel
      }),
      affectedAnswers
    };
  }

  async ingestMarkdown(path: string, raw: string): Promise<IngestedDocument> {
    const parsed = parseMarkdownDocument(path, raw);
    const redacted = this.redaction.redactMarkdown(parsed.body);
    const contentHash = sha256(redacted.content);
    const em = this.orm.em.fork();
    const connection = em.getConnection();

    const existing = await connection.execute<{ id: string; content_hash: string }[]>(
      "select id, content_hash from documents where path = ?",
      [path]
    );
    const changed = existing.length === 0 || existing[0].content_hash !== contentHash;

    const [document] = await connection.execute<{ id: string }[]>(
      `
        insert into documents (path, title, visibility, team_slug, metadata, content_hash)
        values (?, ?, ?, ?, ?::jsonb, ?)
        on conflict (path)
        do update set
          title = excluded.title,
          visibility = excluded.visibility,
          team_slug = excluded.team_slug,
          metadata = excluded.metadata,
          content_hash = excluded.content_hash,
          updated_at = now()
        returning id;
      `,
      [
        path,
        parsed.metadata.title,
        parsed.metadata.visibility,
        parsed.metadata.teamSlug ?? null,
        JSON.stringify({
          ...parsed.metadata,
          security: {
            redactionCount: redacted.redactionCount,
            redactionPatterns: redacted.patterns,
            promptInjectionRisk: redacted.promptInjection.risk,
            promptInjectionPatternCount: redacted.promptInjection.patternCount,
            promptInjectionPatterns: redacted.promptInjection.patterns
          }
        }),
        contentHash
      ]
    );

    if (changed) {
      const [{ next_version: nextVersion }] = await connection.execute<{ next_version: number }[]>(
        "select coalesce(max(version), 0) + 1 as next_version from document_versions where document_id = ?::uuid",
        [document.id]
      );
      await connection.execute(
        `
          insert into document_versions (document_id, version, content_hash, content)
          values (?::uuid, ?, ?, ?)
          on conflict (document_id, version) do nothing;
        `,
        [document.id, nextVersion, contentHash, redacted.content]
      );
    }

    await this.elasticsearch.deleteDocumentChunks(document.id);

    const chunks = this.chunker.chunk(redacted.content);
    for (const chunk of chunks) {
      const embedding = this.embeddings.toSqlVector(await this.embeddings.embed(`${parsed.metadata.title}\n${chunk.content}`));
      const [chunkRow] = await connection.execute<{ id: string }[]>(
        `
          insert into document_chunks (document_id, chunk_index, content, embedding, metadata)
          values (?::uuid, ?, ?, ?::vector, ?::jsonb)
          on conflict (document_id, chunk_index)
          do update set
            content = excluded.content,
            embedding = excluded.embedding,
            metadata = excluded.metadata
          returning id;
        `,
        [
          document.id,
          chunk.index,
          chunk.content,
          embedding,
          JSON.stringify({
            heading: chunk.heading,
            title: parsed.metadata.title,
            path,
            security: {
              promptInjectionRisk: redacted.promptInjection.risk,
              promptInjectionPatterns: redacted.promptInjection.patterns
            }
          })
        ]
      );
      await this.elasticsearch.indexChunk({
        chunkId: chunkRow.id,
        documentId: document.id,
        chunkIndex: chunk.index,
        title: parsed.metadata.title,
        path,
        content: chunk.content,
        visibility: parsed.metadata.visibility,
        teamSlug: parsed.metadata.teamSlug,
        metadata: { heading: chunk.heading, tags: parsed.metadata.tags ?? [] }
      });
    }

    await connection.execute("delete from document_chunks where document_id = ?::uuid and chunk_index >= ?", [
      document.id,
      chunks.length
    ]);

    return {
      path,
      title: parsed.metadata.title,
      chunks: chunks.length,
      changed
    };
  }
}

function buildDocumentCheck(
  id: string,
  label: string,
  status: "pass" | "warn" | "fail",
  message: string
): DocumentIndexQualityReport["documents"][number]["checks"][number] {
  return { id, label, status, message };
}

function buildIndexRecommendations(input: {
  chunkCount: number;
  avgChunkLength: number;
  maxChunkLength: number;
  emptyChunkCount: number;
  oversizedChunkCount: number;
  tinyChunkCount: number;
  headingCoverageRatio: number;
  latestVersion: number;
  promptInjectionRisk: boolean;
}): string[] {
  const recommendations: string[] = [];

  if (input.chunkCount === 0) {
    recommendations.push("문서를 다시 색인해 검색 가능한 청크를 생성하세요.");
  }
  if (input.latestVersion === 0) {
    recommendations.push("문서 버전 이력이 없으므로 upsert 경로로 재등록하세요.");
  }
  if (input.emptyChunkCount > 0) {
    recommendations.push("빈 청크가 생성되지 않도록 Markdown 공백과 frontmatter를 확인하세요.");
  }
  if (input.oversizedChunkCount > 0 || input.maxChunkLength > 1400) {
    recommendations.push("긴 섹션은 헤딩이나 문단을 나눠 검색 컨텍스트 오염을 줄이세요.");
  }
  if (input.tinyChunkCount > 0 && input.avgChunkLength < 220) {
    recommendations.push("너무 짧은 청크가 많으면 문단을 합쳐 검색 신호를 보강하세요.");
  }
  if (input.chunkCount > 0 && input.headingCoverageRatio < 0.5) {
    recommendations.push("Markdown 헤딩을 추가해 청크의 주제 신호를 명확히 하세요.");
  }
  if (input.promptInjectionRisk) {
    recommendations.push("프롬프트 주입 문구가 있는 문서는 운영 검토 후 공개 범위를 제한하세요.");
  }

  return recommendations.length > 0 ? recommendations : ["현재 색인 품질이 기준을 충족합니다."];
}

function buildQualitySummary(
  documents: DocumentIndexQualityReport["documents"]
): DocumentIndexQualityReport["summary"] {
  const totalDocuments = documents.length;
  const totalChunks = documents.reduce((sum, document) => sum + document.chunkCount, 0);
  const avgChunkLength = totalChunks === 0
    ? 0
    : documents.reduce((sum, document) => sum + document.avgChunkLength * document.chunkCount, 0) / totalChunks;

  return {
    totalDocuments,
    totalChunks,
    avgChunksPerDocument: totalDocuments === 0 ? 0 : totalChunks / totalDocuments,
    avgChunkLength,
    maxChunkLength: Math.max(0, ...documents.map((document) => document.maxChunkLength)),
    minChunkLength: documents.some((document) => document.chunkCount > 0)
      ? Math.min(...documents.filter((document) => document.chunkCount > 0).map((document) => document.minChunkLength))
      : 0,
    publicDocuments: documents.filter((document) => document.visibility === "public").length,
    teamDocuments: documents.filter((document) => document.visibility === "team").length,
    restrictedDocuments: documents.filter((document) => document.visibility === "restricted").length,
    redactionCount: documents.reduce((sum, document) => sum + document.redactionCount, 0),
    promptInjectionRiskCount: documents.filter((document) => document.promptInjectionRisk).length,
    missingChunkDocuments: documents.filter((document) => document.chunkCount === 0).length,
    oversizedChunkCount: documents.reduce((sum, document) => sum + document.oversizedChunkCount, 0),
    emptyChunkCount: documents.reduce((sum, document) => sum + document.emptyChunkCount, 0),
    unversionedDocuments: documents.filter((document) => document.latestVersion === 0).length
  };
}

function buildQualityGates(summary: DocumentIndexQualityReport["summary"]): DocumentIndexQualityReport["gates"] {
  return [
    {
      id: "documents_present",
      label: "문서 존재",
      status: summary.totalDocuments > 0 ? "pass" : "fail",
      metric: summary.totalDocuments,
      threshold: 1,
      message:
        summary.totalDocuments > 0
          ? `색인된 문서 ${summary.totalDocuments}개를 확인했습니다.`
          : "색인된 문서가 없습니다."
    },
    {
      id: "chunk_coverage",
      label: "청크 커버리지",
      status: summary.missingChunkDocuments === 0 ? "pass" : "fail",
      metric: summary.missingChunkDocuments,
      threshold: 0,
      message:
        summary.missingChunkDocuments === 0
          ? "모든 문서에 검색 가능한 청크가 있습니다."
          : `청크가 없는 문서 ${summary.missingChunkDocuments}개가 있습니다.`
    },
    {
      id: "version_coverage",
      label: "버전 커버리지",
      status: summary.unversionedDocuments === 0 ? "pass" : "fail",
      metric: summary.unversionedDocuments,
      threshold: 0,
      message:
        summary.unversionedDocuments === 0
          ? "모든 문서의 버전 이력이 저장됐습니다."
          : `버전 이력이 없는 문서 ${summary.unversionedDocuments}개가 있습니다.`
    },
    {
      id: "chunk_size",
      label: "청크 크기",
      status: summary.avgChunkLength >= 120 && summary.avgChunkLength <= 1200 ? "pass" : "warn",
      metric: Math.round(summary.avgChunkLength),
      threshold: 120,
      message: `평균 청크 길이는 ${Math.round(summary.avgChunkLength)}자입니다.`
    },
    {
      id: "security_isolation",
      label: "보안 격리",
      status: summary.promptInjectionRiskCount === 0 ? "pass" : "warn",
      metric: summary.promptInjectionRiskCount,
      threshold: 0,
      message:
        summary.promptInjectionRiskCount === 0
          ? "프롬프트 주입 위험 문서가 없습니다."
          : `프롬프트 주입 위험 문서 ${summary.promptInjectionRiskCount}개가 격리 메타데이터로 표시됐습니다.`
    }
  ];
}

function buildImpactRiskLevel(input: {
  affectedAnswerCount: number;
  staleAnswerCount: number;
  humanReviewAnswerCount: number;
  visibility: string;
}): DocumentImpactReport["summary"]["riskLevel"] {
  if (input.affectedAnswerCount === 0) {
    return "low";
  }
  if (input.staleAnswerCount > 0 && (input.humanReviewAnswerCount > 0 || input.visibility === "restricted")) {
    return "high";
  }
  if (input.staleAnswerCount > 0 || input.humanReviewAnswerCount > 0 || input.affectedAnswerCount >= 3) {
    return "medium";
  }
  return "low";
}

function buildImpactRecommendations(input: {
  affectedAnswerCount: number;
  staleAnswerCount: number;
  humanReviewAnswerCount: number;
  topSourceAnswerCount: number;
  visibility: string;
  riskLevel: DocumentImpactReport["summary"]["riskLevel"];
}): string[] {
  const recommendations: string[] = [];

  if (input.affectedAnswerCount === 0) {
    recommendations.push("이 문서를 출처로 사용한 저장 답변이 아직 없습니다. 신규 질문으로 검색 적중 여부만 검증하세요.");
  }
  if (input.staleAnswerCount > 0) {
    recommendations.push("문서 변경 이후 생성 시점이 오래된 답변을 replay로 재검증하고 drift 여부를 확인하세요.");
  }
  if (input.topSourceAnswerCount > 0) {
    recommendations.push("이 문서가 1순위 근거였던 답변은 운영 판단에 직접 영향을 줄 수 있으므로 우선 검토하세요.");
  }
  if (input.humanReviewAnswerCount > 0) {
    recommendations.push("사람 검토가 필요했던 답변은 승인/반려 이력과 함께 다시 확인하세요.");
  }
  if (input.visibility === "restricted") {
    recommendations.push("제한 문서 영향 분석은 호출자 권한과 감사 번들 접근 경계를 함께 검증하세요.");
  }
  if (input.riskLevel === "low" && input.affectedAnswerCount > 0) {
    recommendations.push("영향 답변 수가 낮습니다. 정기 평가와 문서 일치율만 확인하면 됩니다.");
  }

  return [...new Set(recommendations)].slice(0, 5);
}

function getSecurityNumber(metadata: Record<string, unknown>, key: string): number {
  const security = getSecurityMetadata(metadata);
  const value = security[key];
  return typeof value === "number" ? value : 0;
}

function getSecurityBoolean(metadata: Record<string, unknown>, key: string): boolean {
  const security = getSecurityMetadata(metadata);
  return security[key] === true;
}

function getSecurityMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const security = metadata.security;
  return security && typeof security === "object" && !Array.isArray(security) ? security as Record<string, unknown> : {};
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function previewText(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 360);
}

function diffVersions(fromVersion: number, previousContent: string, toVersion: number, currentContent: string): DocumentVersionDiff {
  const previousLines = normalizeLines(previousContent);
  const currentLines = normalizeLines(currentContent);
  const previousSet = new Set(previousLines);
  const currentSet = new Set(currentLines);
  const added = currentLines.filter((line) => !previousSet.has(line));
  const removed = previousLines.filter((line) => !currentSet.has(line));
  const unchanged = currentLines.filter((line) => previousSet.has(line));

  return {
    method: "line_set_diff_v1",
    fromVersion,
    toVersion,
    addedLineCount: added.length,
    removedLineCount: removed.length,
    unchangedLineCount: unchanged.length,
    addedPreview: added.slice(0, 5),
    removedPreview: removed.slice(0, 5)
  };
}

function normalizeLines(content: string): string[] {
  return content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        return findMarkdownFiles(fullPath);
      }
      return entry.name.endsWith(".md") ? [fullPath] : [];
    })
  );
  return files.flat().sort();
}
