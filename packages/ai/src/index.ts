export type AiProviderName = "local" | "openai" | "anthropic";
export type EmbeddingProviderName = "local" | "openai";

export type ChatCompletionInput = {
  system: string;
  user: string;
  temperature?: number;
};

export type ChatProvider = {
  complete(input: ChatCompletionInput): Promise<string | null>;
};

export type EmbeddingProvider = {
  embed(text: string): Promise<number[]>;
};

export type RerankCandidate = {
  id: string;
  title: string;
  path: string;
  content: string;
  baseScore: number;
};

export type RerankResult = {
  id: string;
  rerankScore: number;
  bm25Score: number;
  keyTokenOverlap: number;
  titlePathOverlap: number;
  baseScore: number;
};

export type OpenAIConfig = {
  apiKey: string;
  chatModel?: string;
  embeddingModel?: string;
  embeddingDimensions: number;
  fallbackToLocal?: boolean;
  fetchImpl?: typeof fetch;
};

export type AnthropicConfig = {
  apiKey: string;
  chatModel?: string;
  fetchImpl?: typeof fetch;
};

export type LocalEmbeddingConfig = {
  dimensions: number;
};

export type AiEnvironment = Record<string, string | undefined>;

export function createChatProviderFromEnv(env: AiEnvironment = process.env): ChatProvider | null {
  if (env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY) {
    return new OpenAIChatProvider({
      apiKey: env.OPENAI_API_KEY,
      chatModel: env.OPENAI_CHAT_MODEL,
      embeddingDimensions: Number(env.OPENAI_EMBEDDING_DIMENSIONS ?? 64)
    });
  }

  if (env.AI_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) {
    return new AnthropicChatProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      chatModel: env.ANTHROPIC_CHAT_MODEL
    });
  }

  return null;
}

export function createEmbeddingProviderFromEnv(env: AiEnvironment = process.env): EmbeddingProvider {
  const dimensions = Number(env.OPENAI_EMBEDDING_DIMENSIONS ?? 64);
  const provider = readEmbeddingProviderName(env);

  if (provider === "openai") {
    if (!env.OPENAI_API_KEY) {
      throw new Error("EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY");
    }

    return new OpenAIEmbeddingProvider({
      apiKey: env.OPENAI_API_KEY,
      embeddingModel: env.OPENAI_EMBEDDING_MODEL,
      embeddingDimensions: dimensions,
      fallbackToLocal: env.OPENAI_EMBEDDING_FALLBACK_TO_LOCAL === "true"
    });
  }

  return new LocalEmbeddingProvider({ dimensions });
}

function readEmbeddingProviderName(env: AiEnvironment): EmbeddingProviderName {
  const raw = env.EMBEDDING_PROVIDER ?? (env.AI_PROVIDER === "openai" ? "openai" : "local");
  if (raw === "openai" || raw === "local") {
    return raw;
  }

  throw new Error(`Unsupported EMBEDDING_PROVIDER: ${raw}`);
}

export class OpenAIChatProvider implements ChatProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: OpenAIConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async complete(input: ChatCompletionInput): Promise<string | null> {
    const response = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.chatModel ?? "gpt-4.1-mini",
        temperature: input.temperature ?? 0.1,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user }
        ]
      })
    });

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return json.choices?.[0]?.message?.content?.trim() || null;
  }
}

export class AnthropicChatProvider implements ChatProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: AnthropicConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async complete(input: ChatCompletionInput): Promise<string | null> {
    const response = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.chatModel ?? "claude-3-5-haiku-latest",
        max_tokens: 900,
        temperature: input.temperature ?? 0.1,
        system: input.system,
        messages: [{ role: "user", content: input.user }]
      })
    });

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };

    return json.content?.find((item) => item.type === "text" && item.text)?.text?.trim() || null;
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly fallback?: LocalEmbeddingProvider;

  constructor(private readonly config: OpenAIConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.fallback = config.fallbackToLocal === false ? undefined : new LocalEmbeddingProvider({ dimensions: config.embeddingDimensions });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.fetchImpl("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.embeddingModel ?? "text-embedding-3-small",
        input: text,
        dimensions: this.config.embeddingDimensions
      })
    });

    if (!response.ok) {
      return this.fallbackOrThrow(text, `OpenAI embedding request failed with status ${response.status}`);
    }

    const json = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = json.data?.[0]?.embedding;

    if (!embedding || embedding.length !== this.config.embeddingDimensions) {
      return this.fallbackOrThrow(text, `OpenAI embedding response did not contain a ${this.config.embeddingDimensions}d vector`);
    }

    return normalize(embedding);
  }

  private fallbackOrThrow(text: string, message: string): Promise<number[]> {
    if (!this.fallback) {
      throw new Error(message);
    }

    return this.fallback.embed(text);
  }
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly config: LocalEmbeddingConfig) {}

  async embed(text: string): Promise<number[]> {
    return embedLocal(text, this.config.dimensions);
  }
}

