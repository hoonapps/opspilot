import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AnswerTraceService } from "../agent/answer-trace.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const AGREEMENT_DOCUMENT_PATH = "public/agreement-smoke-policy.md";

const AGREEMENT_DOCUMENT = `---
title: "문서 일치율 장애 정책"
visibility: public
tags: agreement,incident,status-page
---
# 문서 일치율 장애 정책

## AGREE-42 고객 공지

한국어 별칭: AGREE-42, 일치율 테스트, 고객 공지 일치율.

AGREE-42가 발생하면 고객 상태 페이지 공지를 15분 안에 게시합니다.
공지에는 영향받은 기능, 현재 고객 영향도, 다음 업데이트 예정 시각, 장애 담당자를 포함해야 합니다.
`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    const traceService = app.get(AnswerTraceService);

    await documents.ingestSeedDocuments();
    await documents.ingestMarkdown(AGREEMENT_DOCUMENT_PATH, AGREEMENT_DOCUMENT);

    const answer = await agent.ask("AGREE-42 고객 공지는 몇 분 안에 무엇을 포함해서 올려야 해?", { roles: [], teamSlugs: [] }, "agreement-smoke");
    const trace = await traceService.getTrace(answer.answerId, { roles: [], teamSlugs: [] });
    const persistedAgreement = trace.answer.metadata.documentAgreement as { score?: number; method?: string } | undefined;
    const topSource = answer.sources[0];
    const supportedMethods = new Set(["token_overlap_v1", "semantic_embedding_v1"]);

    const ok =
      topSource?.path === AGREEMENT_DOCUMENT_PATH &&
      answer.answer.includes("15") &&
      answer.documentAgreement.score >= 0.8 &&
      answer.documentAgreement.answerTokenCount > 0 &&
      answer.documentAgreement.matchedTokenCount > 0 &&
      persistedAgreement?.score === answer.documentAgreement.score &&
      typeof persistedAgreement?.method === "string" &&
      supportedMethods.has(persistedAgreement.method) &&
      supportedMethods.has(answer.documentAgreement.method);

    console.log(
      JSON.stringify(
        {
          ok,
          answerId: answer.answerId,
          topSource: topSource
            ? {
                title: topSource.title,
                path: topSource.path,
                score: topSource.score
              }
            : null,
          documentAgreement: answer.documentAgreement,
          persistedAgreement
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Answer agreement smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
