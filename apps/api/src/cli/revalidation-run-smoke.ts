import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const DOCUMENT_PATH = "public/revalidation-run-proof.md";
const TOKEN = "재검증실행증명키";
const ACTOR = { roles: ["ops_admin"], teamSlugs: ["payments"] };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);

    await documents.ingestMarkdown(
      DOCUMENT_PATH,
      `---
title: "재검증 실행 증명"
visibility: public
tags: revalidation,run,rag
---
# 재검증 실행 증명

${TOKEN} ${TOKEN} ${TOKEN}

재검증 실행은 큐 항목을 replay, quality gate, lineage로 다시 확인해야 합니다.
`
    );

    const answer = await agent.ask(`${TOKEN} 문서는 어떤 실행을 증명해?`, ACTOR, "revalidation-run-smoke");
    await sleep(20);
    await documents.ingestMarkdown(
      DOCUMENT_PATH,
      `---
title: "재검증 실행 증명"
visibility: public
tags: revalidation,run,rag
---
# 재검증 실행 증명

문서가 변경되면 큐 항목은 재검증 실행 리포트로 운영 판정을 남겨야 합니다.
Replay, quality gate, lineage 결과가 한 응답에 묶여야 합니다.
`
    );

    const queue = await documents.getRevalidationQueue(100);
    const item = queue.items.find((candidate) => candidate.answer.id === answer.answerId && candidate.document.path === DOCUMENT_PATH);
    if (!item) {
      throw new Error("Revalidation queue item was not created");
    }

    const run = await documents.runRevalidation({ documentId: item.document.id, answerId: item.answer.id }, ACTOR);
    const history = await documents.listRevalidationRuns(20);
    const historyRun = history.runs.find((candidate) => candidate.id === run.runId);
    const ok =
      run.schemaVersion === "opspilot.document_revalidation_run.v1" &&
      history.schemaVersion === "opspilot.document_revalidation_run_history.v1" &&
      /^[0-9a-f-]{36}$/.test(run.runId) &&
      run.queueItem.id === item.id &&
      run.persistence.stored === true &&
      /^[a-f0-9]{64}$/.test(run.persistence.reportHash) &&
      /^[a-f0-9]{64}$/.test(run.artifactHashes.replay) &&
      /^[a-f0-9]{64}$/.test(run.artifactHashes.qualityGate) &&
      /^[a-f0-9]{64}$/.test(run.artifactHashes.lineage) &&
      run.artifacts.replay.answerId === answer.answerId &&
      run.artifacts.qualityGate.answerId === answer.answerId &&
      run.artifacts.lineage.answerId === answer.answerId &&
      run.summary.sourceAccessRechecked === true &&
      /^[a-f0-9]{64}$/.test(run.summary.lineageIntegrityHash) &&
      run.checks.some((check) => check.id === "replay_stable") &&
      run.evidenceLinks.replay === `/answers/${answer.answerId}/replay` &&
      historyRun?.reportHash === run.persistence.reportHash &&
      historyRun?.artifactHashes.replay === run.artifactHashes.replay &&
      history.summary.runCount > 0 &&
      ["cleared", "needs_review", "blocked"].includes(run.status);

    console.log(
      JSON.stringify(
        {
          ok,
          status: run.status,
          runId: run.runId,
          persistence: run.persistence,
          history: history.summary,
          decision: run.decision,
          summary: run.summary,
          checkStatuses: Object.fromEntries(run.checks.map((check) => [check.id, check.status]))
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Document revalidation run smoke test failed");
    }
  } finally {
    await app.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
