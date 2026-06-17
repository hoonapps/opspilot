import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { IncidentResponsePlanService } from "../agent/incident-response-plan.service";
import { QuestionAuditBundleService } from "../agent/question-audit-bundle.service";
import { DocumentsService } from "../documents/documents.service";

const ACTOR = { roles: ["support_agent"], teamSlugs: ["payments"] };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const plan = await app
      .get(IncidentResponsePlanService)
      .create("정산 배치가 30분 이상 지연되고 settlement.dlq.count가 120이면 어떻게 대응해야 해?", ACTOR, 5);
    const bundle = await app.get(QuestionAuditBundleService).getBundle(plan.audit.persistedQuestionId, ACTOR);
    const toolNames = bundle.evidence.toolCalls.map((toolCall) => toolCall.toolName);
    const ok =
      bundle.schemaVersion === "opspilot.question_audit_bundle.v1" &&
      bundle.questionId === plan.audit.persistedQuestionId &&
      bundle.summary.status === "review_required" &&
      bundle.summary.answerCount === 0 &&
      bundle.summary.sourceCount >= 1 &&
      bundle.summary.toolCallCount >= 3 &&
      bundle.summary.policyCheckCount === bundle.summary.passedPolicyCheckCount &&
      bundle.summary.deniedCandidateCount >= 0 &&
      bundle.actorBoundary.sourceAccessRechecked === true &&
      bundle.evidence.sources.some((source) => source.path === "team/settlement-runbook.md") &&
      toolNames.includes("search_documents") &&
      toolNames.includes("create_runbook_checklist") &&
      toolNames.includes("create_incident_response_plan") &&
      bundle.policyChecks.every((check) => check.status === "pass") &&
      bundle.decisionPath.some((event) => event.kind === "policy" && event.status === "review_required") &&
      bundle.integrity.algorithm === "sha256" &&
      /^[a-f0-9]{64}$/.test(bundle.integrity.hash);

    console.log(
      JSON.stringify(
        {
          ok,
          schemaVersion: bundle.schemaVersion,
          questionId: bundle.questionId,
          status: bundle.summary.status,
          sourceCount: bundle.summary.sourceCount,
          toolCallCount: bundle.summary.toolCallCount,
          policyChecks: bundle.policyChecks.map((check) => ({
            toolName: check.toolName,
            expectedStatus: check.expectedStatus,
            actualStatus: check.actualStatus,
            status: check.status
          })),
          topSource: bundle.evidence.sources[0]?.path,
          hash: bundle.integrity.hash
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Question audit bundle smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
