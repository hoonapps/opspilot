import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const documents = app.get(DocumentsService);
  const result = await documents.ingestSeedDocuments();
  console.table(result.documents);
  await app.close();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
