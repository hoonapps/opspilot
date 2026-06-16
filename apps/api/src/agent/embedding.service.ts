import { Injectable } from "@nestjs/common";
import { createEmbeddingProviderFromEnv, embedLocal } from "@opspilot/ai";

const DIMENSIONS = 64;

@Injectable()
export class EmbeddingService {
  dimensions(): number {
    return DIMENSIONS;
  }

  async embed(text: string): Promise<number[]> {
    return createEmbeddingProviderFromEnv({
      ...process.env,
      OPENAI_EMBEDDING_DIMENSIONS: String(DIMENSIONS)
    }).embed(text);
  }

  embedLocal(text: string): number[] {
    return embedLocal(text, DIMENSIONS);
  }

  toSqlVector(vector: number[]): string {
    return `[${vector.map((value) => Number(value.toFixed(6))).join(",")}]`;
  }
}
