import { isDocumentInventoryQuestion, selectGroundedSourcesForAnswer } from "./agent.service";
import { SearchResult } from "./search.service";

describe("selectGroundedSourcesForAnswer", () => {
  it("drops retrieval candidates when confidence is below the unsupported answer threshold", () => {
    const sources = [candidate({ chunkId: "low", score: 0.006 })];

    expect(selectGroundedSourcesForAnswer(sources, 0.006, 0.15)).toEqual([]);
  });

  it("keeps retrieval candidates when confidence meets the unsupported answer threshold", () => {
    const sources = [candidate({ chunkId: "supported", score: 0.7 })];

    expect(selectGroundedSourcesForAnswer(sources, 0.15, 0.15)).toBe(sources);
  });
});

describe("isDocumentInventoryQuestion", () => {
  it("detects Korean document inventory questions", () => {
    expect(isDocumentInventoryQuestion("지금 무슨 문서있어?")).toBe(true);
    expect(isDocumentInventoryQuestion("등록된 문서 목록 보여줘")).toBe(true);
  });

  it("does not treat normal grounded questions as inventory requests", () => {
    expect(isDocumentInventoryQuestion("E102 문서 기준으로 어떻게 대응해야 해?")).toBe(false);
  });
});

function candidate(input: { chunkId: string; score: number }): SearchResult {
  return {
    chunkId: input.chunkId,
    documentId: `${input.chunkId}-document`,
    title: "운영 문서",
    path: `public/${input.chunkId}.md`,
    visibility: "public",
    content: "운영 문서 내용",
    score: input.score,
    metadata: {},
    retrieval: {
      mode: "vector",
      vectorScore: input.score
    }
  };
}
