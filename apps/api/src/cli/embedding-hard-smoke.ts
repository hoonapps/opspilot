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
    const fixtureRoot = resolve(join(process.cwd(), "../../seed/embedding-hard/documents"));
    const documentPaths = await listMarkdownFiles(fixtureRoot);
    for (const filePath of documentPaths) {
      await documents.ingestMarkdown(relative(fixtureRoot, filePath), await readFile(filePath, "utf8"));
    }

    const questions = JSON.parse(await readFile(resolve(join(process.cwd(), "../../seed/eval/embedding-hard.json")), "utf8")) as EvalQuestion[];
    const { report } = await app.get(EvaluationService).embeddingComparison("embedding-hard", questions);
    const candidateExpected = Boolean(process.env.OPENAI_API_KEY) || process.env.EMBEDDING_CANDIDATE_PROVIDER === "transformers";
    const ok =
      report.schemaVersion === "opspilot.embedding_comparison.v1" &&
      report.suiteName === "embedding-hard" &&
      report.total === questions.length &&
      report.rows.every((row) => row.localRankedSources.length > 0) &&
      (candidateExpected
        ? report.candidate.available && report.candidate.metrics !== null && report.candidate.deltas.ndcgAt5 !== null
        : report.status === "skipped" && report.candidate.available === false);

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
            localTop3: row.localRankedSources.slice(0, 3),
            candidateTop3: row.candidateRankedSources.slice(0, 3),
            rankDelta: row.rankDelta
          })),
          actionItems: report.actionItems
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Embedding hard smoke test failed");
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
