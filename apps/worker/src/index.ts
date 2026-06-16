export type IndexingJob = {
  path: string;
  reason: "created" | "updated" | "deleted";
};

export function describeWorkerScope(): string {
  return "BullMQ indexing and Slack event workers will live here after the API MVP is stable.";
}
