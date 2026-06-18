import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { EvaluationService } from "../evaluation/evaluation.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const { report } = await app.get(EvaluationService).retrieval("seed-ops-wiki");
    const ok =
      report.schemaVersion === "opspilot.retrieval_evaluation.v1" &&
      report.total >= 4 &&
      report.metrics.recallAt1 >= 0.75 &&
      report.metrics.recallAt3 >= 1 &&
      report.metrics.recallAt5 >= 1 &&
      report.metrics.mrr >= 0.8 &&
      report.metrics.ndcgAt5 >= 0.8 &&
      report.gates.every((gate) => gate.passed) &&
      report.rows.every((row) => row.firstRelevantRank !== null && row.rankedSources.length > 0) &&
      report.integrity.reportHash.length === 64;

    console.log(
      JSON.stringify(
        {
          ok,
          status: report.status,
          metrics: report.metrics,
          rows: report.rows.map((row) => ({
            id: row.id,
            expectedSources: row.expectedSources,
            rankedSources: row.rankedSources.slice(0, 5),
            firstRelevantRank: row.firstRelevantRank,
            reciprocalRank: row.reciprocalRank,
            ndcgAt5: row.ndcgAt5
          })),
          actionItems: report.actionItems,
          reportHash: report.integrity.reportHash
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Retrieval evaluation smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
