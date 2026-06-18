import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { EvaluationService } from "../evaluation/evaluation.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const { report } = await app.get(EvaluationService).embeddingComparison("seed-ops-wiki");
    const openAiEnabled = Boolean(process.env.OPENAI_API_KEY);
    const ok =
      report.schemaVersion === "opspilot.embedding_comparison.v1" &&
      report.total >= 4 &&
      report.dimensions === 64 &&
      report.baseline.provider === "local_hash_embedding" &&
      report.baseline.metrics.recallAt3 > 0 &&
      report.rows.every((row) => row.localRankedSources.length > 0 && row.localFirstRelevantRank !== null) &&
      report.integrity.reportHash.length === 64 &&
      (openAiEnabled
        ? report.candidate.available && report.candidate.metrics !== null && report.candidate.deltas.mrr !== null
        : report.status === "skipped" && report.candidate.available === false && report.actionItems.some((item) => item.id === "run-real-embedding-comparison"));

    console.log(
      JSON.stringify(
        {
          ok,
          status: report.status,
          baseline: report.baseline,
          candidate: report.candidate,
          rows: report.rows.map((row) => ({
            id: row.id,
            expectedSources: row.expectedSources,
            localRankedSources: row.localRankedSources.slice(0, 5),
            candidateRankedSources: row.candidateRankedSources.slice(0, 5),
            localFirstRelevantRank: row.localFirstRelevantRank,
            candidateFirstRelevantRank: row.candidateFirstRelevantRank,
            rankDelta: row.rankDelta
          })),
          actionItems: report.actionItems,
          reportHash: report.integrity.reportHash
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Embedding comparison smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
