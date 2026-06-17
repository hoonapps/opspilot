import assert from "node:assert/strict";
import test from "node:test";
import { sha256, type DocumentVisibility, type SourceCitation } from "./index";

test("sha256 returns stable lowercase hex digests", () => {
  assert.equal(sha256("opspilot"), "257778380dd1f824f3d30614358c1ca21aa67638ce966d8c7d688a5c8d6fa78b");
  assert.equal(sha256("opspilot").length, 64);
  assert.equal(/^[a-f0-9]{64}$/u.test(sha256("opspilot")), true);
});

test("shared citation and visibility contracts stay explicit", () => {
  const visibility: DocumentVisibility = "restricted";
  const citation: SourceCitation = {
    documentId: "doc_1",
    chunkId: "chunk_1",
    title: "운영 DB 접근 정책",
    path: "restricted/production-db-policy.md",
    score: 0.91
  };

  assert.equal(visibility, "restricted");
  assert.equal(citation.path.startsWith("restricted/"), true);
});
