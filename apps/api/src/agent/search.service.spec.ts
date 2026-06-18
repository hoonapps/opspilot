import { SearchService, SearchResult } from "./search.service";

describe("SearchService embedding rerank", () => {
  it("reranks candidates with embedding cosine similarity and preserves base score metadata", async () => {
    const embeddings = {
      embedForRerank: jest.fn(async (text: string) => {
        if (text === "checkout rollback decision") {
          return [1, 0, 0];
        }

        if (text.includes("Release Recovery")) {
          return [0.95, 0.05, 0];
        }

        return [0.1, 0.9, 0];
      })
    };
    const service = new SearchService({} as never, embeddings as never, {} as never, {} as never);

    const rows: SearchResult[] = [
      candidate({
        chunkId: "archive",
        title: "Archive Notice",
        path: "public/archive.md",
        content: "Old generic operational note.",
        score: 0.99
      }),
      candidate({
        chunkId: "release",
        title: "Release Recovery",
        path: "public/release-recovery-guide.md",
        content: "Roll back the previous stable artifact when checkout failures rise.",
        score: 0.4
      })
    ];

    const results = await (
      service as unknown as {
        embeddingRerank(question: string, rows: SearchResult[], limit: number): Promise<SearchResult[]>;
      }
    ).embeddingRerank("checkout rollback decision", rows, 2);

    expect(results[0]?.path).toBe("public/release-recovery-guide.md");
    expect(results[0]?.retrieval.rerankMethod).toBe("embedding_cosine_v1");
    expect(results[0]?.retrieval.baseScore).toBe(0.4);
    expect(results[0]?.retrieval.rerankRank).toBe(1);
    expect(embeddings.embedForRerank).toHaveBeenCalledTimes(3);
  });
});

function candidate(input: {
  chunkId: string;
  title: string;
  path: string;
  content: string;
  score: number;
}): SearchResult {
  return {
    chunkId: input.chunkId,
    documentId: `${input.chunkId}-document`,
    title: input.title,
    path: input.path,
    visibility: "public",
    content: input.content,
    score: input.score,
    metadata: {},
    retrieval: {
      mode: "vector",
      vectorScore: input.score
    }
  };
}
