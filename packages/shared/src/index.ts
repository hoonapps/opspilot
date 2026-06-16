export type DocumentVisibility = "public" | "team" | "restricted";

export type SourceCitation = {
  documentId: string;
  chunkId: string;
  title: string;
  path: string;
  score: number;
};
