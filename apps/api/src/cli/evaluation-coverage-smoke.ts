import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { EvalQuestion, EvaluationService } from "../evaluation/evaluation.service";

const SUITE_NAME = "coverage-smoke";
const UNCOVERED_PATH = "public/coverage-blind-spot.md";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const documents = app.get(DocumentsService);
    await documents.ingestSeedDocuments();
    await documents.ingestMarkdown(
      UNCOVERED_PATH,
      `---
title: "평가 커버리지 사각지대 문서"
visibility: public
---
# 평가 커버리지 사각지대 문서

COVERAGE-BLIND-SPOT-42 문서는 최신 평가 질문의 기대 출처에 일부러 포함하지 않습니다.
이 문서는 평가 커버리지 리포트가 미검증 문서를 찾아내는지 확인하기 위한 smoke fixture입니다.
`
    );

    const evalPath = resolveEvalPath(process.env.EVAL_SET_PATH ?? "../../seed/eval/questions.json");
    const questions = JSON.parse(await readFile(evalPath, "utf8")) as EvalQuestion[];
    const evaluations = app.get(EvaluationService);
    await evaluations.run(SUITE_NAME, questions);

    const { report } = await evaluations.coverage(SUITE_NAME);
    const blindSpot = report?.blindSpots[0];
    const uncoveredFixture = report?.documents.find((item) => item.path === UNCOVERED_PATH);
    const coveredPaymentDoc = report?.documents.find((item) => item.path === "public/payment-error-codes.md");
    const restrictedDoc = report?.documents.find((item) => item.path === "restricted/production-db-policy.md");
    const actionCommand = report?.actionItems.find((item) => item.id === "add-golden-questions")?.command;
    const ok =
      report !== null &&
      report.schemaVersion === "opspilot.evaluation_coverage.v1" &&
      report.suiteName === SUITE_NAME &&
      report.status === "gaps" &&
      report.summary.totalDocuments === report.documents.length &&
      report.summary.evalCaseCount === questions.length &&
      report.summary.coveredDocuments > 0 &&
      report.summary.uncoveredDocuments > 0 &&
      report.summary.coverageRatio > 0 &&
      report.summary.coverageRatio < 1 &&
      report.summary.restrictedCoverageRatio > 0 &&
      report.integrity.hashAlgorithm === "sha256" &&
      /^[a-f0-9]{64}$/.test(report.integrity.reportHash) &&
      report.integrity.includedFields.includes("blindSpots") &&
      coveredPaymentDoc?.coveredBy === "both" &&
      coveredPaymentDoc.expectedCaseCount > 0 &&
      restrictedDoc?.riskLevel === "low" &&
      (uncoveredFixture?.coveredBy === "none" || uncoveredFixture?.coveredBy === "actual") &&
      uncoveredFixture.expectedCaseCount === 0 &&
      uncoveredFixture.riskLevel === "medium" &&
      uncoveredFixture.recommendations.some((item) => item.includes("golden question") || item.includes("평가 질문")) &&
      Boolean(blindSpot?.suggestedQuestion) &&
      actionCommand?.includes("evaluations/coverage");

    console.log(
      JSON.stringify(
        {
          ok,
          status: report?.status,
          summary: report?.summary,
          blindSpot,
          uncoveredFixture,
          coveredPaymentDoc,
          restrictedDoc,
          actionItems: report?.actionItems,
          hash: report?.integrity.reportHash
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Evaluation coverage smoke test failed");
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
