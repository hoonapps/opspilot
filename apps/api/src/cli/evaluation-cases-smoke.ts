import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { EvalQuestion, EvaluationService } from "../evaluation/evaluation.service";

const SUITE_NAME = "case-detail-smoke";
const QUESTIONS: EvalQuestion[] = [
  {
    id: "case-pass-e102",
    question: "E102 에러가 발생하면 어떻게 대응해야 해?",
    expectedSources: ["public/payment-error-codes.md"],
    actor: { roles: [], teamSlugs: [] }
  },
  {
    id: "case-fail-source",
    question: "E102 에러가 발생하면 어떻게 대응해야 해?",
    expectedSources: ["public/does-not-exist.md"],
    actor: { roles: [], teamSlugs: [] }
  }
];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const evaluations = app.get(EvaluationService);
    await evaluations.run(SUITE_NAME, QUESTIONS);
    const { report } = await evaluations.cases(SUITE_NAME);
    const passedCase = report?.cases.find((item) => item.id === "case-pass-e102");
    const failedCase = report?.cases.find((item) => item.id === "case-fail-source");
    const ok =
      report !== null &&
      report.total === 2 &&
      report.summary.failed >= 1 &&
      report.summary.highRisk >= 1 &&
      passedCase?.checks.some((check) => check.id === "source_hit" && check.status === "pass") &&
      failedCase?.status === "fail" &&
      failedCase.riskLevel === "high" &&
      failedCase.checks.some((check) => check.id === "source_hit" && check.status === "fail") &&
      failedCase.recommendations.length > 0;

    console.log(
      JSON.stringify(
        {
          ok,
          suiteName: report?.suiteName,
          runId: report?.runId,
          summary: report?.summary,
          cases: report?.cases.map((item) => ({
            id: item.id,
            status: item.status,
            riskLevel: item.riskLevel,
            recommendations: item.recommendations
          }))
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Evaluation cases smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
