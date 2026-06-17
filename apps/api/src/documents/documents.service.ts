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