export class LocalReranker {
  rerank(question: string, candidates: RerankCandidate[]): RerankResult[] {
    if (candidates.length === 0) {
      return [];
    }

    const questionTokens = tokenizeForRanking(question);
    const keyTokens = questionTokens.filter(isKeyToken);
    const documents = candidates.map((candidate) => tokenizeForRanking(`${candidate.title} ${candidate.path} ${candidate.content}`));
    const avgDocumentLength = average(documents.map((tokens) => tokens.length)) || 1;
    const documentFrequencies = new Map<string, number>();

    for (const tokens of documents) {
      for (const token of new Set(tokens)) {
        documentFrequencies.set(token, (documentFrequencies.get(token) ?? 0) + 1);
      }
    }

    const rawRows = candidates.map((candidate, index) => {
      const documentTokens = documents[index] ?? [];
      const titlePathTokens = tokenizeForRanking(`${candidate.title} ${candidate.path}`);
      const bm25Score = bm25(questionTokens, documentTokens, avgDocumentLength, documentFrequencies, candidates.length);
      const keyTokenOverlap = overlapRatio(keyTokens, documentTokens);
      const titlePathOverlap = overlapRatio(questionTokens, titlePathTokens);
      const queryCoverage = overlapRatio(questionTokens, documentTokens);

      return {
        id: candidate.id,
        bm25Score,
        keyTokenOverlap,
        titlePathOverlap,
        queryCoverage,
        baseScore: candidate.baseScore
      };
    });

    const maxBm25 = Math.max(...rawRows.map((row) => row.bm25Score), 1);
    const maxBaseScore = Math.max(...rawRows.map((row) => row.baseScore), 1);

    return rawRows
      .map((row) => {
        const normalizedBm25 = row.bm25Score / maxBm25;
        const normalizedBase = row.baseScore / maxBaseScore;
        const rerankScore =
          normalizedBm25 * 0.42 + row.keyTokenOverlap * 0.28 + row.titlePathOverlap * 0.18 + row.queryCoverage * 0.08 + normalizedBase * 0.04;

        return {
          ...row,
          bm25Score: Number(normalizedBm25.toFixed(6)),
          baseScore: Number(normalizedBase.toFixed(6)),
          rerankScore: Number(rerankScore.toFixed(6))
        };
      })
      .sort((left, right) => right.rerankScore - left.rerankScore);
  }
}

export function embedLocal(text: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_./:-]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens) {
    const index = stableHash(token) % dimensions;
    vector[index] += tokenWeight(token);
  }

  return normalize(vector);
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

function tokenizeForRanking(text: string): string[] {
  const baseTokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_./:-]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  return baseTokens.flatMap((token) => {
    const stripped = stripKoreanParticle(token);
    const stemmed = stripKoreanPredicate(stripped);
    return [...new Set([token, stripped, stemmed].filter((value) => value.length >= 2))];
  });
}

function isKeyToken(token: string): boolean {
  return /^[a-z]?\d{2,}$/i.test(token) || token.includes(".") || token.includes("_") || token.includes("/") || token.includes("-");
}

function bm25(questionTokens: string[], documentTokens: string[], avgDocumentLength: number, documentFrequencies: Map<string, number>, documentCount: number): number {
  if (questionTokens.length === 0 || documentTokens.length === 0) {
    return 0;
  }

  const frequencies = new Map<string, number>();
  for (const token of documentTokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }

  const k1 = 1.2;
  const b = 0.75;
  const lengthFactor = 1 - b + b * (documentTokens.length / avgDocumentLength);

  return [...new Set(questionTokens)].reduce((sum, token) => {
    const frequency = frequencies.get(token) ?? 0;
    if (frequency === 0) {
      return sum;
    }

    const documentsWithToken = documentFrequencies.get(token) ?? 0;
    const idf = Math.log(1 + (documentCount - documentsWithToken + 0.5) / (documentsWithToken + 0.5));
    return sum + idf * ((frequency * (k1 + 1)) / (frequency + k1 * lengthFactor));
  }, 0);
}

function overlapRatio(needles: string[], haystack: string[]): number {
  const uniqueNeedles = [...new Set(needles)];
  if (uniqueNeedles.length === 0) {
    return 0;
  }

  const haystackSet = new Set(haystack);
  return uniqueNeedles.filter((token) => haystackSet.has(token)).length / uniqueNeedles.length;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stripKoreanParticle(token: string): string {
  return token.replace(/(에서|으로|에게|한테|부터|까지|처럼|보다|은|는|이|가|을|를|도|만|와|과|로)$/u, "");
}

function stripKoreanPredicate(token: string): string {
  return token.replace(/(합니다|한다|하는지|했는지|해야|해줘|해)$/u, "");
}
