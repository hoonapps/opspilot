import "reflect-metadata";
import { MikroORM } from "@mikro-orm/core";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { SearchService } from "../agent/search.service";
import { DocumentsService } from "../documents/documents.service";

const PHOENIX_PATH = "public/mock-openai-phoenix-recovery.md";
const BILLING_PATH = "public/mock-openai-billing-policy.md";

const PHOENIX_DOCUMENT = `---
title: "Phoenix rollback recovery"
visibility: public
tags: release,recovery,phoenix
---
# Phoenix rollback recovery

Phoenix release recovery uses the verified rollback bundle, owner checkpoint, and post-restore validation.
`;

const BILLING_DOCUMENT = `---
title: "Billing invoice policy"
visibility: public
tags: billing,invoice
---
# Billing invoice policy

Billing invoice changes require customer notice and finance approval.
`;

async function main() {
  const previousEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL,
    OPENAI_EMBEDDING_DIMENSIONS: process.env.OPENAI_EMBEDDING_DIMENSIONS,
    RETRIEVAL_RERANKER: process.env.RETRIEVAL_RERANKER
  };
  const previousFetch = globalThis.fetch;
  const embeddingInputs: string[] = [];

  process.env.AI_PROVIDER = "openai";
  process.env.EMBEDDING_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "mock-openai-key";
  process.env.OPENAI_EMBEDDING_MODEL = "mock-text-embedding-3-small";
  process.env.OPENAI_EMBEDDING_DIMENSIONS = "64";
  process.env.RETRIEVAL_RERANKER = "off";

  globalThis.fetch = (async (url, init) => {
    if (String(url) !== "https://api.openai.com/v1/embeddings") {
      return new Response("unexpected request", { status: 500 });
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as { input?: string };
    const input = body.input ?? "";
    embeddingInputs.push(input);

    return new Response(JSON.stringify({ data: [{ embedding: mockEmbedding(input) }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const documents = app.get(DocumentsService);
    const search = app.get(SearchService);
    const orm = app.get(MikroORM);

    await documents.resetDocuments(false);
    await documents.ingestMarkdown(PHOENIX_PATH, PHOENIX_DOCUMENT);
    await documents.ingestMarkdown(BILLING_PATH, BILLING_DOCUMENT);

    const results = await search.search("phoenix rollback recovery validation", { roles: [], teamSlugs: [] }, 2);
    const [stored] = await orm.em.fork().getConnection().execute<Array<{ embedding: string }>>(
      `
        select c.embedding::text as embedding
        from document_chunks c
        join documents d on d.id = c.document_id
        where d.path = ?
        order by c.chunk_index asc
        limit 1;
      `,
      [PHOENIX_PATH]
    );

    const ok =
      results[0]?.path === PHOENIX_PATH &&
      embeddingInputs.some((input) => input.includes("Phoenix rollback recovery")) &&
      embeddingInputs.some((input) => input === "phoenix rollback recovery validation") &&
      stored?.embedding.startsWith("[1,0,0,0");

    console.log(
      JSON.stringify(
        {
          ok,
          topSource: results[0]
            ? {
                path: results[0].path,
                score: results[0].score,
                vectorScore: results[0].retrieval.vectorScore,
                lexicalScore: results[0].retrieval.lexicalScore
              }
            : null,
          embeddingCallCount: embeddingInputs.length,
          storedPhoenixEmbeddingPrefix: stored?.embedding.slice(0, 32) ?? null
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("OpenAI embedding path smoke test failed");
    }
  } finally {
    process.env.AI_PROVIDER = "local";
    process.env.EMBEDDING_PROVIDER = "local";
    await app.get(DocumentsService).resetDocuments(true);
    await app.close();
    restoreEnv(previousEnv);
    globalThis.fetch = previousFetch;
  }
}

function mockEmbedding(input: string): number[] {
  const vector = Array.from({ length: 64 }, () => 0);
  const lower = input.toLowerCase();
  if (lower.includes("phoenix")) {
    vector[0] = 1;
  } else if (lower.includes("billing")) {
    vector[1] = 1;
  } else {
    vector[2] = 1;
  }

  return vector;
}

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
