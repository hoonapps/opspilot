import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { EvalQuestion, EvaluationService } from "../evaluation/evaluation.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.get(DocumentsService).ingestSeedDocuments();

  const evalPath = join(process.cwd(), process.env.EVAL_SET_PATH ?? "../../seed/eval/questions.json");
  const questions = JSON.parse(await readFile(evalPath, "utf8")) as EvalQuestion[];
  const report = await app.get(EvaluationService).run("seed-ops-wiki", questions);

  console.log(JSON.stringify(report, null, 2));
  await app.close();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
