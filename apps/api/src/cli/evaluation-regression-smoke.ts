import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { AgentService } from "../agent/agent.service";
import { DocumentsService } from "../documents/documents.service";
import { EvalQuestion, EvaluationService } from "../evaluation/evaluation.service";

const SUITE_NAME = "regression-smoke";
const ACTOR = {
  roles: [],
  teamSlugs: []
};

const BASE_QUESTION = {
  id: "regression-e102",
  question: "E102 에러가 발생하면 어떻게 대응해야 해?",
  actor: ACTOR
};

const FAILING_QUESTION: EvalQuestion = {
  ...BASE_QUESTION,
  id: "regression-bad-source",
  expectedSources: ["public/does-not-exist.md"]
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const evaluations = app.get(EvaluationService);
    const probe = await app.get(AgentService).ask(BASE_QUESTION.question, ACTOR, "regression-smoke-probe");
    const expectedTopSource = probe.sources[0]?.path;
    const passingQuestion: EvalQuestion = {
      ...BASE_QUESTION,
      expectedSources: expectedTopSource ? [expectedTopSource] : ["public/payment-error-codes.md"]
    };
    await evaluations.run(SUITE_NAME, [FAILING_QUESTION]);
    await evaluations.run(SUITE_NAME, [passingQuestion]);

    const { report } = await evaluations.regression(SUITE_NAME);
    const sourceDelta = report?.metricDeltas.find((item) => item.metric === "sourceHitRate");
    const actionItem = report?.actionItems[0];
    const ok =
      report !== null &&
      report.schemaVersion === "opspilot.evaluation_regression.v1" &&
      report.status === "promote" &&
      report.releaseDecision.label === "배포 가능" &&
      report.current.passed &&
      report.previous !== null &&
      report.previous.passed === false &&
      sourceDelta?.status === "improved" &&
      sourceDelta.delta === 1 &&
      report.summary.failedGateCount === 0 &&
      report.summary.highRiskCaseCount === 0 &&
      /^[a-f0-9]{64}$/.test(report.integrity.reportHash) &&
      report.integrity.includedFields.includes("metricDeltas") &&
      actionItem?.command.includes("evaluations/regression");

    console.log(
      JSON.stringify(
        {
          ok,
          status: report?.status,
          decision: report?.releaseDecision,
          summary: report?.summary,
          sourceDelta,
          hash: report?.integrity.reportHash,
          actionItems: report?.actionItems
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Evaluation regression smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
