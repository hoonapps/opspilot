import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { EvalQuestion, EvaluationService } from "../evaluation/evaluation.service";

const NEGATIVE_QUESTION: EvalQuestion = {
  id: "quality-gate-negative-source",
  question: "E102 에러가 발생하면 어떻게 대응해야 해?",
  expectedSources: ["public/does-not-exist.md"],
  actor: {
    roles: [],
    teamSlugs: []
  }
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const report = await app.get(EvaluationService).run("quality-gate-smoke", [NEGATIVE_QUESTION]);
    const failedGateNames = report.gates.filter((gate) => !gate.passed).map((gate) => gate.metric);
    const ok =
      !report.passed &&
      report.sourceHitRate === 0 &&
      report.topSourceAccuracy === 0 &&
      failedGateNames.includes("sourceHitRate") &&
      failedGateNames.includes("topSourceAccuracy");

    const output = {
      ok,
      passed: report.passed,
      failedGateNames,
      gates: report.gates,
      rows: report.rows
    };

    console.log(JSON.stringify(output, null, 2));

    if (!ok) {
      throw new Error("Evaluation gate smoke test failed: expected negative source case to fail source quality gates");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
