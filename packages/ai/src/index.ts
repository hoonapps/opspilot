export type AiProviderName = "local" | "openai" | "anthropic";

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

export type OpenAIConfig = {
  apiKey: string;
  chatModel?: string;
  embeddingModel?: string;
  embeddingDimensions: number;
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

  if (env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY) {
    return new OpenAIEmbeddingProvider({
      apiKey: env.OPENAI_API_KEY,
      embeddingModel: env.OPENAI_EMBEDDING_MODEL,
      embeddingDimensions: dimensions
    });
  }

  return new LocalEmbeddingProvider({ dimensions });
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
  private readonly fallback: LocalEmbeddingProvider;

  constructor(private readonly config: OpenAIConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.fallback = new LocalEmbeddingProvider({ dimensions: config.embeddingDimensions });
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
      return this.fallback.embed(text);
    }

    const json = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = json.data?.[0]?.embedding;

    if (!embedding || embedding.length !== this.config.embeddingDimensions) {
      return this.fallback.embed(text);
    }

    return normalize(embedding);
  }
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly config: LocalEmbeddingConfig) {}

  async embed(text: string): Promise<number[]> {
    return embedLocal(text, this.config.dimensions);
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
