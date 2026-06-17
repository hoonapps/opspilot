import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { EvalQuestion, EvaluationService } from "../evaluation/evaluation.service";

const HISTORY_SUITE = "history-smoke";
const HISTORY_QUESTION: EvalQuestion = {
  id: "history-error-e102",
  question: "E102 에러가 발생하면 어떻게 대응해야 해?",
  expectedSources: ["public/payment-error-codes.md"],
  actor: {
    roles: [],
    teamSlugs: []
  }
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const evaluations = app.get(EvaluationService);
    await evaluations.run(HISTORY_SUITE, [HISTORY_QUESTION]);
    await evaluations.run(HISTORY_SUITE, [HISTORY_QUESTION]);

    const history = await evaluations.history(HISTORY_SUITE, 2);
    const [latest, previous] = history.items;
    const ok =
      history.count >= 2 &&
      latest?.runId !== undefined &&
      previous?.runId !== undefined &&
      latest.runId !== previous.runId &&
      latest.passed &&
      previous.passed &&
      latest.metrics.sourceHitRate === 1 &&
      latest.metrics.citationAccuracy === 1 &&
      latest.deltas.sourceHitRate === 0 &&
      latest.deltas.documentAgreementScore === 0;

    console.log(JSON.stringify({ ok, history }, null, 2));

    if (!ok) {
      throw new Error("Evaluation history smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
