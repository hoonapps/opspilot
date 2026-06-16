import assert from "node:assert/strict";
import test from "node:test";
import {
  AnthropicChatProvider,
  createChatProviderFromEnv,
  embedLocal,
  LocalEmbeddingProvider,
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
