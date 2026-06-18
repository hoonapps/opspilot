import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDocumentAgreement,
  calculateSemanticDocumentAgreement,
  chunkMarkdown,
  removeAgreementBoilerplate,
  tokenizeForAgreement
} from "./index";

test("chunkMarkdown preserves headings and merges heading-only chunks", () => {
  const chunks = chunkMarkdown(`# 장애 대응\n\n## 결제 장애\n\n첫 공지는 15분 안에 남깁니다.\n\n## 승인\n\n운영 DB 수정은 승인 후 처리합니다.`);

  assert.equal(chunks.length, 2);
  assert.deepEqual(
    chunks.map((chunk) => chunk.index),
    [0, 1]
  );
  assert.equal(chunks[0].heading, "결제 장애");
  assert.match(chunks[0].content, /# 장애 대응/u);
  assert.match(chunks[0].content, /첫 공지는 15분 안에/u);
  assert.equal(chunks[1].heading, "승인");
});

test("chunkMarkdown splits long sections by paragraph without losing content", () => {
  const first = "A".repeat(80);
  const second = "B".repeat(80);
  const chunks = chunkMarkdown(`# Runbook\n\n${first}\n\n${second}`, { maxChunkLength: 100 });

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].content.includes(first), true);
  assert.equal(chunks[1].content.includes(second), true);
  assert.equal(chunks.map((chunk) => chunk.content).join("\n\n").includes(first), true);
  assert.equal(chunks.map((chunk) => chunk.content).join("\n\n").includes(second), true);
});

test("tokenizeForAgreement normalizes Korean particles and removes boilerplate", () => {
  const cleaned = removeAgreementBoilerplate("첫 공지는 15분 안에 남깁니다.\n근거: public/status-page-policy.md");
  const tokens = tokenizeForAgreement(`${cleaned} 결제에서 오류를 확인합니다.`);

  assert.equal(cleaned.includes("근거:"), false);
  assert.equal(tokens.includes("결제"), true);
  assert.equal(tokens.includes("확인"), false);
});

test("calculateDocumentAgreement scores normalized answer tokens against source chunks", () => {
  const agreement = calculateDocumentAgreement(
    "첫 공지는 15분 안에 남기고, 운영 DB 수정은 승인 요청으로 분리합니다.\n근거: public/status-page-policy.md",
    ["상태 페이지 첫 공지는 15분 안에 남깁니다.", "운영 DB 수정은 사람 승인 요청으로 분리합니다."]
  );

  assert.equal(agreement.method, "token_overlap_v1");
  assert.equal(agreement.sourceChunkCount, 2);
  assert.equal(agreement.score, 0.9);
});

test("calculateSemanticDocumentAgreement scores answer against the closest embedded source chunk", async () => {
  const agreement = await calculateSemanticDocumentAgreement(
    "고객 안내는 SLA 안에 발송합니다.",
    ["상태 페이지 공지는 15분 안에 게시합니다.", "사무실 점심 주문 공지는 총무 채널에서 처리합니다."],
    {
      async embed(text: string) {
        if (text.includes("고객 안내") || text.includes("상태 페이지")) {
          return [1, 0, 0];
        }
        return [0, 1, 0];
      }
    }
  );

  assert.equal(agreement.method, "semantic_embedding_v1");
  assert.equal(agreement.sourceChunkCount, 2);
  assert.equal(agreement.bestSourceIndex, 0);
  assert.equal(agreement.semanticSimilarity, 1);
  assert.equal(agreement.sourceSimilarities?.[0], 1);
  assert.equal(agreement.sourceSimilarities?.[1], 0);
  assert.equal(agreement.tokenOverlapScore, 0.2);
  assert.equal(agreement.semanticSimilarity > agreement.tokenOverlapScore, true);
});
