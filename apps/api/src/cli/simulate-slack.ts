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

  console.log(JSON.stringify(result, null, 2));
  await app.close();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
