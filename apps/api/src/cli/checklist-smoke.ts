import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const response = await app
      .get(AgentService)
      .ask(
        "settlement-worker queue depth와 settlement.dlq.count를 확인해야 하는 정산 체크리스트는?",
        { roles: [], teamSlugs: ["payments"] },
        "checklist-smoke"
      );

    const hasChecklistTool = response.toolCalls.some((tool) => tool.toolName === "create_runbook_checklist");
    const hasRunbookSource = response.sources[0]?.path === "team/settlement-runbook.md";
    const hasChecklistItem = response.answer.includes("settlement-worker") && response.answer.includes("settlement.dlq.count");
    const ok = hasChecklistTool && hasRunbookSource && hasChecklistItem;

    const report = {
      ok,
      answerId: response.answerId,
      topSource: response.sources[0]
        ? {
            title: response.sources[0].title,
            path: response.sources[0].path,
            score: response.sources[0].score
          }
        : null,
      toolCalls: response.toolCalls,
      answerPreview: response.answer.slice(0, 260)
    };

    console.log(JSON.stringify(report, null, 2));

    if (!ok) {
      throw new Error("Runbook checklist smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
