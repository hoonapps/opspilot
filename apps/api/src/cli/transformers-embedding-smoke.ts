import { TransformersEmbeddingProvider } from "@opspilot/ai";

function cosineSimilarity(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

function vectorNorm(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

async function main() {
  if (process.env.RUN_TRANSFORMERS_EMBEDDING_SMOKE !== "true") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: "Set RUN_TRANSFORMERS_EMBEDDING_SMOKE=true to download and execute the local Transformers embedding model."
        },
        null,
        2
      )
    );
    return;
  }

  const provider = new TransformersEmbeddingProvider({
    dimensions: 64,
    model: process.env.TRANSFORMERS_EMBEDDING_MODEL
  });
  const query = await provider.embed("결제 승인 타임아웃 롤백 기준");
  const related = await provider.embed("payment approval timeout rollback threshold");
  const unrelated = await provider.embed("사무실 점심 메뉴와 휴가 공지");
  const selfSimilarity = cosineSimilarity(query, query);
  const relatedSimilarity = cosineSimilarity(query, related);
  const unrelatedSimilarity = cosineSimilarity(query, unrelated);
  const ok =
    query.length === 64 &&
    related.length === 64 &&
    unrelated.length === 64 &&
    Math.abs(vectorNorm(query) - 1) < 0.000001 &&
    selfSimilarity > 0.99 &&
    relatedSimilarity > unrelatedSimilarity;

  console.log(
    JSON.stringify(
      {
        ok,
        skipped: false,
        model: process.env.TRANSFORMERS_EMBEDDING_MODEL ?? "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
        dimensions: query.length,
        selfSimilarity: Number(selfSimilarity.toFixed(6)),
        relatedSimilarity: Number(relatedSimilarity.toFixed(6)),
        unrelatedSimilarity: Number(unrelatedSimilarity.toFixed(6))
      },
      null,
      2
    )
  );

  if (!ok) {
    throw new Error("Transformers embedding smoke test failed");
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
