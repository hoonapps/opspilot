import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Worker } from "bullmq";
import { DocumentsService } from "./documents.service";
import {
  INDEXING_QUEUE_NAME,
  INDEX_MARKDOWN_JOB_NAME,
  IndexMarkdownJobData,
  IndexMarkdownJobResult,
  redisConnectionOptions
} from "./indexing-queue.service";

@Injectable()
export class IndexingWorkerService implements OnModuleDestroy {
  private worker?: Worker<IndexMarkdownJobData, IndexMarkdownJobResult>;
  private readonly concurrency = Number(process.env.INDEXING_WORKER_CONCURRENCY ?? 2);

  constructor(private readonly documentsService: DocumentsService) {}

  start(): { queueName: string; running: boolean; concurrency: number } {
    if (!this.worker) {
      this.worker = new Worker<IndexMarkdownJobData, IndexMarkdownJobResult>(
        INDEXING_QUEUE_NAME,
        async (job) => {
          if (job.name !== INDEX_MARKDOWN_JOB_NAME) {
            throw new Error(`Unsupported indexing job: ${job.name}`);
          }

          await job.updateProgress({ stage: "ingesting", path: job.data.path });
          const result = await this.documentsService.ingestMarkdown(job.data.path, job.data.markdown);
          await job.updateProgress({ stage: "indexed", path: result.path, chunks: result.chunks });
          return result;
        },
        { connection: redisConnectionOptions(), concurrency: this.concurrency }
      );

      this.worker.on("failed", (job, error) => {
        console.error(`[indexing-worker] job ${job?.id ?? "unknown"} failed`, error);
      });
    }

    return {
      ...this.status(),
      running: true
    };
  }

  status(): { queueName: string; running: boolean; concurrency: number } {
    return {
      queueName: INDEXING_QUEUE_NAME,
      running: Boolean(this.worker),
      concurrency: this.concurrency
    };
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
      this.worker = undefined;
    }
  }
}
