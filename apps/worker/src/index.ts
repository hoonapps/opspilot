export type IndexingJob = {
  path: string;
  markdown: string;
  requestedAt: string;
};

export const indexingQueueName = "opspilot.indexing";

export function describeWorkerScope(): string {
  return "Run the BullMQ indexing worker with `pnpm worker:indexing`; it consumes opspilot.indexing jobs from Redis.";
}
