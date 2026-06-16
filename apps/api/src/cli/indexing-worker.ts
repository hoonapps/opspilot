import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { IndexingWorkerService } from "../documents/indexing-worker.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const worker = app.get(IndexingWorkerService).start();
  console.log(JSON.stringify({ ok: true, worker }, null, 2));

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
