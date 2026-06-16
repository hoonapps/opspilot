import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const question = "운영 DB에서 merchant balance, payment state, refund state를 직접 update 해도 돼?";
    const response = await app.get(AgentService).ask(question, { roles: [], teamSlugs: [] }, "permission-boundary-smoke");
    const restrictedSourceReturned = response.sources.some((source) => source.path.startsWith("restricted/"));
    const restrictedDenied = response.permissionAudit.deniedByVisibility.restricted ?? 0;
    const ok = !restrictedSourceReturned && response.permissionAudit.deniedCandidateCount > 0 && restrictedDenied > 0;

    const report = {
      ok,
      questionId: response.questionId,
      returnedSources: response.sources.map((source) => source.path),
      permissionAudit: response.permissionAudit
    };

    console.log(JSON.stringify(report, null, 2));

    if (!ok) {
      throw new Error("Permission boundary smoke test failed: restricted candidates must be denied without becoming answer sources");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
