import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { AgentService } from "../agent/agent.service";
import { DocumentsService } from "../documents/documents.service";

const PROFILE_DOCUMENT = `---
title: "검색 프로파일 증명"
visibility: public
tags: retrieval,profile,latency
---
# 검색 프로파일 증명

## 운영 검색 프로파일

PROFILE-88은 OpsPilot이 검색 단계별 latency budget, 권한 경계, 컨텍스트 예산, 프로파일 해시를 함께 보여주는지 검증합니다.
`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    await documents.ingestSeedDocuments();
    await documents.ingestMarkdown("public/retrieval-profile-proof.md", PROFILE_DOCUMENT);
    const report = await agent.profileRetrieval(
      "PROFILE-88 운영 검색 프로파일은 무엇을 보여줘?",
      { roles: ["support_agent"], teamSlugs: [] },
      5
    );
    const stageIds = new Set(report.stages.map((stage) => stage.id));
    const topCandidate = report.preview.candidates[0];
    const ok =
      report.schemaVersion === "opspilot.retrieval_profile.v1" &&
      /^[a-f0-9]{64}$/.test(report.profileHash) &&
      report.integrity.hash === report.profileHash &&
      report.summary.endToEndMs >= report.summary.searchMs &&
      report.summary.searchMs >= 0 &&
      report.summary.allowedCandidateCount >= report.preview.candidates.length &&
      report.summary.candidateWindow >= report.limit &&
      report.summary.contextTokenUseRatio >= 0 &&
      stageIds.has("normalize_query") &&
      stageIds.has("search_with_audit") &&
      stageIds.has("diagnostics") &&
      stageIds.has("candidate_packaging") &&
      stageIds.has("release_decision") &&
      report.stages.every((stage) => stage.durationMs >= 0 && stage.budgetMs > 0) &&
      report.bottlenecks.length > 0 &&
      topCandidate?.path === "public/retrieval-profile-proof.md" &&
      topCandidate.rankingExplanation.reasonCodes.length > 0;

    console.log(
      JSON.stringify(
        {
          ok,
          status: report.status,
          profileHash: report.profileHash,
          summary: report.summary,
          stages: report.stages,
          bottlenecks: report.bottlenecks,
          topCandidate
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Retrieval profile smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
