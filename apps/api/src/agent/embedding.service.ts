import { Injectable } from "@nestjs/common";

const DIMENSIONS = 64;

@Injectable()
export class EmbeddingService {
  dimensions(): number {
    return DIMENSIONS;
  }

  embed(text: string): number[] {
    const vector = Array.from({ length: DIMENSIONS }, () => 0);
    const tokens = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_./:-]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean);

    for (const token of tokens) {
      const index = stableHash(token) % DIMENSIONS;
      vector[index] += tokenWeight(token);
    }

    return normalize(vector);
  }

  toSqlVector(vector: number[]): string {
    return `[${vector.map((value) => Number(value.toFixed(6))).join(",")}]`;
  }
}

function stableHash(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tokenWeight(token: string): number {
  if (/^[A-Z]?\d{2,}|[a-z]+_[a-z_]+|\/[a-z0-9/-]+$/i.test(token)) {
    return 2.2;
  }
  return 1;
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}
