import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const SMOKE_DOCUMENT_PATH = "public/index-explain-runbook.md";

const SMOKE_DOCUMENT = `---
title: "색인 설명 런북"
visibility: public
tags: rag,indexing,explainability
---
# 색인 설명 런북

## RAG 색인 검증

INDEX-EXPLAIN-42 문서는 색인 설명 리포트가 청킹, 임베딩, 버전 추적, 보안 메타데이터를 한 번에 보여주는지 검증합니다.
새로운 Markdown 문서를 넣으면 heading_paragraph_window_v1 청킹 전략으로 문단이 나뉘고 64차원 임베딩이 저장되어야 합니다.

## 검색 준비도

검색 준비 상태는 청크가 존재하고 모든 청크에 임베딩이 저장됐을 때 통과합니다.
운영자는 리포트의 검색 힌트와 헤딩 아웃라인을 보고 어떤 질문이 이 문서를 찾을 수 있는지 판단합니다.
`;

const UPDATED_SMOKE_DOCUMENT = `${SMOKE_DOCUMENT}

## 변경 추적

문서가 바뀌면 최신 버전 변경 차이에 추가 라인이 표시되어야 합니다.
`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const documents = app.get(DocumentsService);
    await documents.ingestSeedDocuments();
    await documents.ingestMarkdown(SMOKE_DOCUMENT_PATH, SMOKE_DOCUMENT);
    await documents.ingestMarkdown(SMOKE_DOCUMENT_PATH, UPDATED_SMOKE_DOCUMENT);

    const inventory = await documents.listInventory();
    const indexedDocument = inventory.documents.find((document) => document.path === SMOKE_DOCUMENT_PATH);
    const report = indexedDocument ? await documents.getIndexExplainReport(indexedDocument.id) : null;
    const checks = Object.fromEntries(report?.checks.map((check) => [check.id, check.status]) ?? []);
    const retrievalHints = report?.chunks.flatMap((chunk) => chunk.retrievalHints) ?? [];
    const ok =
      report !== null &&
      report.schemaVersion === "opspilot.document_index_explain.v1" &&
      report.document.path === SMOKE_DOCUMENT_PATH &&
      report.pipeline.chunking === "heading_paragraph_window_v1" &&
      report.summary.chunkCount >= 2 &&
      report.summary.embeddingCoverageRatio === 1 &&
      report.summary.searchReady &&
      report.summary.headingCoverageRatio > 0 &&
      report.headingOutline.some((heading) => heading.heading.includes("RAG 색인 검증")) &&
      report.latestDiff !== null &&
      report.latestDiff.toVersion === report.document.latestVersion &&
      checks.chunks_present === "pass" &&
      checks.embedding_coverage === "pass" &&
      retrievalHints.some((hint) => hint.includes("INDEX-EXPLAIN-42") || hint.includes("색인"));

    const smokeReport = {
      ok,
      document: report
        ? {
            path: report.document.path,
            latestVersion: report.document.latestVersion,
            contentHash: report.document.contentHash.slice(0, 12)
          }
        : null,
      pipeline: report?.pipeline ?? null,
      summary: report?.summary ?? null,
      checks,
      headingOutline: report?.headingOutline ?? [],
      firstChunk: report?.chunks[0] ?? null,
      recommendations: report?.recommendations ?? []
    };

    console.log(JSON.stringify(smokeReport, null, 2));

    if (!ok) {
      throw new Error("Document index explain smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
