import assert from "node:assert/strict";
import test from "node:test";
import {
  AnthropicChatProvider,
  createEmbeddingProviderFromEnv,
  createChatProviderFromEnv,
  embedLocal,
  LocalEmbeddingProvider,
  LocalReranker,
  OpenAIChatProvider,
  OpenAIEmbeddingProvider,
  projectEmbedding,
  TransformersEmbeddingProvider
} from "./index";

test("local embeddings are deterministic and normalized", async () => {
  const provider = new LocalEmbeddingProvider({ dimensions: 8 });
  const first = await provider.embed("E102 payment_error /payments/refunds");
  const second = embedLocal("E102 payment_error /payments/refunds", 8);

  assert.deepEqual(first, second);
  assert.equal(first.length, 8);
  assert.ok(Math.abs(vectorNorm(first) - 1) < 0.000001);
});

test("env factory selects anthropic chat provider", () => {
  const provider = createChatProviderFromEnv({
    AI_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: "test-key",
    ANTHROPIC_CHAT_MODEL: "claude-test"
  });

  assert.ok(provider instanceof AnthropicChatProvider);
});

test("env factory selects openai embedding provider explicitly", () => {
  const provider = createEmbeddingProviderFromEnv({
    EMBEDDING_PROVIDER: "openai",
    OPENAI_API_KEY: "test-key",
    OPENAI_EMBEDDING_MODEL: "text-embedding-test",
    OPENAI_EMBEDDING_DIMENSIONS: "64"
  });

  assert.ok(provider instanceof OpenAIEmbeddingProvider);
});

test("env factory selects transformers embedding provider explicitly", () => {
  const provider = createEmbeddingProviderFromEnv({
    EMBEDDING_PROVIDER: "transformers",
    EMBEDDING_DIMENSIONS: "64",
    TRANSFORMERS_EMBEDDING_MODEL: "Xenova/multilingual-e5-small"
  });

  assert.ok(provider instanceof TransformersEmbeddingProvider);
});

test("env factory fails when openai embeddings are requested without a key", () => {
  assert.throws(
    () =>
      createEmbeddingProviderFromEnv({
        AI_PROVIDER: "openai",
        OPENAI_EMBEDDING_DIMENSIONS: "64"
      }),
    /requires OPENAI_API_KEY/
  );
});

test("transformers embedding provider projects model vectors to configured dimensions", async () => {
  const provider = new TransformersEmbeddingProvider({
    dimensions: 4,
    pipeline: async (text) => ({
      data: Float32Array.from(text.includes("timeout") ? [0.1, 0.3, 0.5, 0.7, 0.9, 1.1] : [1.1, 0.9, 0.7, 0.5, 0.3, 0.1])
    })
  });

  const first = await provider.embed("payment timeout");
  const second = await provider.embed("refund policy");

  assert.equal(first.length, 4);
  assert.equal(second.length, 4);
  assert.ok(Math.abs(vectorNorm(first) - 1) < 0.000001);
  assert.notDeepEqual(first, second);
});

test("embedding projection is deterministic and normalized", () => {
  const vector = [0.1, 0.2, 0.3, 0.4, 0.5];
  const first = projectEmbedding(vector, 3);
  const second = projectEmbedding(vector, 3);

  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.ok(Math.abs(vectorNorm(first) - 1) < 0.000001);
});

test("openai embedding provider can run without local fallback", async () => {
  const provider = new OpenAIEmbeddingProvider({
    apiKey: "openai-key",
    embeddingDimensions: 64,
    fallbackToLocal: false,
    fetchImpl: async () => new Response("rate limited", { status: 429 })
  });

  await assert.rejects(() => provider.embed("question"), /status 429/);
});

test("local reranker promotes candidates with matching incident codes and metrics", () => {
  const reranker = new LocalReranker();
  const rows = reranker.rerank("E102 payment.approval.timeout 에스컬레이션 기준은?", [
    {
      id: "generic",
      title: "일반 결제 안내",
      path: "public/payment-overview.md",
      content: "결제 승인 절차와 고객 안내 문구를 설명합니다.",
      baseScore: 0.9
    },
    {
      id: "specific",
      title: "E102 결제 오류 코드",
      path: "public/payment-error-codes.md",
      content: "E102 payment.approval.timeout 지표를 확인하고 결제 플랫폼 온콜에게 에스컬레이션합니다.",
      baseScore: 0.4
    }
  ]);

  assert.equal(rows[0]?.id, "specific");
  assert.ok((rows[0]?.rerankScore ?? 0) > (rows[1]?.rerankScore ?? 0));
  assert.ok((rows[0]?.keyTokenOverlap ?? 0) > 0);
});

