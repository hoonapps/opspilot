import assert from "node:assert/strict";
import test from "node:test";
import {
  AnthropicChatProvider,
  createChatProviderFromEnv,
  embedLocal,
  LocalEmbeddingProvider,
  LocalReranker,
  OpenAIChatProvider
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
