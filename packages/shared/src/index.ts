import { createHash } from "node:crypto";

export type DocumentVisibility = "public" | "team" | "restricted";

export type SourceCitation = {
  documentId: string;
  chunkId: string;
  title: string;
  path: string;
  score: number;
};

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
