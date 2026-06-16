import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Job, Queue, QueueEvents, type ConnectionOptions } from "bullmq";
import { sha256 } from "../shared/hash";

export const INDEXING_QUEUE_NAME = "opspilot.indexing";
export const INDEX_MARKDOWN_JOB_NAME = "index-markdown";

export type IndexMarkdownJobData = {
  path: string;
  markdown: string;
  requestedAt: string;
  source: "api" | "smoke";
};

export type IndexMarkdownJobResult = {
  path: string;
  title: string;
  chunks: number;
  changed: boolean;
};

export type IndexingJobStatus = {
  id: string;
  name: string;
  queueName: string;
  state: string;
  progress: boolean | number | object | string;
  attemptsMade: number;
  failedReason?: string;
  result?: IndexMarkdownJobResult | null;
};

@Injectable()
export class IndexingQueueService implements OnModuleDestroy {
  private readonly queue = new Queue<IndexMarkdownJobData, IndexMarkdownJobResult>(INDEXING_QUEUE_NAME, {
    connection: redisConnectionOptions(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 500 },
      removeOnComplete: 50,
      removeOnFail: 100
    }
  });
  private readonly queueEvents = new QueueEvents(INDEXING_QUEUE_NAME, { connection: redisConnectionOptions() });

  async enqueueMarkdown(input: { path: string; markdown: string; source?: "api" | "smoke" }): Promise<IndexingJobStatus> {
    const job = await this.queue.add(
      INDEX_MARKDOWN_JOB_NAME,
      {
        path: input.path,
        markdown: input.markdown,
        requestedAt: new Date().toISOString(),
        source: input.source ?? "api"
      },
      {
        jobId: `markdown-${sha256(`${input.path}:${input.markdown}:${Date.now()}`)}`
      }
    );

    return serializeJob(job);
  }

  async getJobStatus(id: string): Promise<IndexingJobStatus | null> {
    const job = await this.queue.getJob(id);
    return job ? serializeJob(job) : null;
  }

  async waitForJob(id: string, timeoutMs = 15000): Promise<IndexMarkdownJobResult> {
    const job = await this.queue.getJob(id);
    if (!job) {
      throw new Error(`Indexing job not found: ${id}`);
    }

    await this.queueEvents.waitUntilReady();
    return job.waitUntilFinished(this.queueEvents, timeoutMs);
  }

  async onModuleDestroy() {
    await this.queueEvents.close();
    await this.queue.close();
  }
}

export function redisConnectionOptions(): ConnectionOptions {
  const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  const db = redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : undefined;

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
    password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
    db: Number.isFinite(db) ? db : undefined
  };
}

async function serializeJob(job: Job<IndexMarkdownJobData, IndexMarkdownJobResult>): Promise<IndexingJobStatus> {
  return {
    id: String(job.id),
    name: job.name,
    queueName: INDEXING_QUEUE_NAME,
    state: await job.getState(),
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    result: job.returnvalue ?? null
  };
}
