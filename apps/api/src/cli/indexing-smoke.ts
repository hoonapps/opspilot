import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const SMOKE_DOCUMENT_PATH = "public/status-page-policy.md";

const SMOKE_DOCUMENT = `---
title: "상태 페이지 장애 공지 기준"
visibility: public
tags: incident,status-page,communication
---
# 상태 페이지 장애 공지 기준

## 고객 공지 SLA

한국어 별칭: 장애 공지, 상태 페이지 공지, 고객 공지 SLA, 15분 공지.

고객 영향 장애가 확인되면 첫 상태 페이지 공지는 15분 안에 게시합니다.
공지에는 영향받은 기능, 현재 영향도, 다음 업데이트 예정 시각, 장애 담당자를 반드시 포함합니다.
`;

const UPDATED_SMOKE_DOCUMENT = `${SMOKE_DOCUMENT}
장애가 정산에 영향을 주면 업데이트 담당자 목록에 finance on-call engineer를 추가합니다.
`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);

    await documents.ingestSeedDocuments();
    await documents.ingestMarkdown(SMOKE_DOCUMENT_PATH, SMOKE_DOCUMENT);
    const ingested = await documents.ingestMarkdown(SMOKE_DOCUMENT_PATH, UPDATED_SMOKE_DOCUMENT);
    const inventory = await documents.listInventory();
    const indexedDocument = inventory.documents.find((document) => document.path === SMOKE_DOCUMENT_PATH);
    const versionHistory = indexedDocument ? await documents.getVersionHistory(indexedDocument.id) : null;
    const response = await agent.ask(
      "settlement 장애 공지에서 finance on-call engineer를 update owner list에 추가해야 하는 기준은 뭐야?",
      { roles: [], teamSlugs: [] },
      "indexing-smoke"
    );
    const topSource = response.sources[0];
    const versionHistoryOk =
      versionHistory !== null &&
      indexedDocument !== undefined &&
      versionHistory.versions.length >= 2 &&
      versionHistory.document.latestVersion === indexedDocument.latestVersion &&
      versionHistory.latestDiff !== null &&
      versionHistory.latestDiff.toVersion === versionHistory.document.latestVersion &&
      versionHistory.latestDiff.addedLineCount >= 0;
    const ok =
      topSource?.path === SMOKE_DOCUMENT_PATH &&
      response.answer.includes("finance") &&
      versionHistoryOk;

    const report = {
      ok,
      ingested,
      versionHistory: versionHistory
        ? {
            latestVersion: versionHistory.document.latestVersion,
            versionCount: versionHistory.versions.length,
            latestDiff: versionHistory.latestDiff
          }
        : null,
      topSource: topSource
        ? {
            title: topSource.title,
            path: topSource.path,
            score: topSource.score
          }
        : null,
      answerPreview: response.answer.slice(0, 240)
    };

    console.log(JSON.stringify(report, null, 2));

    if (!ok) {
      throw new Error(`Indexing smoke test failed: expected top source ${SMOKE_DOCUMENT_PATH}`);
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
