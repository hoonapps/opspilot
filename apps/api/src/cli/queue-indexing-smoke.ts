import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { IndexingQueueService } from "../documents/indexing-queue.service";
import { IndexingWorkerService } from "../documents/indexing-worker.service";

const QUEUE_DOCUMENT_PATH = "public/queue-indexing-proof.md";

const QUEUE_DOCUMENT = `---
title: "Queued Indexing Proof"
visibility: public
tags: queue,bullmq,indexing
---
# Queued Indexing Proof

## Worker Completion Token

Korean aliases: 큐 색인, BullMQ 워커, QIDX-77, 비동기 색인 증거.

QIDX-77 proves that a BullMQ indexing worker completed the queued Markdown job and made the document searchable through RAG.
`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const queue = app.get(IndexingQueueService);
    const worker = app.get(IndexingWorkerService);
    const agent = app.get(AgentService);

    const workerStatus = worker.start();
    const queued = await queue.enqueueMarkdown({
      path: QUEUE_DOCUMENT_PATH,
      markdown: QUEUE_DOCUMENT,
      source: "smoke"
    });
    const result = await queue.waitForJob(queued.id, 20000);
    const status = await queue.getJobStatus(queued.id);
    const response = await agent.ask("QIDX-77 큐 색인 완료 증거는 무엇을 말해야 해?", { roles: [], teamSlugs: [] }, "queue-indexing-smoke");
    const topSource = response.sources[0];
    const ok =
      result.path === QUEUE_DOCUMENT_PATH &&
      status?.state === "completed" &&
      topSource?.path === QUEUE_DOCUMENT_PATH &&
      response.answer.includes("QIDX-77") &&
      /BullMQ|worker|워커/i.test(response.answer);

    const report = {
      ok,
      worker: workerStatus,
      queued,
      completed: status,
      topSource: topSource
        ? {
            title: topSource.title,
            path: topSource.path,
            score: topSource.score
          }
        : null,
      answerPreview: response.answer.slice(0, 260)
    };

    console.log(JSON.stringify(report, null, 2));

    if (!ok) {
      throw new Error(`Queue indexing smoke test failed: expected top source ${QUEUE_DOCUMENT_PATH}`);
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
