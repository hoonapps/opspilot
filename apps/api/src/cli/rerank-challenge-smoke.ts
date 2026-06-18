import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { EvalQuestion, EvaluationService } from "../evaluation/evaluation.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const documents = app.get(DocumentsService);
    await documents.resetDocuments(false);

    const fixtureRoot = resolve(join(process.cwd(), "../../seed/rerank-challenge/documents"));
    const documentPaths = await listMarkdownFiles(fixtureRoot);
    for (const filePath of documentPaths) {
      await documents.ingestMarkdown(relative(fixtureRoot, filePath), await readFile(filePath, "utf8"));
    }

    const questions = JSON.parse(await readFile(resolve(join(process.cwd(), "../../seed/eval/rerank-challenge.json")), "utf8")) as EvalQuestion[];
    const { report } = await app.get(EvaluationService).retrieval("rerank-challenge", questions);
    const row = report.rows[0];
    const expectedSource = questions[0]?.expectedSources[0];
    const ok =
      report.schemaVersion === "opspilot.retrieval_evaluation.v1" &&
      report.suiteName === "rerank-challenge" &&
      report.total === 1 &&
      row?.baseRankedSources[0] !== expectedSource &&
      row?.rankedSources[0] === expectedSource &&
      row?.baseFirstRelevantRank !== null &&
      row?.firstRelevantRank === 1 &&
      typeof row?.rankDelta === "number" &&
      row.rankDelta > 0 &&
      report.baselineMetrics.recallAt1 === 0 &&
      report.metrics.recallAt1 === 1 &&
      report.reranking.deltas.recallAt1 === 1 &&
      report.reranking.deltas.mrr > 0 &&
      report.reranking.changedTopSourceCount >= 1;

    console.log(
      JSON.stringify(
        {
          ok,
          status: report.status,
          baselineMetrics: report.baselineMetrics,
          metrics: report.metrics,
          reranking: report.reranking,
          rows: report.rows.map((item) => ({
            id: item.id,
            expectedSources: item.expectedSources,
            baseTop3: item.baseRankedSources.slice(0, 3),
            rerankedTop3: item.rankedSources.slice(0, 3),
            baseFirstRelevantRank: item.baseFirstRelevantRank,
            firstRelevantRank: item.firstRelevantRank,
            rankDelta: item.rankDelta,
            baseReciprocalRank: item.baseReciprocalRank,
            reciprocalRank: item.reciprocalRank
          }))
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Rerank challenge smoke test failed");
    }
  } finally {
    await app.get(DocumentsService).resetDocuments(true);
    await app.close();
  }
}

async function listMarkdownFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(rootDir, entry.name);
      if (entry.isDirectory()) {
        return listMarkdownFiles(path);
      }

      return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
    })
  );

  return files.flat().sort();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
