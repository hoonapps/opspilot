import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const DOCUMENT_PATH = "public/revalidation-queue-proof.md";
const TOKEN = "재검증큐증명키";
const ACTOR = { roles: ["ops_admin"], teamSlugs: ["payments"] };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);

    await documents.ingestMarkdown(
      DOCUMENT_PATH,
      `---
title: "재검증 큐 증명"
visibility: public
tags: revalidation,rag,quality
---
# 재검증 큐 증명

## 운영 기준

${TOKEN} ${TOKEN} ${TOKEN}

운영 문서가 변경되면 이 문서를 근거로 사용한 과거 답변은 전역 재검증 큐에 올라가야 합니다.
`
    );

    const answer = await agent.ask(`${TOKEN} 문서는 무엇을 증명해야 해?`, ACTOR, "revalidation-queue-smoke");
    await sleep(20);
    await documents.ingestMarkdown(
      DOCUMENT_PATH,
      `---
title: "재검증 큐 증명"
visibility: public
tags: revalidation,rag,quality
---
# 재검증 큐 증명

이 문서는 재검증 큐 스모크를 위해 변경되었습니다.
문서 변경 이후 이전 답변은 replay, lineage, quality gate로 다시 확인해야 합니다.
`
    );

    const queue = await documents.getRevalidationQueue(100);
    const item = queue.items.find((candidate) => candidate.answer.id === answer.answerId && candidate.document.path === DOCUMENT_PATH);
    const ok =
      queue.schemaVersion === "opspilot.document_revalidation_queue.v1" &&
      queue.summary.queueItemCount >= 1 &&
      queue.summary.affectedDocumentCount >= 1 &&
      queue.summary.affectedAnswerCount >= 1 &&
      item !== undefined &&
      item.source.rank === 1 &&
      item.priority !== "P3" &&
      item.actions.some((action) => action.includes("replay")) &&
      item.evidenceLinks.replay === `/answers/${answer.answerId}/replay` &&
      item.evidenceLinks.lineage === `/answers/${answer.answerId}/lineage` &&
      queue.recommendations.length >= 1;

    console.log(
      JSON.stringify(
        {
          ok,
          status: queue.status,
          summary: queue.summary,
          item: item
            ? {
                priority: item.priority,
                riskLevel: item.riskLevel,
                reason: item.reason,
                document: item.document.path,
                answerId: item.answer.id,
                evidenceLinks: item.evidenceLinks
              }
            : null
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Document revalidation queue smoke test failed");
    }
  } finally {
    await app.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
