import "reflect-metadata";
import { MikroORM } from "@mikro-orm/core";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { SearchService } from "../agent/search.service";
import { DocumentsService } from "../documents/documents.service";

const PAYMENT_PATH = "public/transformers-payment-timeout.md";
const OFFICE_PATH = "public/transformers-office-notice.md";

const PAYMENT_DOCUMENT = `---
title: "결제 승인 지연 복구 절차"
visibility: public
tags: payment,timeout,rollback
---
# 결제 승인 지연 복구 절차

승인 서비스가 응답하지 않아 결제 승인 대기가 3분 이상 지속되면 결제 배포를 롤백합니다.
롤백 후에는 승인 큐 적체량, 결제 타임아웃 비율, 고객 영향 범위를 확인합니다.
`;

const OFFICE_DOCUMENT = `---
title: "사무실 공지"
visibility: public
tags: office,notice
---
# 사무실 공지

사무실 냉난방 점검과 점심 주문 공지는 총무 채널에서 관리합니다.
`;

async function main() {
  if (process.env.RUN_TRANSFORMERS_INDEXING_SMOKE !== "true") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: "Set RUN_TRANSFORMERS_INDEXING_SMOKE=true to index and search with the local Transformers embedding model."
        },
        null,
        2
      )
    );
    return;
  }

  const previousEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER,
    EMBEDDING_DIMENSIONS: process.env.EMBEDDING_DIMENSIONS,
    TRANSFORMERS_EMBEDDING_MODEL: process.env.TRANSFORMERS_EMBEDDING_MODEL,
    RETRIEVAL_RERANKER: process.env.RETRIEVAL_RERANKER
  };

  process.env.AI_PROVIDER = "local";
  process.env.EMBEDDING_PROVIDER = "transformers";
  process.env.EMBEDDING_DIMENSIONS = "64";
  process.env.TRANSFORMERS_EMBEDDING_MODEL = process.env.TRANSFORMERS_EMBEDDING_MODEL ?? "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
  process.env.RETRIEVAL_RERANKER = "off";

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const documents = app.get(DocumentsService);
    const search = app.get(SearchService);
    const orm = app.get(MikroORM);

    await documents.resetDocuments(false);
    await documents.ingestMarkdown(PAYMENT_PATH, PAYMENT_DOCUMENT);
    await documents.ingestMarkdown(OFFICE_PATH, OFFICE_DOCUMENT);

    const results = await search.search("payment approval timeout rollback threshold", { roles: [], teamSlugs: [] }, 2);
    const [stored] = await orm.em.fork().getConnection().execute<Array<{ dimensions: string; nonzeroCount: string; embedding: string }>>(
      `
        select
          vector_dims(c.embedding) as dimensions,
          (
            select count(*)
            from unnest(string_to_array(trim(both '[]' from c.embedding::text), ',')) as value
            where abs(value::float) > 0.000001
          ) as "nonzeroCount",
          c.embedding::text as embedding
        from document_chunks c
        join documents d on d.id = c.document_id
        where d.path = ?
        order by c.chunk_index asc
        limit 1;
      `,
      [PAYMENT_PATH]
    );

    const topSource = results[0];
    const ok = topSource?.path === PAYMENT_PATH && Number(stored?.dimensions ?? 0) === 64 && Number(stored?.nonzeroCount ?? 0) >= 24;

    console.log(
      JSON.stringify(
        {
          ok,
          skipped: false,
          model: process.env.TRANSFORMERS_EMBEDDING_MODEL,
          query: "payment approval timeout rollback threshold",
          topSource: topSource
            ? {
                path: topSource.path,
                score: topSource.score,
                vectorScore: topSource.retrieval.vectorScore,
                lexicalScore: topSource.retrieval.lexicalScore
              }
            : null,
          storedEmbedding: stored
            ? {
                dimensions: Number(stored.dimensions),
                nonzeroCount: Number(stored.nonzeroCount),
                prefix: stored.embedding.slice(0, 80)
              }
            : null
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error(`Transformers indexing smoke test failed: expected top source ${PAYMENT_PATH}`);
    }
  } finally {
    await app.get(DocumentsService).resetDocuments(true);
    await app.close();
    restoreEnv(previousEnv);
  }
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
