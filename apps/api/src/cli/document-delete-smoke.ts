import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { AgentService } from "../agent/agent.service";
import { DocumentsService } from "../documents/documents.service";

const ACTOR = { roles: ["support_agent"], teamSlugs: ["payments"] };
const DELETE_DOCUMENT_PATH = "public/uploads/delete-smoke-policy.md";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);

    await documents.resetDocuments(true);
    const ingested = await documents.ingestMarkdown(
      DELETE_DOCUMENT_PATH,
      `---
title: "삭제 Smoke 운영 정책"
visibility: public
tags: delete,document-management
---
# 삭제 Smoke 운영 정책

OPSDEL-44 문서는 개별 문서 삭제 기능이 문서, 청크, 버전, 답변 출처, Elasticsearch 미러 청크를 함께 정리해야 함을 검증합니다.
삭제 전에는 이 문서가 RAG 답변의 1순위 출처가 되어야 하고, 삭제 후에는 문서 목록과 색인 스냅샷에서 사라져야 합니다.
`
    );
    const answer = await agent.ask("OPSDEL-44 문서는 무엇을 검증해?", ACTOR, "document-delete-smoke");
    const inventoryBefore = await documents.listInventory();
    const target = inventoryBefore.documents.find((document) => document.path === DELETE_DOCUMENT_PATH);

    if (!target) {
      throw new Error("Document delete smoke failed: target document was not indexed");
    }

    const deleteResult = await documents.deleteDocument(target.id);
    const inventoryAfter = await documents.listInventory();
    const snapshotAfter = await documents.getIndexSnapshot();
    const notFoundDelete = await documents.deleteDocument(target.id);

    const ok =
      ingested.chunks > 0 &&
      answer.sources[0]?.path === DELETE_DOCUMENT_PATH &&
      deleteResult?.deleted === true &&
      deleteResult.document.path === DELETE_DOCUMENT_PATH &&
      deleteResult.removed.chunks === ingested.chunks &&
      deleteResult.removed.versions >= 1 &&
      deleteResult.removed.answerSources >= 1 &&
      deleteResult.impact.affectedAnswers >= 1 &&
      deleteResult.impact.topSourceAnswers >= 1 &&
      deleteResult.recommendations.some((recommendation) => recommendation.includes("재검증")) &&
      !inventoryAfter.documents.some((document) => document.path === DELETE_DOCUMENT_PATH) &&
      !snapshotAfter.documents.some((document) => document.path === DELETE_DOCUMENT_PATH) &&
      notFoundDelete === null;

    console.log(
      JSON.stringify(
        {
          ok,
          ingested,
          answerTopSource: answer.sources[0]?.path,
          deleteResult,
          remainingDocuments: inventoryAfter.documents.length,
          snapshotHash: snapshotAfter.snapshotHash,
          notFoundDelete
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Document delete smoke failed");
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