test("local reranker remains deterministic", () => {
  const reranker = new LocalReranker();
  const candidates = [
    { id: "a", title: "Redis 장애", path: "team/redis.md", content: "redis_connected_clients", baseScore: 0.5 },
    { id: "b", title: "환불 정책", path: "public/refund.md", content: "refund reason", baseScore: 0.8 }
  ];

  assert.deepEqual(reranker.rerank("redis_connected_clients 확인", candidates), reranker.rerank("redis_connected_clients 확인", candidates));
});

test("anthropic provider sends messages request and parses text response", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const provider = new AnthropicChatProvider({
    apiKey: "anthropic-key",
    chatModel: "claude-test",
    fetchImpl: async (url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return new Response(JSON.stringify({ content: [{ type: "text", text: "grounded answer" }] }), { status: 200 });
    }
  });

  const answer = await provider.complete({
    system: "Answer from sources only.",
    user: "Question and sources",
    temperature: 0.2
  });

  assert.equal(answer, "grounded answer");
  assert.equal(requestUrl, "https://api.anthropic.com/v1/messages");
  assert.equal((requestInit?.headers as Record<string, string>)["x-api-key"], "anthropic-key");
  const body = JSON.parse(String(requestInit?.body)) as { model: string; system: string; messages: Array<{ content: string }> };
  assert.equal(body.model, "claude-test");
  assert.equal(body.system, "Answer from sources only.");
  assert.equal(body.messages[0].content, "Question and sources");
});

test("anthropic provider runs tool use loop and returns final answer", async () => {
  const requestBodies: unknown[] = [];
  const provider = new AnthropicChatProvider({
    apiKey: "anthropic-key",
    chatModel: "claude-test",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      requestBodies.push(body);
      if (requestBodies.length === 1) {
        return new Response(
          JSON.stringify({
            stop_reason: "tool_use",
            content: [
              { type: "text", text: "문서를 먼저 검색합니다." },
              { type: "tool_use", id: "toolu_1", name: "search_documents", input: { query: "결제 장애", limit: 3 } }
            ]
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "검색된 런북에 따르면 15분 안에 공지합니다." }]
        }),
        { status: 200 }
      );
    }
  });

  const result = await provider.completeWithTools({
    system: "Use tools before answering.",
    user: "결제 장애 대응 알려줘",
    tools: [
      {
        name: "search_documents",
        description: "Search documents",
        inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
      }
    ],
    async executeTool(tool) {
      return {
        output: {
          sourceCount: 1,
          paths: ["public/payment-runbook.md"],
          query: tool.input.query
        }
      };
    }
  });

  assert.equal(result.text, "검색된 런북에 따르면 15분 안에 공지합니다.");
  assert.equal(result.turns, 2);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, "search_documents");
  assert.equal(result.toolCalls[0].output.sourceCount, 1);

  const firstBody = requestBodies[0] as { tools?: Array<{ name: string; input_schema: unknown }> };
  assert.equal(firstBody.tools?.[0]?.name, "search_documents");
  assert.ok(firstBody.tools?.[0]?.input_schema);

  const secondBody = requestBodies[1] as { messages: Array<{ role: string; content: unknown }> };
  const toolResultMessage = secondBody.messages[2];
  assert.equal(toolResultMessage.role, "user");
  assert.match(JSON.stringify(toolResultMessage.content), /tool_result/);
  assert.match(JSON.stringify(toolResultMessage.content), /public\/payment-runbook.md/);
});

test("openai chat provider returns null on non-ok response", async () => {
  const provider = new OpenAIChatProvider({
    apiKey: "openai-key",
    embeddingDimensions: 64,
    fetchImpl: async () => new Response("rate limited", { status: 429 })
  });

  assert.equal(await provider.complete({ system: "s", user: "u" }), null);
});

function vectorNorm(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}
