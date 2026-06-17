import { Injectable } from "@nestjs/common";

export type Chunk = {
  index: number;
  content: string;
  heading?: string;
};

@Injectable()
export class ChunkerService {
  chunk(markdown: string): Chunk[] {
    const sections = markdown
      .split(/\n(?=#{1,3}\s)/g)
      .map((section) => section.trim())
      .filter(Boolean);

    const chunks: Chunk[] = [];
    for (const section of sections.length > 0 ? sections : [markdown]) {
      const heading = section.match(/^#{1,3}\s+(.+)$/m)?.[1];
      const paragraphs = section.split(/\n{2,}/g).filter(Boolean);
      let buffer = "";

      for (const paragraph of paragraphs) {
        const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
        if (next.length > 1200 && buffer) {
          chunks.push({ index: chunks.length, content: buffer, heading });
          buffer = paragraph;
        } else {
          buffer = next;
        }
      }

      if (buffer) {
        chunks.push({ index: chunks.length, content: buffer, heading });
      }
    }

    return mergeHeadingOnlyChunks(chunks).map((chunk, index) => ({ ...chunk, index }));
  }
}

function mergeHeadingOnlyChunks(chunks: Chunk[]): Chunk[] {
  const merged: Chunk[] = [];

  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];
    if (previous && isHeadingOnly(previous.content)) {
      merged[merged.length - 1] = {
        ...chunk,
        content: `${previous.content}\n\n${chunk.content}`,
        heading: chunk.heading ?? previous.heading
      };
      continue;
    }
    merged.push(chunk);
  }

  return merged;
}

function isHeadingOnly(content: string): boolean {
  return /^#{1,3}\s+.+$/u.test(content.trim());
}
