import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const ROBUSTNESS_DOCUMENT_PATH = "public/retrieval-robustness-proof.md";

const ROBUSTNESS_DOCUMENT = `---
title: "검색 강건성 증명"
visibility: public
tags: rag,retrieval,stability,status-page
---
# 검색 강건성 증명

## 상태 페이지 공지 안정성

한국어 별칭: 검색 강건성, 검색 안정성, RAG 안정성, 상태 페이지 공지, 고객 공지 SLA, 15분 공지.

RRP-42는 사용자가 질문 표현을 바꿔도 같은 운영 의도라면 같은 1순위 출처가 유지되어야 함을 증명합니다.
고객 영향 장애의 첫 상태 페이지 공지는 15분 안에 게시해야 합니다.
공지에는 영향받은 기능, 현재 영향도, 다음 업데이트 예정 시각, 장애 담당자를 포함해야 합니다.
`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);

    await documents.ingestSeedDocuments();
    await documents.ingestMarkdown(ROBUSTNESS_DOCUMENT_PATH, ROBUSTNESS_DOCUMENT);

    const report = await agent.analyzeRetrievalRobustness(
      "RRP-42 검색 강건성은 무엇을 증명해?",
      { roles: ["support_agent"], teamSlugs: [] },
      ["RRP-42 검색 안정성 문서는 무엇을 검증해?", "검색 강건성 proof의 질문 변형 안정성 기준 알려줘"],
      5
    );

    const checkById = new Map(report.checks.map((check) => [check.id, check]));
    const ok =
      report.schemaVersion === "opspilot.retrieval_robustness.v1" &&
      report.baseline.topSourcePath === ROBUSTNESS_DOCUMENT_PATH &&
      report.variants.length >= 2 &&
      report.summary.topSourceStability >= 0.8 &&
      report.summary.averageSourceOverlap >= 0.5 &&
      checkById.get("top_source_stability")?.status === "pass" &&
      checkById.get("source_overlap")?.status !== "fail" &&
      report.status !== "unstable";

    console.log(
      JSON.stringify(
        {
          ok,
          status: report.status,
          recommendedAction: report.recommendedAction,
          summary: report.summary,
          checks: report.checks,
          baseline: {
            query: report.baseline.query,
            topSourcePath: report.baseline.topSourcePath,
            confidenceEstimate: report.baseline.confidenceEstimate
          },
          variants: report.variants.map((variant) => ({
            query: variant.query,
            topSourcePath: variant.topSourcePath,
            sourceOverlapWithBaseline: variant.sourceOverlapWithBaseline,
            topSourceMatchesBaseline: variant.topSourceMatchesBaseline
          }))
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Retrieval robustness smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
