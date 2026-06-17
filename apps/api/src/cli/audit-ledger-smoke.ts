import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { FeedbackService } from "../feedback/feedback.service";
import { ObservabilityService } from "../observability/observability.service";

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
      comment: "Audit ledger smoke confirms tamper-evident chain."
    });

    const ledger = await observability.auditLedger(80);
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
      statuses.has("needs_approval") &&
      relatedEvents.length >= 4 &&
      ledger.events.every((event, index) => event.sequence === index + 1 && event.eventHash.length === 64 && event.chainHash.length === 64);

    console.log(
      JSON.stringify(
        {
          ok,
          created: {
            answerId: answer.answerId,
            sensitiveAnswerId: sensitive.answerId
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

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
