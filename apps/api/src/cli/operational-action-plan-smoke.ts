import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { ObservabilityService } from "../observability/observability.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    const observability = app.get(ObservabilityService);

    await documents.ingestSeedDocuments();
    await agent.ask("E102 에러가 발생하면 어떻게 대응해야 해?", { roles: ["ops_admin"], teamSlugs: ["payments"] }, "action-plan-smoke");

    const plan = await observability.actionPlan();
    const primaryAction = plan.actions[0];
    const ok =
      plan.schemaVersion === "opspilot.operational_action_plan.v1" &&
      plan.summary.actionCount === plan.actions.length &&
      plan.summary.actionCount >= 1 &&
      plan.summary.owners.length >= 1 &&
      ["ship", "ship_after_review", "hold"].includes(plan.summary.releaseRecommendation) &&
      primaryAction !== undefined &&
      primaryAction.actionItems.length >= 2 &&
      primaryAction.verification.some((command) => command.startsWith("pnpm ")) &&
      plan.actions.every((action) => action.owner && action.priority && action.reason && action.impact);

    console.log(
      JSON.stringify(
        {
          ok,
          status: plan.status,
          summary: plan.summary,
          primaryAction,
          actionIds: plan.actions.map((action) => action.id)
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Operational action plan smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
