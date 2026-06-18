import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { lookup } from "node:dns/promises";
import { readdir, readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { join, relative } from "node:path";
import { AnswerLineageGraph, AnswerQualityGate, AnswerReplay, AnswerTraceService } from "../agent/answer-trace.service";
import { ElasticsearchService } from "../agent/elasticsearch.service";
import { EmbeddingService } from "../agent/embedding.service";
import { sha256 } from "../shared/hash";
import { RequestContext } from "../shared/request-context";
import { ChunkerService } from "./chunker.service";
import { DocumentSourceType, IngestDocumentSourceDto } from "./dto/ingest-document-source.dto";
import { RunDocumentRevalidationDto } from "./dto/run-document-revalidation.dto";
import { parseMarkdownDocument } from "./frontmatter";
import { RedactionService } from "./redaction.service";

type IngestedDocument = {
  path: string;
  title: string;
  chunks: number;
  changed: boolean;
  contentHash: string;
};

export type IngestedDocumentSource = {
  sourceType: DocumentSourceType;
  path: string;
  title: string;
  chunks: number;
  changed: boolean;
  extractedCharacters: number;
  parser: "markdown_passthrough_v1" | "plain_text_v1" | "html_text_v1" | "pdf_text_v1" | "docx_text_v1";
  provenance: SourceIngestionProvenance;
  quality: SourceIngestionQualityReport;
};

export type SourceIngestionProvenance = {
  schemaVersion: "opspilot.source_ingestion_provenance.v1";
  received: {
    sourceType: DocumentSourceType;
    url?: string;
    fileName?: string;
  };
  extraction: {
    parser: IngestedDocumentSource["parser"];
    title: string;
    contentType: string;
    byteLength: number;
    extractedHash: string;
    finalUrl?: string;
  };
  storage: {
    path: string;
    contentHash: string;
    chunkCount: number;
    changed: boolean;
    visibility: "public" | "team" | "restricted";
    teamSlug?: string;
  };
  safety: {
    privateUrlAllowed: boolean;
    urlGuard: "ssrf_private_network_block_v1" | "not_applicable";
  };
};

export type SourceIngestionQualityReport = {
  schemaVersion: "opspilot.source_ingestion_quality.v1";
  status: "ready" | "attention" | "blocked";
  score: number;
  summary: {
    extractedCharacters: number;
    normalizedCharacters: number;
    chunkCount: number;
    avgChunkLength: number;
    maxChunkLength: number;
    headingCoverageRatio: number;
    retrievalHintCount: number;
    redactionCount: number;
    promptInjectionRisk: boolean;
  };
  checks: Array<{
    id: "text_extraction" | "chunk_generation" | "chunk_size" | "heading_signal" | "retrieval_hints" | "security_scan";
    label: string;
    status: "pass" | "warn" | "fail";
    metric: number;
    threshold: number;
    evidence: string;
  }>;
  recommendations: string[];
  searchTestQuery: string;
  suggestedQuestions: Array<{
    question: string;
    expectedEvidence: string[];
    reason: string;
  }>;
};

export type ResetDocumentsResult = {
  deleted: {
    documents: number;
    chunks: number;
    versions: number;
    answerSources: number;
    revalidationRuns: number;
  };
  reloadedSeed: boolean;
  seed?: { documents: IngestedDocument[] };
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

type DocumentIndexExplainChunkRow = {
  id: string;
  chunkIndex: number | string;
  content: string;
  contentLength: number | string;
  heading?: string | null;
  embeddingStored: boolean;
  embeddingDimensions: number | string;
  createdAt: Date | string;
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

type DocumentIndexSnapshotRow = {
  id: string;
  path: string;
  title: string;
  visibility: string;
  teamSlug?: string | null;
  contentHash: string;
  metadata: Record<string, unknown>;
  updatedAt: Date | string;
  chunkCount: number | string;
  embeddingChunkCount: number | string;
  totalContentLength: number | string;
  headingChunkCount: number | string;
  chunkSetHash: string;
  latestVersion: number | string;
  versionCount: number | string;
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

type DocumentRevalidationQueueRow = DocumentImpactRow & {
  documentId: string;
  documentPath: string;
  documentTitle: string;
  visibility: string;
  teamSlug?: string | null;
  contentHash: string;
  latestVersion: number | string;
  documentUpdatedAt: Date | string;
};

type DocumentRevalidationRunRow = {
  id: string;
  documentId: string;
  documentPath: string;
  documentTitle: string;
  answerId: string;
  questionId: string | null;
  question: string | null;
  status: DocumentRevalidationRunReport["status"];
  recommendedAction: DocumentRevalidationRunReport["decision"]["recommendedAction"];
  actor: Record<string, unknown>;
  queueItem: DocumentRevalidationQueueReport["items"][number];
  decision: DocumentRevalidationRunReport["decision"];
  summary: DocumentRevalidationRunReport["summary"];
  checks: DocumentRevalidationRunReport["checks"];
  evidenceLinks: DocumentRevalidationRunReport["evidenceLinks"];
  artifactHashes: DocumentRevalidationRunReport["artifactHashes"];
  reportHash: string;
  createdAt: Date | string;
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

export type DocumentIndexExplainReport = {
  schemaVersion: "opspilot.document_index_explain.v1";
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
    metadata: Record<string, unknown>;
  };
  pipeline: {
    source: "markdown";
    parser: "frontmatter_markdown_v1";
    redaction: "security_redaction_v1";
    chunking: "heading_paragraph_window_v1";
    embedding: "local_hash_embedding_64d";
    vectorStore: "pgvector_hnsw";
    lexicalMirror: "optional_elasticsearch";
  };
  summary: {
    chunkCount: number;
    totalContentLength: number;
    avgChunkLength: number;
    maxChunkLength: number;
    minChunkLength: number;
    headingCoverageRatio: number;
    uniqueHeadingCount: number;
    latestDiffChangedLineCount: number;
    searchReady: boolean;
    embeddingCoverageRatio: number;
    redactionCount: number;
    promptInjectionRisk: boolean;
  };
  checks: Array<{
    id: "chunks_present" | "embedding_coverage" | "heading_signal" | "chunk_size" | "version_trace" | "security_metadata";
    label: string;
    status: "pass" | "warn" | "fail";
    metric: number;
    threshold: number;
    evidence: string;
  }>;
  headingOutline: Array<{
    heading: string;
    chunkIndexes: number[];
    chunkCount: number;
  }>;
  chunks: Array<{
    id: string;
    chunkIndex: number;
    heading?: string | null;
    contentLength: number;
    tokenEstimate: number;
    embeddingStored: boolean;
    embeddingDimensions: number;
    preview: string;
    retrievalHints: string[];
    createdAt: string;
  }>;
  latestDiff: DocumentVersionDiff | null;
  recommendations: string[];
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

export type DocumentIndexSnapshotReport = {
  schemaVersion: "opspilot.document_index_snapshot.v1";
  generatedAt: string;
  status: "ready" | "degraded" | "empty";
  snapshotHash: string;
  pipeline: DocumentIndexExplainReport["pipeline"] & {
    snapshot: "document_chunk_manifest_v1";
  };
  summary: {
    totalDocuments: number;
    totalChunks: number;
    versionedDocuments: number;
    publicDocuments: number;
    teamDocuments: number;
    restrictedDocuments: number;
    totalContentLength: number;
    embeddingCoverageRatio: number;
    headingCoverageRatio: number;
    redactionCount: number;
    promptInjectionRiskCount: number;
    latestDocumentUpdatedAt: string | null;
    qualityStatus: DocumentIndexQualityReport["status"];
    qualityScore: number;
  };
  documents: Array<{
    id: string;
    path: string;
    title: string;
    visibility: string;
    teamSlug?: string | null;
    contentHash: string;
    chunkSetHash: string;
    latestVersion: number;
    versionCount: number;
    chunkCount: number;
    embeddingChunkCount: number;
    totalContentLength: number;
    headingChunkCount: number;
    redactionCount: number;
    promptInjectionRisk: boolean;
    updatedAt: string;
  }>;
  integrity: {
    algorithm: "sha256";
    canonicalization: "stable_json_v1";
    hash: string;
    includedFields: string[];
  };
  recommendations: string[];
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

export type DocumentRevalidationQueueReport = {
  schemaVersion: "opspilot.document_revalidation_queue.v1";
  generatedAt: string;
  status: "empty" | "ready" | "attention" | "critical";
  summary: {
    queueItemCount: number;
    affectedDocumentCount: number;
    affectedAnswerCount: number;
    highRiskItemCount: number;
    criticalItemCount: number;
    topSourceItemCount: number;
    humanReviewItemCount: number;
    restrictedItemCount: number;
    oldestStaleAnswerAt: string | null;
  };
  recommendations: string[];
  items: Array<{
    id: string;
    priority: "P0" | "P1" | "P2" | "P3";
    riskLevel: "low" | "medium" | "high" | "critical";
    reason: string;
    revalidationDueAt: string;
    staleAgeHours: number;
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
    answer: {
      id: string;
      questionId: string;
      question: string;
      answerPreview: string;
      confidence: number;
      needsHumanReview: boolean;
      createdAt: string;
    };
    source: {
      rank: number;
      score: number;
      chunkCount: number;
    };
    actions: string[];
    evidenceLinks: {
      documentImpact: string;
      replay: string;
      lineage: string;
      qualityGate: string;
    };
  }>;
};

export type DocumentRevalidationRunReport = {
  schemaVersion: "opspilot.document_revalidation_run.v1";
  runId: string;
  generatedAt: string;
  status: "cleared" | "needs_review" | "blocked";
  queueItem: DocumentRevalidationQueueReport["items"][number];
  decision: {
    label: string;
    recommendedAction: "close_queue_item" | "assign_human_reviewer" | "block_answer_and_rewrite";
    reasons: string[];
  };
  summary: {
    replayStatus: AnswerReplay["status"];
    qualityGateStatus: AnswerQualityGate["status"];
    lineageStatus: AnswerLineageGraph["status"];
    topSourceChanged: boolean;
    sourceOverlapRatio: number;
    currentDocumentAgreement: number;
    permissionDeniedCandidates: number;
    sourceAccessRechecked: true;
    lineageIntegrityHash: string;
  };
  checks: Array<{
    id: "queue_item_stale" | "replay_stable" | "quality_gate" | "lineage_integrity" | "source_access_rechecked";
    label: string;
    status: "pass" | "warn" | "fail";
    evidence: string;
    metric?: number;
    threshold?: number;
  }>;
  artifacts: {
    replay: AnswerReplay;
    qualityGate: AnswerQualityGate;
    lineage: AnswerLineageGraph;
  };
  artifactHashes: {
    replay: string;
    qualityGate: string;
    lineage: string;
  };
  evidenceLinks: {
    queue: string;
    documentImpact: string;
    replay: string;
    lineage: string;
    qualityGate: string;
  };
  persistence: {
    stored: true;
    createdAt: string;
    reportHash: string;
  };
};

export type DocumentRevalidationRunHistoryReport = {
  schemaVersion: "opspilot.document_revalidation_run_history.v1";
  generatedAt: string;
  summary: {
    runCount: number;
    clearedCount: number;
    needsReviewCount: number;
    blockedCount: number;
    latestRunAt: string | null;
  };
  runs: Array<{
    id: string;
    createdAt: string;
    status: DocumentRevalidationRunReport["status"];
    document: {
      id: string;
      path: string;
      title: string;
    };
    answer: {
      id: string;
      questionId: string | null;
      question: string | null;
    };
    actor: Record<string, unknown>;
    decision: DocumentRevalidationRunReport["decision"];
    summary: DocumentRevalidationRunReport["summary"];
    checks: DocumentRevalidationRunReport["checks"];
    evidenceLinks: DocumentRevalidationRunReport["evidenceLinks"];
    artifactHashes: DocumentRevalidationRunReport["artifactHashes"];
    reportHash: string;
  }>;
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly orm: MikroORM,
    private readonly chunker: ChunkerService,
    private readonly embeddings: EmbeddingService,
    private readonly elasticsearch: ElasticsearchService,
    private readonly redaction: RedactionService,
    private readonly answerTraceService: AnswerTraceService
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

  async ingestSource(input: IngestDocumentSourceDto): Promise<IngestedDocumentSource> {
    const normalized = await normalizeSourceInput(input);
    const markdown = buildMarkdownDocument({
      title: normalized.title,
      visibility: input.visibility ?? "public",
      teamSlug: input.teamSlug,
      sourceType: input.sourceType,
      sourceUrl: input.url,
      fileName: input.fileName,
      body: normalized.markdown
    });
    const path = input.path ?? buildSourcePath(input.sourceType, normalized.title, input.fileName, input.url);
    const quality = this.analyzeSourceIngestionQuality({
      path,
      markdown,
      extractedMarkdown: normalized.markdown
    });
    const ingested = await this.ingestMarkdown(path, markdown);

    return {
      sourceType: input.sourceType,
      path: ingested.path,
      title: ingested.title,
      chunks: ingested.chunks,
      changed: ingested.changed,
      extractedCharacters: normalized.markdown.length,
      parser: normalized.parser,
      provenance: {
        schemaVersion: "opspilot.source_ingestion_provenance.v1",
        received: {
          sourceType: input.sourceType,
          url: input.url,
          fileName: input.fileName
        },
        extraction: {
          parser: normalized.parser,
          title: normalized.title,
          contentType: normalized.contentType,
          byteLength: normalized.byteLength,
          extractedHash: sha256(normalized.markdown),
          finalUrl: normalized.finalUrl
        },
        storage: {
          path: ingested.path,
          contentHash: ingested.contentHash,
          chunkCount: ingested.chunks,
          changed: ingested.changed,
          visibility: input.visibility ?? "public",
          teamSlug: input.teamSlug
        },
        safety: {
          privateUrlAllowed: process.env.SOURCE_INGESTION_ALLOW_PRIVATE_URLS === "true",
          urlGuard: input.sourceType === "url" ? "ssrf_private_network_block_v1" : "not_applicable"
        }
      },
      quality
    };
  }

  async resetDocuments(reloadSeed = false): Promise<ResetDocumentsResult> {
    const connection = this.orm.em.fork().getConnection();
    const [counts] = (await connection.execute<
      Array<{
        documents: number | string;
        chunks: number | string;
        versions: number | string;
        answer_sources: number | string;
        revalidation_runs: number | string;
      }>
    >(
      `
        select
          (select count(*) from documents)::int as documents,
          (select count(*) from document_chunks)::int as chunks,
          (select count(*) from document_versions)::int as versions,
          (select count(*) from answer_sources)::int as answer_sources,
          (select count(*) from document_revalidation_runs)::int as revalidation_runs;
      `
    )) as Array<{
      documents: number | string;
      chunks: number | string;
      versions: number | string;
      answer_sources: number | string;
      revalidation_runs: number | string;
    }>;

    await connection.execute("delete from documents;");
    await this.elasticsearch.clearAllChunks();

    const seed = reloadSeed ? await this.ingestSeedDocuments() : undefined;

    return {
      deleted: {
        documents: Number(counts?.documents ?? 0),
        chunks: Number(counts?.chunks ?? 0),
        versions: Number(counts?.versions ?? 0),
        answerSources: Number(counts?.answer_sources ?? 0),
        revalidationRuns: Number(counts?.revalidation_runs ?? 0)
      },
      reloadedSeed: reloadSeed,
      seed
    };
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

  async getIndexExplainReport(documentId: string): Promise<DocumentIndexExplainReport | null> {
    const connection = this.orm.em.fork().getConnection();
    const history = await this.getVersionHistory(documentId);
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
          count(distinct c.id)::int as "chunkCount",
          coalesce(max(v.version), 0)::int as "latestVersion",
          d.updated_at as "updatedAt"
        from documents d
        left join document_chunks c on c.document_id = d.id
        left join document_versions v on v.document_id = d.id
        where d.id = ?::uuid
        group by d.id;
      `,
      [documentId]
    )) as DocumentInventoryRow[];

    if (!document) {
      return null;
    }

    const chunkRows = (await connection.execute<DocumentIndexExplainChunkRow[]>(
      `
        select
          c.id,
          c.chunk_index as "chunkIndex",
          c.content,
          char_length(c.content)::int as "contentLength",
          c.metadata ->> 'heading' as heading,
          c.embedding is not null as "embeddingStored",
          cardinality(string_to_array(trim(both '[]' from c.embedding::text), ','))::int as "embeddingDimensions",
          c.created_at as "createdAt"
        from document_chunks c
        where c.document_id = ?::uuid
        order by c.chunk_index asc;
      `,
      [documentId]
    )) as DocumentIndexExplainChunkRow[];

    const chunks = chunkRows.map((chunk) => {
      const content = chunk.content.trim();
      const heading = chunk.heading && chunk.heading.trim().length > 0 ? chunk.heading : null;
      const contentLength = Number(chunk.contentLength);
      return {
        id: chunk.id,
        chunkIndex: Number(chunk.chunkIndex),
        heading,
        contentLength,
        tokenEstimate: estimateTokenCount(content),
        embeddingStored: chunk.embeddingStored,
        embeddingDimensions: Number(chunk.embeddingDimensions),
        preview: previewText(content),
        retrievalHints: buildChunkRetrievalHints({ heading, content }),
        createdAt: toIsoString(chunk.createdAt)
      };
    });

    const chunkCount = chunks.length;
    const totalContentLength = chunks.reduce((sum, chunk) => sum + chunk.contentLength, 0);
    const headingChunks = chunks.filter((chunk) => chunk.heading);
    const headingCoverageRatio = chunkCount === 0 ? 0 : headingChunks.length / chunkCount;
    const embeddingCoverageRatio =
      chunkCount === 0 ? 0 : chunks.filter((chunk) => chunk.embeddingStored && chunk.embeddingDimensions === 64).length / chunkCount;
    const latestDiffChangedLineCount =
      (history?.latestDiff?.addedLineCount ?? 0) + (history?.latestDiff?.removedLineCount ?? 0);
    const redactionCount = getSecurityNumber(document.metadata, "redactionCount");
    const promptInjectionRisk = getSecurityBoolean(document.metadata, "promptInjectionRisk");
    const maxChunkLength = Math.max(0, ...chunks.map((chunk) => chunk.contentLength));
    const minChunkLength = chunks.length > 0 ? Math.min(...chunks.map((chunk) => chunk.contentLength)) : 0;
    const avgChunkLength = chunkCount === 0 ? 0 : totalContentLength / chunkCount;
    const summary = {
      chunkCount,
      totalContentLength,
      avgChunkLength,
      maxChunkLength,
      minChunkLength,
      headingCoverageRatio,
      uniqueHeadingCount: new Set(headingChunks.map((chunk) => chunk.heading)).size,
      latestDiffChangedLineCount,
      searchReady: chunkCount > 0 && embeddingCoverageRatio === 1,
      embeddingCoverageRatio,
      redactionCount,
      promptInjectionRisk
    };

    return {
      schemaVersion: "opspilot.document_index_explain.v1",
      generatedAt: new Date().toISOString(),
      document: {
        id: document.id,
        path: document.path,
        title: document.title,
        visibility: document.visibility,
        teamSlug: document.teamSlug,
        latestVersion: Number(document.latestVersion),
        updatedAt: toIsoString(document.updatedAt),
        contentHash: document.contentHash,
        metadata: document.metadata
      },
      pipeline: {
        source: "markdown",
        parser: "frontmatter_markdown_v1",
        redaction: "security_redaction_v1",
        chunking: "heading_paragraph_window_v1",
        embedding: "local_hash_embedding_64d",
        vectorStore: "pgvector_hnsw",
        lexicalMirror: "optional_elasticsearch"
      },
      summary,
      checks: buildIndexExplainChecks(summary, Number(document.latestVersion)),
      headingOutline: buildHeadingOutline(chunks),
      chunks,
      latestDiff: history?.latestDiff ?? null,
      recommendations: buildIndexExplainRecommendations(summary)
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

  async getIndexSnapshot(): Promise<DocumentIndexSnapshotReport> {
    const connection = this.orm.em.fork().getConnection();
    const [quality, rows] = await Promise.all([
      this.getIndexQualityReport(),
      connection.execute<DocumentIndexSnapshotRow[]>(`
        with chunk_stats as (
          select
            c.document_id,
            count(*)::int as chunk_count,
            count(*) filter (where c.embedding is not null)::int as embedding_chunk_count,
            coalesce(sum(char_length(c.content)), 0)::int as total_content_length,
            count(*) filter (where coalesce(c.metadata ->> 'heading', '') <> '')::int as heading_chunk_count,
            encode(
              digest(
                coalesce(
                  string_agg(
                    c.chunk_index::text || ':' || encode(digest(coalesce(c.content, ''), 'sha256'), 'hex'),
                    '|' order by c.chunk_index
                  ),
                  ''
                ),
                'sha256'
              ),
              'hex'
            ) as chunk_set_hash
          from document_chunks c
          group by c.document_id
        ),
        version_stats as (
          select
            v.document_id,
            coalesce(max(v.version), 0)::int as latest_version,
            count(*)::int as version_count
          from document_versions v
          group by v.document_id
        )
        select
          d.id::text as id,
          d.path,
          d.title,
          d.visibility,
          d.team_slug as "teamSlug",
          d.content_hash as "contentHash",
          d.metadata,
          d.updated_at as "updatedAt",
          coalesce(cs.chunk_count, 0)::int as "chunkCount",
          coalesce(cs.embedding_chunk_count, 0)::int as "embeddingChunkCount",
          coalesce(cs.total_content_length, 0)::int as "totalContentLength",
          coalesce(cs.heading_chunk_count, 0)::int as "headingChunkCount",
          coalesce(cs.chunk_set_hash, encode(digest('', 'sha256'), 'hex')) as "chunkSetHash",
          coalesce(vs.latest_version, 0)::int as "latestVersion",
          coalesce(vs.version_count, 0)::int as "versionCount"
        from documents d
        left join chunk_stats cs on cs.document_id = d.id
        left join version_stats vs on vs.document_id = d.id
        order by d.path asc;
      `)
    ]);
    const documents = (rows as DocumentIndexSnapshotRow[]).map((row) => ({
      id: row.id,
      path: row.path,
      title: row.title,
      visibility: row.visibility,
      teamSlug: row.teamSlug,
      contentHash: row.contentHash,
      chunkSetHash: row.chunkSetHash,
      latestVersion: Number(row.latestVersion),
      versionCount: Number(row.versionCount),
      chunkCount: Number(row.chunkCount),
      embeddingChunkCount: Number(row.embeddingChunkCount),
      totalContentLength: Number(row.totalContentLength),
      headingChunkCount: Number(row.headingChunkCount),
      redactionCount: getSecurityNumber(row.metadata, "redactionCount"),
      promptInjectionRisk: getSecurityBoolean(row.metadata, "promptInjectionRisk"),
      updatedAt: toIsoString(row.updatedAt)
    }));
    const totalChunks = documents.reduce((sum, document) => sum + document.chunkCount, 0);
    const embeddingChunks = documents.reduce((sum, document) => sum + document.embeddingChunkCount, 0);
    const headingChunks = documents.reduce((sum, document) => sum + document.headingChunkCount, 0);
    const latestDocumentUpdatedAt = documents
      .map((document) => document.updatedAt)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
    const summary = {
      totalDocuments: documents.length,
      totalChunks,
      versionedDocuments: documents.filter((document) => document.versionCount > 0).length,
      publicDocuments: documents.filter((document) => document.visibility === "public").length,
      teamDocuments: documents.filter((document) => document.visibility === "team").length,
      restrictedDocuments: documents.filter((document) => document.visibility === "restricted").length,
      totalContentLength: documents.reduce((sum, document) => sum + document.totalContentLength, 0),
      embeddingCoverageRatio: totalChunks === 0 ? 0 : embeddingChunks / totalChunks,
      headingCoverageRatio: totalChunks === 0 ? 0 : headingChunks / totalChunks,
      redactionCount: documents.reduce((sum, document) => sum + document.redactionCount, 0),
      promptInjectionRiskCount: documents.filter((document) => document.promptInjectionRisk).length,
      latestDocumentUpdatedAt,
      qualityStatus: quality.status,
      qualityScore: quality.score
    };
    const pipeline = {
      source: "markdown" as const,
      parser: "frontmatter_markdown_v1" as const,
      redaction: "security_redaction_v1" as const,
      chunking: "heading_paragraph_window_v1" as const,
      embedding: "local_hash_embedding_64d" as const,
      vectorStore: "pgvector_hnsw" as const,
      lexicalMirror: "optional_elasticsearch" as const,
      snapshot: "document_chunk_manifest_v1" as const
    };
    const status = documents.length === 0 ? "empty" : quality.status === "critical" ? "degraded" : "ready";
    const hashBasis = {
      schemaVersion: "opspilot.document_index_snapshot.v1",
      status,
      pipeline,
      summary,
      documents
    };
    const snapshotHash = sha256(stableStringify(hashBasis));

    return {
      schemaVersion: "opspilot.document_index_snapshot.v1",
      generatedAt: new Date().toISOString(),
      status,
      snapshotHash,
      pipeline,
      summary,
      documents,
      integrity: {
        algorithm: "sha256",
        canonicalization: "stable_json_v1",
        hash: snapshotHash,
        includedFields: ["status", "pipeline", "summary", "documents.contentHash", "documents.chunkSetHash", "documents.latestVersion"]
      },
      recommendations: buildIndexSnapshotRecommendations({ status, summary })
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

  async getRevalidationQueue(limit = 50): Promise<DocumentRevalidationQueueReport> {
    const connection = this.orm.em.fork().getConnection();
    const rows = (await connection.execute<DocumentRevalidationQueueRow[]>(
      `
        with source_rows as (
          select
            d.id as document_id,
            d.path as document_path,
            d.title as document_title,
            d.visibility,
            d.team_slug,
            d.content_hash,
            d.updated_at as document_updated_at,
            coalesce(max(v.version), 0)::int as latest_version,
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
          join documents d on d.id = s.document_id
          join answers a on a.id = s.answer_id
          join questions q on q.id = a.question_id
          left join document_versions v on v.document_id = d.id
          where a.created_at < d.updated_at
          group by d.id, a.id, q.id, s.rank, s.score, s.chunk_id
          union all
          select
            d.id as document_id,
            d.path as document_path,
            d.title as document_title,
            d.visibility,
            d.team_slug,
            d.content_hash,
            d.updated_at as document_updated_at,
            coalesce(max(v.version), 0)::int as latest_version,
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
          join documents d on d.id::text = source.value ->> 'documentId'
          left join document_versions v on v.document_id = d.id
          where a.created_at < d.updated_at
          group by d.id, a.id, q.id, source.value
        )
        select
          document_id as "documentId",
          document_path as "documentPath",
          document_title as "documentTitle",
          visibility,
          team_slug as "teamSlug",
          content_hash as "contentHash",
          latest_version as "latestVersion",
          document_updated_at as "documentUpdatedAt",
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
        group by
          document_id,
          document_path,
          document_title,
          visibility,
          team_slug,
          content_hash,
          latest_version,
          document_updated_at,
          answer_id,
          question_id,
          question,
          answer_text,
          confidence,
          needs_human_review,
          created_at
        order by document_updated_at desc, created_at asc
        limit ?;
      `,
      [limit]
    )) as DocumentRevalidationQueueRow[];

    const now = Date.now();
    const items = rows
      .map((row) => {
        const answerCreatedAt = toIsoString(row.answerCreatedAt);
        const documentUpdatedAt = toIsoString(row.documentUpdatedAt);
        const staleAgeHours = Math.max(0, Math.round((new Date(documentUpdatedAt).getTime() - new Date(answerCreatedAt).getTime()) / 36_000) / 100);
        const riskLevel = buildRevalidationRiskLevel({
          confidence: Number(row.confidence),
          needsHumanReview: row.needsHumanReview,
          sourceRank: Number(row.sourceRank),
          sourceChunkCount: Number(row.sourceChunkCount),
          visibility: row.visibility
        });
        const priority = revalidationPriority(riskLevel);
        return {
          id: `${row.documentId}:${row.answerId}`,
          priority,
          riskLevel,
          reason: buildRevalidationReason({
            riskLevel,
            visibility: row.visibility,
            needsHumanReview: row.needsHumanReview,
            sourceRank: Number(row.sourceRank),
            sourceChunkCount: Number(row.sourceChunkCount)
          }),
          revalidationDueAt: new Date(now + revalidationDueHours(riskLevel) * 60 * 60 * 1000).toISOString(),
          staleAgeHours,
          document: {
            id: row.documentId,
            path: row.documentPath,
            title: row.documentTitle,
            visibility: row.visibility,
            teamSlug: row.teamSlug,
            latestVersion: Number(row.latestVersion),
            updatedAt: documentUpdatedAt,
            contentHash: row.contentHash
          },
          answer: {
            id: row.answerId,
            questionId: row.questionId,
            question: row.question,
            answerPreview: row.answerPreview,
            confidence: Number(row.confidence),
            needsHumanReview: row.needsHumanReview,
            createdAt: answerCreatedAt
          },
          source: {
            rank: Number(row.sourceRank),
            score: Number(row.sourceScore),
            chunkCount: Number(row.sourceChunkCount)
          },
          actions: buildRevalidationActions({
            riskLevel,
            needsHumanReview: row.needsHumanReview,
            sourceRank: Number(row.sourceRank),
            visibility: row.visibility
          }),
          evidenceLinks: {
            documentImpact: `/documents/${row.documentId}/impact`,
            replay: `/answers/${row.answerId}/replay`,
            lineage: `/answers/${row.answerId}/lineage`,
            qualityGate: `/answers/${row.answerId}/quality-gate`
          }
        };
      })
      .sort((left, right) => {
        const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
        return priorityOrder[left.priority] - priorityOrder[right.priority] || right.staleAgeHours - left.staleAgeHours;
      });

    const affectedDocumentIds = new Set(items.map((item) => item.document.id));
    const affectedAnswerIds = new Set(items.map((item) => item.answer.id));
    const criticalItemCount = items.filter((item) => item.riskLevel === "critical").length;
    const highRiskItemCount = items.filter((item) => item.riskLevel === "critical" || item.riskLevel === "high").length;
    const topSourceItemCount = items.filter((item) => item.source.rank === 1).length;
    const humanReviewItemCount = items.filter((item) => item.answer.needsHumanReview).length;
    const restrictedItemCount = items.filter((item) => item.document.visibility === "restricted").length;
    const oldestStaleAnswerAt =
      items.length === 0
        ? null
        : [...items].sort((left, right) => new Date(left.answer.createdAt).getTime() - new Date(right.answer.createdAt).getTime())[0].answer.createdAt;
    const status = revalidationQueueStatus({ itemCount: items.length, highRiskItemCount, criticalItemCount });

    return {
      schemaVersion: "opspilot.document_revalidation_queue.v1",
      generatedAt: new Date().toISOString(),
      status,
      summary: {
        queueItemCount: items.length,
        affectedDocumentCount: affectedDocumentIds.size,
        affectedAnswerCount: affectedAnswerIds.size,
        highRiskItemCount,
        criticalItemCount,
        topSourceItemCount,
        humanReviewItemCount,
        restrictedItemCount,
        oldestStaleAnswerAt
      },
      recommendations: buildRevalidationQueueRecommendations({
        itemCount: items.length,
        highRiskItemCount,
        criticalItemCount,
        topSourceItemCount,
        humanReviewItemCount,
        restrictedItemCount
      }),
      items
    };
  }

  async listRevalidationRuns(limit = 20): Promise<DocumentRevalidationRunHistoryReport> {
    const normalizedLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
    const connection = this.orm.em.fork().getConnection();
    const rows = (await connection.execute<DocumentRevalidationRunRow[]>(
      `
        select
          r.id::text as id,
          d.id::text as "documentId",
          d.path as "documentPath",
          d.title as "documentTitle",
          a.id::text as "answerId",
          q.id::text as "questionId",
          q.text as question,
          r.status,
          r.recommended_action as "recommendedAction",
          r.actor,
          r.queue_item as "queueItem",
          r.decision,
          r.summary,
          r.checks,
          r.evidence_links as "evidenceLinks",
          r.artifact_hashes as "artifactHashes",
          r.report_hash as "reportHash",
          r.created_at as "createdAt"
        from document_revalidation_runs r
        join documents d on d.id = r.document_id
        join answers a on a.id = r.answer_id
        left join questions q on q.id = r.question_id
        order by r.created_at desc, r.id desc
        limit ?;
      `,
      [normalizedLimit]
    )) as DocumentRevalidationRunRow[];
    const runs = rows.map((row) => ({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      status: row.status,
      document: {
        id: row.documentId,
        path: row.documentPath,
        title: row.documentTitle
      },
      answer: {
        id: row.answerId,
        questionId: row.questionId,
        question: row.question
      },
      actor: normalizeRecord(row.actor),
      decision: row.decision,
      summary: row.summary,
      checks: row.checks,
      evidenceLinks: row.evidenceLinks,
      artifactHashes: row.artifactHashes,
      reportHash: row.reportHash
    }));

    return {
      schemaVersion: "opspilot.document_revalidation_run_history.v1",
      generatedAt: new Date().toISOString(),
      summary: {
        runCount: runs.length,
        clearedCount: runs.filter((run) => run.status === "cleared").length,
        needsReviewCount: runs.filter((run) => run.status === "needs_review").length,
        blockedCount: runs.filter((run) => run.status === "blocked").length,
        latestRunAt: runs[0]?.createdAt ?? null
      },
      runs
    };
  }

  async runRevalidation(input: RunDocumentRevalidationDto, context: RequestContext): Promise<DocumentRevalidationRunReport> {
    const queue = await this.getRevalidationQueue(5_000);
    const queueItem = queue.items.find((item) => item.document.id === input.documentId && item.answer.id === input.answerId);
    if (!queueItem) {
      throw new NotFoundException(`Revalidation queue item not found for document ${input.documentId} and answer ${input.answerId}`);
    }

    const [replay, qualityGate, lineage] = await Promise.all([
      this.answerTraceService.replay(input.answerId, context),
      this.answerTraceService.getQualityGate(input.answerId, context),
      this.answerTraceService.getLineageGraph(input.answerId, context)
    ]);
    const status = revalidationRunStatus({ replay, qualityGate });
    const checks = buildRevalidationRunChecks({ queueItem, replay, qualityGate, lineage });
    const decision = buildRevalidationRunDecision({ status, checks });
    const summary = {
      replayStatus: replay.status,
      qualityGateStatus: qualityGate.status,
      lineageStatus: lineage.status,
      topSourceChanged: replay.summary.topSourceChanged,
      sourceOverlapRatio: replay.summary.sourceOverlapRatio,
      currentDocumentAgreement: replay.summary.currentDocumentAgreement,
      permissionDeniedCandidates: replay.summary.permissionDeniedCandidates,
      sourceAccessRechecked: true as const,
      lineageIntegrityHash: lineage.integrity.hash
    };
    const artifactHashes = {
      replay: sha256(stableStringify(replay)),
      qualityGate: sha256(stableStringify(qualityGate)),
      lineage: sha256(stableStringify(lineage))
    };
    const evidenceLinks = {
      queue: "/documents/revalidation-queue",
      documentImpact: queueItem.evidenceLinks.documentImpact,
      replay: queueItem.evidenceLinks.replay,
      lineage: queueItem.evidenceLinks.lineage,
      qualityGate: queueItem.evidenceLinks.qualityGate
    };
    const unsignedReport = {
      schemaVersion: "opspilot.document_revalidation_run.v1" as const,
      generatedAt: new Date().toISOString(),
      status,
      queueItem,
      decision,
      summary,
      checks,
      artifactHashes,
      evidenceLinks
    };
    const reportHash = sha256(stableStringify(unsignedReport));
    const connection = this.orm.em.fork().getConnection();
    const [stored] = await connection.execute<{ id: string; created_at: Date | string }[]>(
      `
        insert into document_revalidation_runs (
          document_id,
          answer_id,
          question_id,
          status,
          recommended_action,
          actor,
          queue_item,
          decision,
          summary,
          checks,
          evidence_links,
          artifact_hashes,
          report_hash
        )
        values (?::uuid, ?::uuid, ?::uuid, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?)
        returning id::text, created_at;
      `,
      [
        queueItem.document.id,
        queueItem.answer.id,
        queueItem.answer.questionId,
        status,
        decision.recommendedAction,
        JSON.stringify(actorSnapshot(context)),
        JSON.stringify(queueItem),
        JSON.stringify(decision),
        JSON.stringify(summary),
        JSON.stringify(checks),
        JSON.stringify(evidenceLinks),
        JSON.stringify(artifactHashes),
        reportHash
      ]
    );
    if (!stored) {
      throw new Error("Document revalidation run was not persisted");
    }

    return {
      ...unsignedReport,
      runId: stored.id,
      artifacts: {
        replay,
        qualityGate,
        lineage
      },
      persistence: {
        stored: true,
        createdAt: toIsoString(stored.created_at),
        reportHash
      }
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
      changed,
      contentHash
    };
  }

  private analyzeSourceIngestionQuality(input: {
    path: string;
    markdown: string;
    extractedMarkdown: string;
  }): SourceIngestionQualityReport {
    const parsed = parseMarkdownDocument(input.path, input.markdown);
    const redacted = this.redaction.redactMarkdown(parsed.body);
    const chunks = this.chunker.chunk(redacted.content);
    const chunkLengths = chunks.map((chunk) => chunk.content.trim().length);
    const chunkCount = chunks.length;
    const avgChunkLength = chunkCount === 0 ? 0 : chunkLengths.reduce((sum, length) => sum + length, 0) / chunkCount;
    const maxChunkLength = Math.max(0, ...chunkLengths);
    const headingCoverageRatio = chunkCount === 0 ? 0 : chunks.filter((chunk) => chunk.heading && chunk.heading.trim().length > 0).length / chunkCount;
    const retrievalHints = new Set(chunks.flatMap((chunk) => buildChunkRetrievalHints({ heading: chunk.heading, content: chunk.content })));
    const summary: SourceIngestionQualityReport["summary"] = {
      extractedCharacters: input.extractedMarkdown.length,
      normalizedCharacters: redacted.content.length,
      chunkCount,
      avgChunkLength,
      maxChunkLength,
      headingCoverageRatio,
      retrievalHintCount: retrievalHints.size,
      redactionCount: redacted.redactionCount,
      promptInjectionRisk: redacted.promptInjection.risk
    };
    const checks = buildSourceIngestionQualityChecks(summary);
    const failedRequiredCheck = checks.some((check) => check.status === "fail" && check.id === "chunk_generation");
    const status: SourceIngestionQualityReport["status"] = failedRequiredCheck
      ? "blocked"
      : checks.some((check) => check.status !== "pass")
        ? "attention"
        : "ready";
    const score = Number(
      (checks.reduce((sum, check) => sum + (check.status === "pass" ? 1 : check.status === "warn" ? 0.5 : 0), 0) / checks.length).toFixed(3)
    );

    return {
      schemaVersion: "opspilot.source_ingestion_quality.v1",
      status,
      score,
      summary,
      checks,
      recommendations: buildSourceIngestionQualityRecommendations(summary, status),
      searchTestQuery: buildSourceIngestionSearchQuery(parsed.metadata.title, retrievalHints),
      suggestedQuestions: buildSourceIngestionSuggestedQuestions(parsed.metadata.title, retrievalHints)
    };
  }
}

async function normalizeSourceInput(input: IngestDocumentSourceDto): Promise<{
  title: string;
  markdown: string;
  parser: IngestedDocumentSource["parser"];
  contentType: string;
  byteLength: number;
  finalUrl?: string;
}> {
  if (input.sourceType === "url") {
    if (!input.url) {
      throw new BadRequestException("url source requires url");
    }
    const response = await fetchAllowedSourceUrl(input.url);
    if (!response.ok) {
      throw new BadRequestException(`URL fetch failed: ${response.status}`);
    }
    const raw = await readBoundedResponse(response, 2_000_000);
    const contentType = response.headers.get("content-type") ?? "";
    const text = contentType.includes("html") ? htmlToText(raw) : raw;
    return normalizeExtractedText({
      title: input.title ?? extractHtmlTitle(raw) ?? urlToTitle(input.url),
      text,
      parser: contentType.includes("html") ? "html_text_v1" : "plain_text_v1",
      contentType: contentType || "application/octet-stream",
      byteLength: Buffer.byteLength(raw, "utf8"),
      finalUrl: response.url || input.url
    });
  }

  if (input.sourceType === "pdf") {
    const buffer = decodeBase64File(input.base64, "pdf");
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    return normalizeExtractedText({
      title: input.title ?? fileNameToTitle(input.fileName) ?? "PDF 문서",
      text: parsed.text,
      parser: "pdf_text_v1",
      contentType: "application/pdf",
      byteLength: buffer.length
    });
  }

  if (input.sourceType === "docx") {
    const buffer = decodeBase64File(input.base64, "docx");
    const mammoth = await import("mammoth");
    const parsed = await mammoth.extractRawText({ buffer });
    return normalizeExtractedText({
      title: input.title ?? fileNameToTitle(input.fileName) ?? "Word 문서",
      text: parsed.value,
      parser: "docx_text_v1",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      byteLength: buffer.length
    });
  }

  if (!input.content) {
    throw new BadRequestException(`${input.sourceType} source requires content`);
  }

  if (input.sourceType === "markdown") {
    const stripped = stripFrontmatter(input.content);
    return normalizeExtractedText({
      title: input.title ?? stripped.title ?? firstMarkdownHeading(stripped.body) ?? fileNameToTitle(input.fileName) ?? "Markdown 문서",
      text: stripped.body,
      parser: "markdown_passthrough_v1",
      contentType: "text/markdown",
      byteLength: Buffer.byteLength(input.content, "utf8")
    });
  }

  return normalizeExtractedText({
    title: input.title ?? fileNameToTitle(input.fileName) ?? "텍스트 문서",
    text: input.content,
    parser: "plain_text_v1",
    contentType: "text/plain",
    byteLength: Buffer.byteLength(input.content, "utf8")
  });
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<string> {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new BadRequestException(`URL content is too large. Max ${maxBytes} bytes.`);
  }
  return text;
}

async function fetchAllowedSourceUrl(rawUrl: string, redirectCount = 0): Promise<Response> {
  if (redirectCount > 3) {
    throw new BadRequestException("URL fetch redirect limit exceeded");
  }

  const url = parseSourceUrl(rawUrl);
  await assertSourceUrlAllowed(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { redirect: "manual", signal: controller.signal });
    if (isRedirectStatus(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new BadRequestException("URL redirect response did not include a location header");
      }
      return fetchAllowedSourceUrl(new URL(location, url).toString(), redirectCount + 1);
    }
    return response;
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    const message = error instanceof Error && error.name === "AbortError" ? "URL fetch timed out" : `URL fetch failed: ${formatErrorMessage(error)}`;
    throw new BadRequestException(message);
  } finally {
    clearTimeout(timeout);
  }
}

function parseSourceUrl(rawUrl: string): URL {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new BadRequestException("URL source only supports http and https");
    }
    if (!url.hostname) {
      throw new BadRequestException("URL source requires a hostname");
    }
    return url;
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException("URL source is invalid");
  }
}

async function assertSourceUrlAllowed(url: URL): Promise<void> {
  if (process.env.SOURCE_INGESTION_ALLOW_PRIVATE_URLS === "true") {
    return;
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new BadRequestException("URL source cannot target localhost unless SOURCE_INGESTION_ALLOW_PRIVATE_URLS=true");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true }).catch(() => {
        throw new BadRequestException("URL source hostname could not be resolved");
      });

  if (addresses.length === 0) {
    throw new BadRequestException("URL source hostname could not be resolved");
  }

  for (const { address } of addresses) {
    if (isPrivateNetworkAddress(address)) {
      throw new BadRequestException("URL source cannot target private, loopback, link-local, multicast, or unspecified addresses");
    }
  }
}

function isPrivateNetworkAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [first, second] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    if (lower.startsWith("::ffff:")) {
      return isPrivateNetworkAddress(lower.slice("::ffff:".length));
    }
    const firstSegment = lower.split(":")[0];
    return lower === "::" || lower === "::1" || firstSegment === "fc00" || firstSegment === "fd00" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }

  return true;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeExtractedText(input: {
  title: string;
  text: string;
  parser: IngestedDocumentSource["parser"];
  contentType: string;
  byteLength: number;
  finalUrl?: string;
}): {
  title: string;
  markdown: string;
  parser: IngestedDocumentSource["parser"];
  contentType: string;
  byteLength: number;
  finalUrl?: string;
} {
  const markdown = input.text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (markdown.length < 10) {
    throw new BadRequestException("문서에서 색인할 수 있는 텍스트를 충분히 추출하지 못했습니다.");
  }

  return {
    title: input.title.trim() || "문서",
    markdown,
    parser: input.parser,
    contentType: input.contentType,
    byteLength: input.byteLength,
    finalUrl: input.finalUrl
  };
}

function buildMarkdownDocument(input: {
  title: string;
  visibility: "public" | "team" | "restricted";
  teamSlug?: string;
  sourceType: DocumentSourceType;
  sourceUrl?: string;
  fileName?: string;
  body: string;
}): string {
  const frontmatter = [
    "---",
    `title: "${escapeFrontmatterValue(input.title)}"`,
    `visibility: ${input.visibility}`,
    input.teamSlug ? `teamSlug: ${input.teamSlug}` : null,
    `tags: ingestion,${input.sourceType}`,
    `sourceType: ${input.sourceType}`,
    input.sourceUrl ? `sourceUrl: "${escapeFrontmatterValue(input.sourceUrl)}"` : null,
    input.fileName ? `fileName: "${escapeFrontmatterValue(input.fileName)}"` : null,
    "---"
  ].filter(Boolean);

  const body = input.body.startsWith("#") ? input.body : `# ${input.title}\n\n${input.body}`;
  return `${frontmatter.join("\n")}\n\n${body}`;
}

function decodeBase64File(base64: string | undefined, sourceType: "pdf" | "docx"): Buffer {
  if (!base64) {
    throw new BadRequestException(`${sourceType} source requires base64`);
  }
  const normalized = base64.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(normalized, "base64");
  if (buffer.length === 0) {
    throw new BadRequestException(`${sourceType} file is empty`);
  }
  if (buffer.length > 10_000_000) {
    throw new BadRequestException(`${sourceType} file is too large. Max 10MB.`);
  }
  return buffer;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(h[1-6]|p|li|div|section|article|br)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractHtmlTitle(html: string): string | null {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function stripFrontmatter(markdown: string): { title?: string; body: string } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { body: markdown.trim() };
  }
  const title = match[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
  return { title, body: match[2].trim() };
}

function firstMarkdownHeading(markdown: string): string | null {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || null;
}

function buildSourcePath(sourceType: DocumentSourceType, title: string, fileName?: string, url?: string): string {
  const baseName = fileNameToTitle(fileName) ?? (url ? urlToTitle(url) : title);
  return `public/uploads/${slugify(baseName)}-${sourceType}.md`;
}

function fileNameToTitle(fileName?: string): string | null {
  if (!fileName) {
    return null;
  }
  const stem = fileName.split(/[\\/]/).pop()?.replace(/\.[a-z0-9]+$/i, "").trim();
  return stem || null;
}

function urlToTitle(url: string): string {
  const parsed = new URL(url);
  const lastPath = parsed.pathname.split("/").filter(Boolean).pop();
  return lastPath?.replace(/[-_]+/g, " ") || parsed.hostname;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || `document-${Date.now()}`;
}

function escapeFrontmatterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function buildDocumentCheck(
  id: string,
  label: string,
  status: "pass" | "warn" | "fail",
  message: string
): DocumentIndexQualityReport["documents"][number]["checks"][number] {
  return { id, label, status, message };
}

function buildIndexExplainChecks(
  summary: DocumentIndexExplainReport["summary"],
  latestVersion: number
): DocumentIndexExplainReport["checks"] {
  return [
    {
      id: "chunks_present",
      label: "청크 생성",
      status: summary.chunkCount > 0 ? "pass" : "fail",
      metric: summary.chunkCount,
      threshold: 1,
      evidence: summary.chunkCount > 0 ? `검색 가능한 청크 ${summary.chunkCount}개가 생성됐습니다.` : "검색 가능한 청크가 없습니다."
    },
    {
      id: "embedding_coverage",
      label: "임베딩 커버리지",
      status: summary.embeddingCoverageRatio === 1 ? "pass" : summary.embeddingCoverageRatio > 0 ? "warn" : "fail",
      metric: summary.embeddingCoverageRatio,
      threshold: 1,
      evidence: `64차원 임베딩 저장 비율은 ${Math.round(summary.embeddingCoverageRatio * 100)}%입니다.`
    },
    {
      id: "heading_signal",
      label: "헤딩 신호",
      status: summary.headingCoverageRatio >= 0.5 ? "pass" : summary.headingCoverageRatio > 0 ? "warn" : "fail",
      metric: summary.headingCoverageRatio,
      threshold: 0.5,
      evidence: `헤딩이 보존된 청크 비율은 ${Math.round(summary.headingCoverageRatio * 100)}%입니다.`
    },
    {
      id: "chunk_size",
      label: "청크 크기",
      status: summary.maxChunkLength <= 1400 && summary.avgChunkLength >= 120 ? "pass" : "warn",
      metric: Math.round(summary.avgChunkLength),
      threshold: 120,
      evidence: `평균 ${Math.round(summary.avgChunkLength)}자, 최대 ${summary.maxChunkLength}자입니다.`
    },
    {
      id: "version_trace",
      label: "버전 추적",
      status: latestVersion > 0 ? "pass" : "fail",
      metric: latestVersion,
      threshold: 1,
      evidence: latestVersion > 0 ? `최신 버전 v${latestVersion}와 변경 라인 ${summary.latestDiffChangedLineCount}개를 추적합니다.` : "문서 버전 이력이 없습니다."
    },
    {
      id: "security_metadata",
      label: "보안 메타데이터",
      status: summary.promptInjectionRisk ? "warn" : "pass",
      metric: summary.redactionCount,
      threshold: 0,
      evidence: summary.promptInjectionRisk
        ? `프롬프트 주입 위험 문구가 감지됐고 마스킹 ${summary.redactionCount}건이 기록됐습니다.`
        : `마스킹 ${summary.redactionCount}건이 기록됐고 프롬프트 주입 위험은 없습니다.`
    }
  ];
}

function buildSourceIngestionQualityChecks(
  summary: SourceIngestionQualityReport["summary"]
): SourceIngestionQualityReport["checks"] {
  return [
    {
      id: "text_extraction",
      label: "텍스트 추출",
      status: summary.extractedCharacters >= 80 ? "pass" : summary.extractedCharacters >= 30 ? "warn" : "fail",
      metric: summary.extractedCharacters,
      threshold: 80,
      evidence:
        summary.extractedCharacters >= 80
          ? `추출 텍스트 ${summary.extractedCharacters}자를 확보했습니다.`
          : `추출 텍스트가 ${summary.extractedCharacters}자로 짧아 검색 신호가 약할 수 있습니다.`
    },
    {
      id: "chunk_generation",
      label: "청크 생성",
      status: summary.chunkCount > 0 ? "pass" : "fail",
      metric: summary.chunkCount,
      threshold: 1,
      evidence: summary.chunkCount > 0 ? `검색 가능한 청크 ${summary.chunkCount}개를 미리 계산했습니다.` : "검색 가능한 청크가 생성되지 않았습니다."
    },
    {
      id: "chunk_size",
      label: "청크 크기",
      status: summary.chunkCount === 0 ? "fail" : summary.avgChunkLength >= 120 && summary.maxChunkLength <= 1400 ? "pass" : "warn",
      metric: Math.round(summary.avgChunkLength),
      threshold: 120,
      evidence: `평균 ${Math.round(summary.avgChunkLength)}자, 최대 ${summary.maxChunkLength}자입니다.`
    },
    {
      id: "heading_signal",
      label: "헤딩 신호",
      status: summary.headingCoverageRatio >= 0.5 ? "pass" : summary.headingCoverageRatio > 0 ? "warn" : "warn",
      metric: summary.headingCoverageRatio,
      threshold: 0.5,
      evidence: `헤딩이 붙은 청크 비율은 ${Math.round(summary.headingCoverageRatio * 100)}%입니다.`
    },
    {
      id: "retrieval_hints",
      label: "검색 힌트",
      status: summary.retrievalHintCount >= 4 ? "pass" : summary.retrievalHintCount >= 2 ? "warn" : "fail",
      metric: summary.retrievalHintCount,
      threshold: 4,
      evidence: `제목, 헤딩, 본문에서 검색 힌트 ${summary.retrievalHintCount}개를 추출했습니다.`
    },
    {
      id: "security_scan",
      label: "보안 스캔",
      status: summary.promptInjectionRisk ? "warn" : "pass",
      metric: summary.redactionCount,
      threshold: 0,
      evidence: summary.promptInjectionRisk
        ? `프롬프트 주입 위험 문구가 감지됐고 마스킹 ${summary.redactionCount}건을 기록했습니다.`
        : `마스킹 ${summary.redactionCount}건, 프롬프트 주입 위험 없음으로 기록했습니다.`
    }
  ];
}

function buildSourceIngestionQualityRecommendations(
  summary: SourceIngestionQualityReport["summary"],
  status: SourceIngestionQualityReport["status"]
): string[] {
  const recommendations: string[] = [];

  if (summary.extractedCharacters < 80) {
    recommendations.push("추출 텍스트가 짧습니다. PDF/Word가 스캔 이미지라면 OCR 또는 원본 텍스트 문서를 사용하세요.");
  }
  if (summary.chunkCount === 0) {
    recommendations.push("검색 가능한 청크가 없으므로 문서 내용을 보강한 뒤 다시 등록하세요.");
  }
  if (summary.avgChunkLength < 120 && summary.chunkCount > 0) {
    recommendations.push("짧은 문단만 있는 문서는 관련 문단을 합쳐 검색 신호를 강화하세요.");
  }
  if (summary.maxChunkLength > 1400) {
    recommendations.push("긴 문서는 하위 헤딩이나 문단으로 나눠 답변 컨텍스트 오염을 줄이세요.");
  }
  if (summary.headingCoverageRatio < 0.5) {
    recommendations.push("Markdown 헤딩을 추가하면 청크 주제와 출처 근거를 더 명확히 보여줄 수 있습니다.");
  }
  if (summary.retrievalHintCount < 4) {
    recommendations.push("서비스명, 장애 코드, 정책명처럼 질문에 쓰일 키워드를 문서 본문에 명시하세요.");
  }
  if (summary.promptInjectionRisk) {
    recommendations.push("프롬프트 주입 문구가 있는 문서는 공개 범위를 제한하고 운영 검토 후 사용하세요.");
  }
  if (status === "ready" && recommendations.length === 0) {
    recommendations.push("수집 텍스트, 청크, 검색 힌트, 보안 스캔이 새 문서 테스트 기준을 충족합니다.");
  }

  return [...new Set(recommendations)].slice(0, 6);
}

function buildSourceIngestionSearchQuery(title: string, hints: Set<string>): string {
  const tokens: string[] = [];
  const seen = new Set<string>();

  for (const value of [title, ...hints]) {
    const token = value.trim();
    const key = token.toLowerCase();
    if (token.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    tokens.push(token);
  }

  return tokens.slice(0, 4).join(" ");
}

function buildSourceIngestionSuggestedQuestions(
  title: string,
  hints: Set<string>
): SourceIngestionQualityReport["suggestedQuestions"] {
  const keywords = uniqueQuestionKeywords(title, hints);
  const primary = keywords[0] ?? title;
  const secondary = keywords.find((keyword) => keyword !== primary) ?? title;
  const expectedEvidence = keywords.slice(0, 5);
  const subject = documentQuestionSubject(title);
  const questions = [
    {
      question: `${subject}는 무엇을 검증해?`,
      expectedEvidence,
      reason: "문서 제목과 핵심 키워드가 1순위 출처로 검색되는지 확인합니다."
    },
    {
      question: `${primary} 기준은 무엇이야?`,
      expectedEvidence: [primary, ...expectedEvidence.filter((keyword) => keyword !== primary)].slice(0, 5),
      reason: "문서 안의 대표 키워드로 RAG 검색이 연결되는지 확인합니다."
    },
    {
      question: `${secondary} 관련해서 운영자가 확인해야 할 핵심 내용은 뭐야?`,
      expectedEvidence: [secondary, ...expectedEvidence.filter((keyword) => keyword !== secondary)].slice(0, 5),
      reason: "실제 운영 질문처럼 물었을 때 출처 기반 답변이 나오는지 확인합니다."
    }
  ];

  const seenQuestions = new Set<string>();
  return questions
    .filter((item) => {
      const key = item.question.toLowerCase();
      if (seenQuestions.has(key)) {
        return false;
      }
      seenQuestions.add(key);
      return true;
    })
    .slice(0, 3);
}

function uniqueQuestionKeywords(title: string, hints: Set<string>): string[] {
  const keywords: string[] = [];
  const seen = new Set<string>();

  for (const value of [...hints, title]) {
    const keyword = value.trim();
    const key = keyword.toLowerCase();
    if (keyword.length < 2 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    keywords.push(keyword);
  }

  return keywords.slice(0, 8);
}

function documentQuestionSubject(title: string): string {
  const trimmed = title.trim() || "등록한 문서";
  return /문서$/u.test(trimmed) ? trimmed : `${trimmed} 문서`;
}

function buildHeadingOutline(
  chunks: DocumentIndexExplainReport["chunks"]
): DocumentIndexExplainReport["headingOutline"] {
  const outline = new Map<string, number[]>();
  for (const chunk of chunks) {
    const heading = chunk.heading ?? "문서 본문";
    outline.set(heading, [...(outline.get(heading) ?? []), chunk.chunkIndex]);
  }

  return [...outline.entries()].map(([heading, chunkIndexes]) => ({
    heading,
    chunkIndexes,
    chunkCount: chunkIndexes.length
  }));
}

function buildChunkRetrievalHints(input: { heading?: string | null; content: string }): string[] {
  const hints = new Set<string>();
  if (input.heading) {
    hints.add(input.heading);
  }

  for (const token of input.content.match(/[가-힣A-Za-z0-9][가-힣A-Za-z0-9._-]{1,}/g) ?? []) {
    if (token.length >= 2 && !STOP_HINTS.has(token.toLowerCase())) {
      hints.add(token);
    }
    if (hints.size >= 6) {
      break;
    }
  }

  return [...hints].slice(0, 6);
}

function buildIndexExplainRecommendations(summary: DocumentIndexExplainReport["summary"]): string[] {
  const recommendations: string[] = [];
  if (summary.chunkCount === 0) {
    recommendations.push("문서를 다시 등록해 검색 가능한 청크와 임베딩을 생성하세요.");
  }
  if (summary.embeddingCoverageRatio < 1) {
    recommendations.push("임베딩 누락 청크가 있으므로 색인 작업을 재실행하세요.");
  }
  if (summary.headingCoverageRatio < 0.5) {
    recommendations.push("Markdown 헤딩을 보강해 검색 결과에서 문맥 단위를 더 명확히 드러내세요.");
  }
  if (summary.maxChunkLength > 1400) {
    recommendations.push("긴 청크는 하위 헤딩이나 문단 분리로 나눠 답변 컨텍스트 오염을 줄이세요.");
  }
  if (summary.avgChunkLength < 120 && summary.chunkCount > 0) {
    recommendations.push("너무 짧은 청크는 주변 문단과 합쳐 벡터 검색 신호를 강화하세요.");
  }
  if (summary.promptInjectionRisk) {
    recommendations.push("프롬프트 주입 위험이 있는 문서는 공개 범위를 제한하고 운영 검토를 거치세요.");
  }

  return recommendations.length > 0 ? recommendations : ["청크, 임베딩, 버전, 보안 메타데이터가 검색 준비 기준을 충족합니다."];
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

function buildIndexSnapshotRecommendations(input: {
  status: DocumentIndexSnapshotReport["status"];
  summary: DocumentIndexSnapshotReport["summary"];
}): string[] {
  const recommendations: string[] = [];
  if (input.summary.totalDocuments === 0) {
    recommendations.push("먼저 seed 문서나 Markdown 문서를 색인해 지식 베이스 스냅샷을 생성하세요.");
  }
  if (input.summary.totalChunks === 0) {
    recommendations.push("검색 가능한 청크가 없으므로 문서 색인 작업을 다시 실행하세요.");
  }
  if (input.summary.embeddingCoverageRatio < 1 && input.summary.totalChunks > 0) {
    recommendations.push("임베딩 커버리지가 100%가 아니므로 누락 청크를 재색인하세요.");
  }
  if (input.summary.versionedDocuments < input.summary.totalDocuments) {
    recommendations.push("버전 이력이 없는 문서가 있으므로 Markdown upsert 경로로 재등록하세요.");
  }
  if (input.summary.qualityStatus === "critical") {
    recommendations.push("색인 품질 게이트가 실패 상태이므로 배포 전 색인 품질 리포트를 먼저 해결하세요.");
  }
  if (input.summary.promptInjectionRiskCount > 0) {
    recommendations.push("프롬프트 주입 위험 문서는 권한 범위와 운영 검토 상태를 확인하세요.");
  }
  if (input.status === "ready" && recommendations.length === 0) {
    recommendations.push("현재 지식 베이스 스냅샷은 재현 가능한 배포 증거로 사용할 수 있습니다.");
  }

  return recommendations;
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

function buildRevalidationRiskLevel(input: {
  confidence: number;
  needsHumanReview: boolean;
  sourceRank: number;
  sourceChunkCount: number;
  visibility: string;
}): DocumentRevalidationQueueReport["items"][number]["riskLevel"] {
  if (input.visibility === "restricted" && (input.needsHumanReview || input.sourceRank === 1)) {
    return "critical";
  }
  if (input.needsHumanReview || input.sourceRank === 1 || input.visibility === "restricted") {
    return "high";
  }
  if (input.confidence < 0.5 || input.sourceRank <= 2 || input.sourceChunkCount > 1) {
    return "medium";
  }
  return "low";
}

function revalidationPriority(
  riskLevel: DocumentRevalidationQueueReport["items"][number]["riskLevel"]
): DocumentRevalidationQueueReport["items"][number]["priority"] {
  const priorities: Record<DocumentRevalidationQueueReport["items"][number]["riskLevel"], DocumentRevalidationQueueReport["items"][number]["priority"]> = {
    critical: "P0",
    high: "P1",
    medium: "P2",
    low: "P3"
  };
  return priorities[riskLevel];
}

function revalidationDueHours(riskLevel: DocumentRevalidationQueueReport["items"][number]["riskLevel"]): number {
  const dueHours: Record<DocumentRevalidationQueueReport["items"][number]["riskLevel"], number> = {
    critical: 4,
    high: 24,
    medium: 72,
    low: 168
  };
  return dueHours[riskLevel];
}

function buildRevalidationReason(input: {
  riskLevel: DocumentRevalidationQueueReport["items"][number]["riskLevel"];
  visibility: string;
  needsHumanReview: boolean;
  sourceRank: number;
  sourceChunkCount: number;
}): string {
  const reasons = [`${formatRevalidationRisk(input.riskLevel)} 위험`];
  if (input.sourceRank === 1) {
    reasons.push("변경 문서가 1순위 근거");
  }
  if (input.needsHumanReview) {
    reasons.push("사람 검토 답변");
  }
  if (input.visibility === "restricted") {
    reasons.push("제한 문서 포함");
  }
  if (input.sourceChunkCount > 1) {
    reasons.push(`근거 청크 ${input.sourceChunkCount}개`);
  }
  return reasons.join(" · ");
}

function buildRevalidationActions(input: {
  riskLevel: DocumentRevalidationQueueReport["items"][number]["riskLevel"];
  needsHumanReview: boolean;
  sourceRank: number;
  visibility: string;
}): string[] {
  const actions = ["답변 replay로 현재 문서 기준 drift를 확인하세요.", "답변 계보 그래프로 출처/도구/승인 경계를 재검사하세요."];
  if (input.sourceRank === 1) {
    actions.push("1순위 근거였던 문서가 바뀌었으므로 운영 채널 공유 전 품질 게이트를 다시 확인하세요.");
  }
  if (input.needsHumanReview) {
    actions.push("기존 승인/반려 이력을 확인하고 필요하면 담당자 재승인을 요청하세요.");
  }
  if (input.visibility === "restricted") {
    actions.push("제한 문서 접근 권한이 없는 호출자에게 출처 경로가 노출되지 않는지 확인하세요.");
  }
  if (input.riskLevel === "low") {
    actions.push("정기 평가 실행 시 함께 재검증하면 충분합니다.");
  }
  return [...new Set(actions)].slice(0, 5);
}

function revalidationQueueStatus(input: {
  itemCount: number;
  highRiskItemCount: number;
  criticalItemCount: number;
}): DocumentRevalidationQueueReport["status"] {
  if (input.itemCount === 0) {
    return "empty";
  }
  if (input.criticalItemCount > 0) {
    return "critical";
  }
  if (input.highRiskItemCount > 0) {
    return "attention";
  }
  return "ready";
}

function buildRevalidationQueueRecommendations(input: {
  itemCount: number;
  highRiskItemCount: number;
  criticalItemCount: number;
  topSourceItemCount: number;
  humanReviewItemCount: number;
  restrictedItemCount: number;
}): string[] {
  const recommendations: string[] = [];
  if (input.itemCount === 0) {
    recommendations.push("문서 변경 이후 오래된 답변이 없습니다. 신규 문서 색인과 정기 평가만 유지하면 됩니다.");
  }
  if (input.criticalItemCount > 0) {
    recommendations.push("P0 항목은 제한 문서 또는 사람 승인 경계와 연결됐으므로 운영 채널 공유 전에 즉시 replay와 품질 게이트를 실행하세요.");
  }
  if (input.highRiskItemCount > 0) {
    recommendations.push("P1 항목은 변경 문서가 핵심 근거였거나 사람 검토 답변이므로 담당자를 지정해 재검증하세요.");
  }
  if (input.topSourceItemCount > 0) {
    recommendations.push("1순위 근거가 바뀐 답변은 답변 문구와 출처 인용을 함께 다시 확인하세요.");
  }
  if (input.humanReviewItemCount > 0) {
    recommendations.push("사람 검토 답변은 승인 대기열과 감사 원장의 상태를 함께 확인하세요.");
  }
  if (input.restrictedItemCount > 0) {
    recommendations.push("제한 문서 항목은 호출자 권한 재검사와 계보 그래프의 출처 노출 범위를 확인하세요.");
  }
  return [...new Set(recommendations)].slice(0, 5);
}

function revalidationRunStatus(input: {
  replay: AnswerReplay;
  qualityGate: AnswerQualityGate;
}): DocumentRevalidationRunReport["status"] {
  if (input.qualityGate.status === "block") {
    return "blocked";
  }
  if (input.replay.status !== "stable" || input.qualityGate.status === "review") {
    return "needs_review";
  }
  return "cleared";
}

function buildRevalidationRunChecks(input: {
  queueItem: DocumentRevalidationQueueReport["items"][number];
  replay: AnswerReplay;
  qualityGate: AnswerQualityGate;
  lineage: AnswerLineageGraph;
}): DocumentRevalidationRunReport["checks"] {
  return [
    {
      id: "queue_item_stale",
      label: "오래된 답변 큐 항목",
      status: "pass",
      evidence: `${input.queueItem.document.path} 문서가 ${input.queueItem.answer.createdAt} 답변 이후 변경되었습니다.`,
      metric: input.queueItem.staleAgeHours
    },
    {
      id: "replay_stable",
      label: "현재 문서 기준 replay",
      status: input.replay.status === "stable" ? "pass" : input.replay.status === "needs_review" ? "warn" : "fail",
      evidence: input.replay.summary.topSourceChanged
        ? `1순위 출처가 ${input.replay.summary.originalTopSourcePath ?? "없음"}에서 ${input.replay.summary.currentTopSourcePath ?? "없음"}로 바뀌었습니다.`
        : `1순위 출처가 ${input.replay.summary.currentTopSourcePath ?? "없음"}로 유지됩니다.`,
      metric: input.replay.summary.sourceOverlapRatio,
      threshold: 0.6
    },
    {
      id: "quality_gate",
      label: "답변 신뢰 게이트",
      status: input.qualityGate.status === "pass" ? "pass" : input.qualityGate.status === "review" ? "warn" : "fail",
      evidence:
        input.qualityGate.decision.reasons.length > 0
          ? input.qualityGate.decision.reasons[0]
          : `${input.qualityGate.decision.label} 판정입니다.`,
      metric: input.qualityGate.score
    },
    {
      id: "lineage_integrity",
      label: "계보 무결성",
      status: input.lineage.integrity.hash && input.lineage.summary.sourceAccessRechecked ? "pass" : "fail",
      evidence: `계보 그래프 ${input.lineage.summary.nodeCount}개 노드와 ${input.lineage.summary.edgeCount}개 엣지를 sha256:${input.lineage.integrity.hash.slice(0, 12)}로 검증했습니다.`
    },
    {
      id: "source_access_rechecked",
      label: "출처 권한 재검사",
      status: input.qualityGate.summary.sourceAccessRechecked ? "pass" : "fail",
      evidence: `현재 호출자 권한으로 출처 접근을 재검사했고 차단 후보 ${input.replay.summary.permissionDeniedCandidates}개를 기록했습니다.`,
      metric: input.replay.summary.permissionDeniedCandidates
    }
  ];
}

function buildRevalidationRunDecision(input: {
  status: DocumentRevalidationRunReport["status"];
  checks: DocumentRevalidationRunReport["checks"];
}): DocumentRevalidationRunReport["decision"] {
  const failedOrWarned = input.checks.filter((check) => check.status !== "pass");
  if (input.status === "blocked") {
    return {
      label: "답변 차단 및 재작성",
      recommendedAction: "block_answer_and_rewrite",
      reasons: failedOrWarned.map((check) => `${check.label}: ${check.evidence}`).slice(0, 5)
    };
  }
  if (input.status === "needs_review") {
    return {
      label: "담당자 재검토 필요",
      recommendedAction: "assign_human_reviewer",
      reasons: failedOrWarned.map((check) => `${check.label}: ${check.evidence}`).slice(0, 5)
    };
  }
  return {
    label: "큐 항목 종료 가능",
    recommendedAction: "close_queue_item",
    reasons: ["Replay, 품질 게이트, 계보 무결성, 출처 권한 재검사가 모두 통과했습니다."]
  };
}

function formatRevalidationRisk(riskLevel: DocumentRevalidationQueueReport["items"][number]["riskLevel"]): string {
  const labels: Record<DocumentRevalidationQueueReport["items"][number]["riskLevel"], string> = {
    critical: "긴급",
    high: "높음",
    medium: "중간",
    low: "낮음"
  };
  return labels[riskLevel];
}

function actorSnapshot(context: RequestContext): Record<string, unknown> {
  return {
    actorId: context.actorId ?? null,
    email: context.email ?? null,
    roles: context.roles.slice().sort(),
    teamSlugs: context.teamSlugs.slice().sort()
  };
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
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

function estimateTokenCount(content: string): number {
  return Math.max(1, Math.ceil(content.replace(/\s+/g, " ").trim().length / 4));
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

const STOP_HINTS = new Set([
  "the",
  "and",
  "with",
  "must",
  "when",
  "that",
  "this",
  "within",
  "문서",
  "기준",
  "확인",
  "합니다",
  "그리고",
  "반드시"
]);

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
