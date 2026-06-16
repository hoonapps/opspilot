import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { EvalQuestion, EvaluationService } from "../evaluation/evaluation.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const evalPath = resolveEvalPath(process.env.EVAL_SET_PATH ?? "../../seed/eval/questions.json");
    const questions = JSON.parse(await readFile(evalPath, "utf8")) as EvalQuestion[];
    const report = await app.get(EvaluationService).run("seed-ops-wiki", questions);

    console.log(JSON.stringify(report, null, 2));

    if (!report.passed) {
      const failedGates = report.gates
        .filter((gate) => !gate.passed)
        .map((gate) => `${gate.metric}=${gate.score} < ${gate.threshold}`)
        .join(", ");
      throw new Error(`Evaluation quality gate failed: ${failedGates}`);
    }
  } finally {
    await app.close();
  }
}

function resolveEvalPath(evalPath: string): string {
  return isAbsolute(evalPath) ? evalPath : resolve(join(process.cwd(), evalPath));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
