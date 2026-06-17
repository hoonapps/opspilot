import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { SlackEventPayload } from "../slack/dto/slack-event.dto";
import { SlackService } from "../slack/slack.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.get(DocumentsService).ingestSeedDocuments();

  const payloadPath = process.argv[2] ?? "../../seed/slack/app-mention.json";
  const payload = JSON.parse(await readFile(join(process.cwd(), payloadPath), "utf8")) as SlackEventPayload;
  const result = await app.get(SlackService).handlePayload(payload);
  const ok =
    result.ok === true &&
    Boolean(result.reply) &&
    Boolean(result.trace) &&
    result.trace?.questionId !== undefined &&
    result.trace?.answerId !== undefined &&
    result.trace?.actor.teamSlugs.includes("payments") &&
    result.trace?.sources.length !== undefined &&
    result.trace?.reply.postMode === "dry_run";

  console.log(JSON.stringify({ smokeOk: ok, result }, null, 2));
  if (!ok) {
    throw new Error("Slack simulation smoke test failed");
  }
  await app.close();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
