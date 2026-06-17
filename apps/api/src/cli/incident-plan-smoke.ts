import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { IncidentResponsePlanService } from "../agent/incident-response-plan.service";
import { ToolCallAuditService } from "../agent/tool-call-audit.service";
import { DocumentsService } from "../documents/documents.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const plan = await app
      .get(IncidentResponsePlanService)
      .create(
        "정산 배치가 30분 이상 지연되고 settlement.dlq.count가 120이면 어떻게 대응해야 해?",
        { roles: ["support_agent"], teamSlugs: ["payments"] },
        5
      );
    const recentTools = (await app.get(ToolCallAuditService).recent(8)).toolCalls;
    const toolNames = recentTools
      .filter((tool) => tool.questionId === plan.audit.persistedQuestionId)
      .map((tool) => tool.toolName);
    const ok =
      plan.status === "needs_review" &&
      plan.severity === "sev1" &&
      plan.sources[0]?.path === "team/settlement-runbook.md" &&
      plan.runbook.matched &&
      plan.phases.length === 4 &&
      plan.phases.some((phase) => phase.id === "mitigation" && phase.steps.some((step) => step.requiresApproval)) &&
      plan.approvalGates.length >= 1 &&
      plan.communications.some((item) => item.channel === "#payments-oncall") &&
      plan.verification.length > 0 &&
      toolNames.includes("search_documents") &&
      toolNames.includes("create_runbook_checklist") &&
      toolNames.includes("create_incident_response_plan");

    console.log(
      JSON.stringify(
        {
          ok,
          planId: plan.planId,
          status: plan.status,
          severity: plan.severity,
          confidence: plan.confidence,
          topSource: plan.sources[0],
          runbook: plan.runbook,
          approvalGates: plan.approvalGates,
          communications: plan.communications,
          verification: plan.verification.slice(0, 2),
          toolNames
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Incident response plan smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
