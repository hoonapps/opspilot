import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const SNAPSHOT_DOCUMENT = `---
title: "색인 스냅샷 증명"
visibility: public
tags: snapshot,indexing,rag
---
# 색인 스냅샷 증명

## 재현 가능한 지식 베이스

KBS-77은 OpsPilot이 문서, 청크, 버전, 임베딩 커버리지, 보안 메타데이터를 하나의 스냅샷 해시로 증명함을 보여줍니다.
`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);

    await documents.ingestSeedDocuments();
    const snapshotDocumentPath = `public/index-snapshot-proof-${Date.now()}.md`;
    const before = await documents.getIndexSnapshot();
    const repeat = await documents.getIndexSnapshot();
    const ingested = await documents.ingestMarkdown(snapshotDocumentPath, SNAPSHOT_DOCUMENT);
    const after = await documents.getIndexSnapshot();
    const indexedDocument = after.documents.find((document) => document.path === snapshotDocumentPath);
    const ok =
      before.schemaVersion === "opspilot.document_index_snapshot.v1" &&
      before.snapshotHash === repeat.snapshotHash &&
      before.integrity.hash === before.snapshotHash &&
      /^[a-f0-9]{64}$/.test(before.snapshotHash) &&
      /^[a-f0-9]{64}$/.test(after.snapshotHash) &&
      before.snapshotHash !== after.snapshotHash &&
      after.status === "ready" &&
      after.summary.totalDocuments >= before.summary.totalDocuments &&
      after.summary.totalChunks >= before.summary.totalChunks + ingested.chunks &&
      after.summary.embeddingCoverageRatio === 1 &&
      after.summary.versionedDocuments >= before.summary.versionedDocuments + 1 &&
      indexedDocument?.chunkCount === ingested.chunks &&
      indexedDocument.latestVersion > 0 &&
      indexedDocument.contentHash.length === 64 &&
      indexedDocument.chunkSetHash.length === 64 &&
      after.recommendations.length > 0;

    console.log(
      JSON.stringify(
        {
          ok,
          before: {
            status: before.status,
            snapshotHash: before.snapshotHash,
            summary: before.summary
          },
          after: {
            status: after.status,
            snapshotHash: after.snapshotHash,
            summary: after.summary,
            indexedDocument
          }
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Index snapshot smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
