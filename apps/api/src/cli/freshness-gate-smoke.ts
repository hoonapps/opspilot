import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { EvalQuestion, EvaluationService } from "../evaluation/evaluation.service";
import { ObservabilityService } from "../observability/observability.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const evaluations = app.get(EvaluationService);
    const observability = app.get(ObservabilityService);
    const evalPath = resolveEvalPath(process.env.EVAL_SET_PATH ?? "../../seed/eval/questions.json");
    const questions = JSON.parse(await readFile(evalPath, "utf8")) as EvalQuestion[];

    await documents.ingestSeedDocuments();
    await evaluations.run("seed-ops-wiki", questions);

    const freshGate = await observability.releaseGate();
    const freshCheck = findFreshnessCheck(freshGate.checks);

    await sleep(25);
    await documents.ingestMarkdown(
      "public/freshness-gate-smoke.md",
      `---
title: "평가 최신성 Smoke 문서"
visibility: public
tags: freshness,quality
---
# 평가 최신성 Smoke 문서

FRESHNESS-GATE-${Date.now()}: 평가 이후 변경된 문서를 감지해야 합니다.
`
    );

    const staleGate = await observability.releaseGate();
    const staleCheck = findFreshnessCheck(staleGate.checks);

    await evaluations.run("seed-ops-wiki", questions);
    const recoveredGate = await observability.releaseGate();
    const recoveredCheck = findFreshnessCheck(recoveredGate.checks);

    const ok =
      freshCheck.status === "pass" &&
      staleCheck.status === "warn" &&
      staleGate.summary.knowledgeFreshness.changedDocumentsSinceEval >= 1 &&
      recoveredCheck.status === "pass" &&
      recoveredGate.summary.knowledgeFreshness.changedDocumentsSinceEval === 0;

    console.log(
      JSON.stringify(
        {
          ok,
          fresh: {
            status: freshCheck.status,
            summary: freshGate.summary.knowledgeFreshness
          },
          stale: {
            status: staleCheck.status,
            summary: staleGate.summary.knowledgeFreshness
          },
          recovered: {
            status: recoveredCheck.status,
            summary: recoveredGate.summary.knowledgeFreshness
          }
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Knowledge freshness gate smoke test failed");
    }
  } finally {
    await app.close();
  }
}

function findFreshnessCheck(checks: Array<{ id: string; status: string }>) {
  const check = checks.find((item) => item.id === "knowledge_freshness");
  if (!check) {
    throw new Error("knowledge_freshness check is missing");
  }
  return check;
}

function resolveEvalPath(evalPath: string): string {
  return isAbsolute(evalPath) ? evalPath : resolve(join(process.cwd(), evalPath));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
