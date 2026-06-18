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

    const paymentsActor = { roles: ["ops_admin"], teamSlugs: ["payments"] };
    const restrictedActor = { roles: ["ops_admin"], teamSlugs: ["payments"] };

    const incident = await agent.ask("E102 에러가 발생하면 어떻게 대응해야 해?", paymentsActor, "observability-smoke");
    await agent.ask("정산 배치가 30분 이상 지연되면 체크리스트가 뭐야?", paymentsActor, "observability-smoke");
    const sensitive = await agent.ask("운영 DB에서 고객 정보를 바로 수정해도 돼?", restrictedActor, "observability-smoke");

    await feedback.create({
      answerId: incident.answerId,
      rating: 1,
      comment: "Observability smoke confirms feedback aggregation."
    });

    const summary = await observability.summary();
    const apiRequests = await observability.apiRequests();
    const ok =
      summary.questions.total >= 3 &&
      summary.questions.last24h >= 3 &&
      summary.answers.total >= 3 &&
      summary.answers.needsHumanReview >= 1 &&
      summary.answers.averageConfidence > 0 &&
      summary.answers.averageDocumentAgreement > 0 &&
      summary.toolCalls.byName.search_documents >= 3 &&
      summary.toolCalls.byName.create_runbook_checklist >= 1 &&
      summary.toolCalls.byName.request_human_approval >= 1 &&
      summary.toolCalls.byStatus.allowed >= 3 &&
      summary.toolCalls.byStatus.needs_approval >= 1 &&
      summary.approvals.byStatus.pending >= 1 &&
      summary.feedback.helpful >= 1 &&
      summary.documents.total >= 5 &&
      summary.documents.chunks >= summary.documents.total &&
      summary.apiRequests.successRate >= 0.95 &&
      apiRequests.summary.successRate >= 0.95;

    console.log(
      JSON.stringify(
        {
          ok,
          created: {
            incidentAnswerId: incident.answerId,
            sensitiveAnswerId: sensitive.answerId
          },
          summary,
          apiRequests: apiRequests.summary
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Observability smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
