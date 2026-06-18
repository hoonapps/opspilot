import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AnswerTraceService } from "../agent/answer-trace.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const SEMANTIC_AGREEMENT_PATH = "public/semantic-agreement-policy.md";
const DISTRACTOR_PATH = "public/semantic-agreement-office.md";

const SEMANTIC_AGREEMENT_DOCUMENT = `---
title: "AGREE-77 고객 공지 정책"
visibility: public
tags: agreement,semantic,status-page
---
# AGREE-77 고객 공지 정책

AGREE-77 장애가 발생하면 고객 상태 페이지 공지를 15분 안에 게시합니다.
공지에는 영향받은 기능, 현재 고객 영향도, 다음 업데이트 예정 시각, 장애 담당자를 포함해야 합니다.
`;

const DISTRACTOR_DOCUMENT = `---
title: "사무실 점검 공지"
visibility: public
tags: office,notice
---
# 사무실 점검 공지

사무실 냉난방 점검과 점심 주문 공지는 총무 채널에서 관리합니다.
`;

async function main() {
  if (process.env.RUN_SEMANTIC_AGREEMENT_SMOKE !== "true") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: "Set RUN_SEMANTIC_AGREEMENT_SMOKE=true to score answer/source agreement with the embedding model."
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
    DOCUMENT_AGREEMENT_METHOD: process.env.DOCUMENT_AGREEMENT_METHOD,
    TRANSFORMERS_EMBEDDING_MODEL: process.env.TRANSFORMERS_EMBEDDING_MODEL,
    RETRIEVAL_RERANKER: process.env.RETRIEVAL_RERANKER
  };

  process.env.AI_PROVIDER = "local";
  process.env.EMBEDDING_PROVIDER = "transformers";
  process.env.EMBEDDING_DIMENSIONS = "64";
  process.env.DOCUMENT_AGREEMENT_METHOD = "semantic_embedding";
  process.env.TRANSFORMERS_EMBEDDING_MODEL = process.env.TRANSFORMERS_EMBEDDING_MODEL ?? "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
  process.env.RETRIEVAL_RERANKER = "off";

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    const traceService = app.get(AnswerTraceService);

    await documents.resetDocuments(false);
    await documents.ingestMarkdown(SEMANTIC_AGREEMENT_PATH, SEMANTIC_AGREEMENT_DOCUMENT);
    await documents.ingestMarkdown(DISTRACTOR_PATH, DISTRACTOR_DOCUMENT);

    const answer = await agent.ask("AGREE-77 장애 고객 공지는 몇 분 안에 어떤 내용을 포함해야 해?", { roles: [], teamSlugs: [] }, "semantic-agreement-smoke");
    const trace = await traceService.getTrace(answer.answerId, { roles: [], teamSlugs: [] });
    const persistedAgreement = trace.answer.metadata.documentAgreement as
      | {
          score?: number;
          method?: string;
          semanticSimilarity?: number;
          tokenOverlapScore?: number;
          bestSourceIndex?: number;
        }
      | undefined;
    const topSource = answer.sources[0];
    const semanticSimilarity = answer.documentAgreement.semanticSimilarity ?? 0;
    const tokenOverlapScore = answer.documentAgreement.tokenOverlapScore ?? 0;

    const ok =
      topSource?.path === SEMANTIC_AGREEMENT_PATH &&
      answer.answer.includes("15") &&
      answer.documentAgreement.method === "semantic_embedding_v1" &&
      semanticSimilarity >= 0.65 &&
      answer.documentAgreement.bestSourceIndex === 0 &&
      persistedAgreement?.method === "semantic_embedding_v1" &&
      persistedAgreement?.score === answer.documentAgreement.score;

    console.log(
      JSON.stringify(
        {
          ok,
          skipped: false,
          model: process.env.TRANSFORMERS_EMBEDDING_MODEL,
          answerId: answer.answerId,
          topSource: topSource
            ? {
                title: topSource.title,
                path: topSource.path,
                score: topSource.score
              }
            : null,
          documentAgreement: answer.documentAgreement,
          persistedAgreement,
          comparison: {
            semanticSimilarity,
            tokenOverlapScore
          }
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Semantic agreement smoke test failed");
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
