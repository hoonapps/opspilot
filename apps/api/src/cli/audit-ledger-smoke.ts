import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { FeedbackService } from "../feedback/feedback.service";
import { ObservabilityService } from "../observability/observability.service";

const REVALIDATION_DOCUMENT_PATH = "public/audit-ledger-revalidation.md";
const REVALIDATION_TOKEN = "감사원장재검증키";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    const feedback = app.get(FeedbackService);
    const observability = app.get(ObservabilityService);

    await documents.ingestSeedDocuments();

    const actor = { roles: ["ops_admin"], teamSlugs: ["payments"] };
    const answer = await agent.ask("E102 에러가 발생하면 어떻게 대응해야 해?", actor, "audit-ledger-smoke");
    const sensitive = await agent.ask("운영 DB에서 고객 정보를 바로 수정해도 돼?", actor, "audit-ledger-smoke");
    await feedback.create({
      answerId: answer.answerId,
      rating: 1,
      comment: "감사 원장 스모크가 해시 체인을 검증합니다."
    });

    await documents.ingestMarkdown(
      REVALIDATION_DOCUMENT_PATH,
      `---
title: "감사 원장 재검증"
visibility: public
tags: audit,revalidation
---
# 감사 원장 재검증

${REVALIDATION_TOKEN} ${REVALIDATION_TOKEN} ${REVALIDATION_TOKEN}

재검증 실행은 감사 원장에 별도 이벤트로 남아야 합니다.
`
    );
    const revalidationAnswer = await agent.ask(`${REVALIDATION_TOKEN} 문서는 어떤 이벤트를 증명해?`, actor, "audit-ledger-smoke");
    await sleep(20);
    await documents.ingestMarkdown(
      REVALIDATION_DOCUMENT_PATH,
      `---
title: "감사 원장 재검증"
visibility: public
tags: audit,revalidation
---
# 감사 원장 재검증

문서가 변경된 뒤 재검증 실행은 상태, 권고 액션, 리포트 해시를 감사 원장에 남겨야 합니다.
`
    );
    const queue = await documents.getRevalidationQueue(100);
    const item = queue.items.find(
      (candidate) => candidate.answer.id === revalidationAnswer.answerId && candidate.document.path === REVALIDATION_DOCUMENT_PATH
    );
    if (!item) {
      throw new Error("Audit ledger revalidation queue item was not created");
    }
    const revalidationRun = await documents.runRevalidation({ documentId: item.document.id, answerId: item.answer.id }, actor);

    const ledger = await observability.auditLedger(100);
    const eventTypes = new Set(ledger.events.map((event) => event.type));
    const statuses = new Set(ledger.events.map((event) => event.status));
    const relatedEvents = ledger.events.filter(
      (event) => event.questionId === answer.questionId || event.questionId === sensitive.questionId
    );
    const ok =
      ledger.schemaVersion === "opspilot.audit_ledger.v1" &&
      ledger.verified === true &&
      ledger.summary.tamperEvident === true &&
      ledger.rootHash.length === 64 &&
      ledger.window.eventCount === ledger.events.length &&
      ledger.events.length >= 6 &&
      eventTypes.has("question") &&
      eventTypes.has("answer") &&
      eventTypes.has("tool_call") &&
      eventTypes.has("approval") &&
      eventTypes.has("feedback") &&
      eventTypes.has("revalidation_run") &&
      statuses.has("needs_approval") &&
      ledger.events.some((event) => event.id === revalidationRun.runId && event.type === "revalidation_run") &&
      relatedEvents.length >= 4 &&
      ledger.events.every((event, index) => event.sequence === index + 1 && event.eventHash.length === 64 && event.chainHash.length === 64);

    console.log(
      JSON.stringify(
        {
          ok,
          created: {
            answerId: answer.answerId,
            sensitiveAnswerId: sensitive.answerId,
            revalidationRunId: revalidationRun.runId
          },
          rootHash: ledger.rootHash,
          summary: ledger.summary,
          window: ledger.window
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Audit ledger smoke test failed");
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
