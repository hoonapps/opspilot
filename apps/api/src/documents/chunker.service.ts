import { Injectable } from "@nestjs/common";
import { chunkMarkdown, type Chunk } from "@opspilot/rag";

export type { Chunk };

@Injectable()
export class ChunkerService {
  chunk(markdown: string): Chunk[] {
    return chunkMarkdown(markdown);
  }
}
