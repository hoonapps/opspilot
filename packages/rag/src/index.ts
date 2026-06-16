export type RetrievalMode = "vector" | "hybrid";

export type RetrievalResult = {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
};
