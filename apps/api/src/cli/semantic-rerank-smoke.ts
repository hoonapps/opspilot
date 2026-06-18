import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { EvalQuestion, EvaluationService } from "../evaluation/evaluation.service";

async function main() {
  if (process.env.RUN_SEMANTIC_RERANK_SMOKE !== "true") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: "Set RUN_SEMANTIC_RERANK_SMOKE=true to run embedding cosine rerank with the local Transformers model."
        },
        null,
        2
      )
    );
    return;
  }

  const previousEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER,
    RERANK_EMBEDDING_PROVIDER: process.env.RERANK_EMBEDDING_PROVIDER,
    EMBEDDING_DIMENSIONS: process.env.EMBEDDING_DIMENSIONS,
    TRANSFORMERS_EMBEDDING_MODEL: process.env.TRANSFORMERS_EMBEDDING_MODEL,
    RETRIEVAL_RERANKER: process.env.RETRIEVAL_RERANKER,
    RETRIEVAL_EVAL_CANDIDATE_WINDOW: process.env.RETRIEVAL_EVAL_CANDIDATE_WINDOW,
    EVAL_MIN_RETRIEVAL_RECALL_AT_3: process.env.EVAL_MIN_RETRIEVAL_RECALL_AT_3,
    EVAL_MIN_RETRIEVAL_MRR: process.env.EVAL_MIN_RETRIEVAL_MRR
  };

  process.env.AI_PROVIDER = "local";
  process.env.EMBEDDING_PROVIDER = "local";
  process.env.RERANK_EMBEDDING_PROVIDER = "transformers";
  process.env.EMBEDDING_DIMENSIONS = "64";
  process.env.TRANSFORMERS_EMBEDDING_MODEL = process.env.TRANSFORMERS_EMBEDDING_MODEL ?? "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
  process.env.RETRIEVAL_RERANKER = "embedding";
  process.env.RETRIEVAL_EVAL_CANDIDATE_WINDOW = "12";
  process.env.EVAL_MIN_RETRIEVAL_RECALL_AT_3 = "0";
  process.env.EVAL_MIN_RETRIEVAL_MRR = "0";

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const documents = app.get(DocumentsService);
    await documents.resetDocuments(false);

    const fixtureRoot = resolve(join(process.cwd(), "../../seed/embedding-hard/documents"));
    const documentPaths = await listMarkdownFiles(fixtureRoot);
    for (const filePath of documentPaths) {
      await documents.ingestMarkdown(relative(fixtureRoot, filePath), await readFile(filePath, "utf8"));
    }

    const questions = JSON.parse(await readFile(resolve(join(process.cwd(), "../../seed/eval/embedding-hard.json")), "utf8")) as EvalQuestion[];
    const { report } = await app.get(EvaluationService).retrieval("semantic-rerank", questions);
    const ok =
      report.schemaVersion === "opspilot.retrieval_evaluation.v1" &&
      report.suiteName === "semantic-rerank" &&
      report.total === questions.length &&
      report.reranking.method === "embedding_cosine_v1" &&
      report.rows.every((row) => row.rankedSources.length > 0 && row.baseRankedSources.length > 0) &&
      report.rows.some((row) => row.firstRelevantRank !== null) &&
      report.metrics.mrr >= report.baselineMetrics.mrr;

    console.log(
      JSON.stringify(
        {
          ok,
          skipped: false,
          indexProvider: process.env.EMBEDDING_PROVIDER,
          rerankProvider: process.env.RERANK_EMBEDDING_PROVIDER,
          model: process.env.TRANSFORMERS_EMBEDDING_MODEL,
          status: report.status,
          baselineMetrics: report.baselineMetrics,
          metrics: report.metrics,
          reranking: report.reranking,
          rows: report.rows.map((row) => ({
            id: row.id,
            expectedSources: row.expectedSources,
            baseTop3: row.baseRankedSources.slice(0, 3),
            rerankedTop3: row.rankedSources.slice(0, 3),
            baseFirstRelevantRank: row.baseFirstRelevantRank,
            firstRelevantRank: row.firstRelevantRank,
            rankDelta: row.rankDelta
          }))
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Semantic rerank smoke test failed");
    }
  } finally {
    await app.get(DocumentsService).resetDocuments(true);
    await app.close();
    restoreEnv(previousEnv);
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

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
