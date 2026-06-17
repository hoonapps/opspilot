export type RetrievalMode = "vector" | "hybrid";

export type RetrievalResult = {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
};

export type Chunk = {
  index: number;
  content: string;
  heading?: string;
};

export type ChunkMarkdownOptions = {
  maxChunkLength?: number;
};

export type DocumentAgreement = {
  score: number;
  matchedTokenCount: number;
  answerTokenCount: number;
  sourceChunkCount: number;
  method: "token_overlap_v1";
};

const DEFAULT_MAX_CHUNK_LENGTH = 1200;

const AGREEMENT_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "must",
  "when",
  "what",
  "how",
  "are",
  "should",
  "해야",
  "어떻게",
  "무엇",
  "필요",
  "확인",
  "합니다",
  "하세요",
  "있습니다",
  "필요합니다",
  "담당자",
  "agent"
]);

export function chunkMarkdown(markdown: string, options: ChunkMarkdownOptions = {}): Chunk[] {
  const maxChunkLength = Math.max(100, options.maxChunkLength ?? DEFAULT_MAX_CHUNK_LENGTH);
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
      if (next.length > maxChunkLength && buffer) {
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

export function calculateDocumentAgreement(answer: string, sourceContents: string[]): DocumentAgreement {
  const answerTokens = new Set(tokenizeForAgreement(removeAgreementBoilerplate(answer)));
  const sourceTokens = new Set(sourceContents.flatMap((content) => tokenizeForAgreement(content)));
  const matchedTokenCount = [...answerTokens].filter((token) => sourceTokens.has(token)).length;
  const score =
    answerTokens.size === 0
      ? sourceContents.length === 0
        ? 1
        : 0
      : Number((matchedTokenCount / answerTokens.size).toFixed(3));

  return {
    score,
    matchedTokenCount,
    answerTokenCount: answerTokens.size,
    sourceChunkCount: sourceContents.length,
    method: "token_overlap_v1"
  };
}

export function removeAgreementBoilerplate(answer: string): string {
  return answer
    .split(/\n+/)
    .filter((line) => !/^\s*근거\s*:/u.test(line))
    .filter((line) => !/신뢰도가 낮거나 민감 작업이 포함되어 담당자 확인이 필요합니다/u.test(line))
    .filter((line) => !/운영 DB 변경, 권한 부여, 삭제 같은 민감 작업은 Agent가 직접 실행하지 않고 승인 요청으로 분리합니다/u.test(line))
    .join(" ");
}

export function tokenizeForAgreement(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_./:-]+/gu, " ")
    .split(/\s+/)
    .map((token) => stripParticle(token.trim()))
    .filter((token) => token.length >= 2)
    .filter((token) => !AGREEMENT_STOPWORDS.has(token));
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

function stripParticle(token: string): string {
  return token.replace(/(에서|으로|에게|한테|부터|까지|처럼|보다|은|는|이|가|을|를|도|만|와|과|로)$/u, "");
}
