import { Injectable } from "@nestjs/common";
import { MikroORM } from "@mikro-orm/core";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { EmbeddingService } from "../agent/embedding.service";
import { sha256 } from "../shared/hash";
import { ChunkerService } from "./chunker.service";
import { parseMarkdownDocument } from "./frontmatter";

type IngestedDocument = {
  path: string;
  title: string;
  chunks: number;
  changed: boolean;
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly orm: MikroORM,
    private readonly chunker: ChunkerService,
    private readonly embeddings: EmbeddingService
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

  async ingestMarkdown(path: string, raw: string): Promise<IngestedDocument> {
    const parsed = parseMarkdownDocument(path, raw);
    const contentHash = sha256(parsed.body);
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
        JSON.stringify(parsed.metadata),
        contentHash
      ]
    );

    if (changed) {
      const [{ next_version: nextVersion }] = await connection.execute<{ next_version: number }[]>(
        "select coalesce(max(version), 0) + 1 as next_version from document_versions where document_id = ?::uuid",
        [document.id]
      );
      await connection.execute(
        "insert into document_versions (document_id, version, content_hash, content) values (?::uuid, ?, ?, ?)",
        [document.id, nextVersion, contentHash, parsed.body]
      );
    }

    await connection.execute("delete from document_chunks where document_id = ?::uuid", [document.id]);

    const chunks = this.chunker.chunk(parsed.body);
    for (const chunk of chunks) {
      const embedding = this.embeddings.toSqlVector(this.embeddings.embed(`${parsed.metadata.title}\n${chunk.content}`));
      await connection.execute(
        `
          insert into document_chunks (document_id, chunk_index, content, embedding, metadata)
          values (?::uuid, ?, ?, ?::vector, ?::jsonb);
        `,
        [
          document.id,
          chunk.index,
          chunk.content,
          embedding,
          JSON.stringify({ heading: chunk.heading, title: parsed.metadata.title, path })
        ]
      );
    }

    return {
      path,
      title: parsed.metadata.title,
      chunks: chunks.length,
      changed
    };
  }
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
