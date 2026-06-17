import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const SMOKE_DOCUMENT_PATH = "public/status-page-policy.md";

const SMOKE_DOCUMENT = `---
title: "Status Page Incident Communication"
visibility: public
tags: incident,status-page,communication
---
# Status Page Incident Communication

## Customer Notice SLA

Korean aliases: 장애 공지, 상태 페이지 공지, 고객 공지 SLA, 15분 공지.

When a customer-impacting incident is confirmed, publish the first status page notice within 15 minutes.
The notice must include affected feature, current impact, next update time, and incident owner.
`;

const UPDATED_SMOKE_DOCUMENT = `${SMOKE_DOCUMENT}
If the incident impacts settlement, add the finance on-call engineer to the update owner list.
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
      "고객 공지 SLA와 15분 공지 기준은 무엇이야?",
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
      response.answer.includes("15") &&
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
