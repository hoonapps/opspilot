import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const QUALITY_DOCUMENT_PATH = "public/index-quality-proof.md";

const QUALITY_DOCUMENT = `---
title: "Index Quality Proof"
visibility: public
tags: quality,indexing,rag
---
# Index Quality Proof

## Retrieval Quality Marker

Korean aliases: 색인 품질, 청크 품질, IQP-91, RAG 검증.

IQP-91 proves that OpsPilot can report document count, chunk coverage, version coverage, heading coverage, and security isolation for indexed Markdown documents.
`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const documents = app.get(DocumentsService);

    await documents.ingestSeedDocuments();
    const ingested = await documents.ingestMarkdown(QUALITY_DOCUMENT_PATH, QUALITY_DOCUMENT);
    const report = await documents.getIndexQualityReport();
    const qualityDocument = report.documents.find((document) => document.path === QUALITY_DOCUMENT_PATH);
    const gateIds = new Set(report.gates.map((gate) => gate.id));
    const ok =
      ingested.chunks > 0 &&
      qualityDocument !== undefined &&
      qualityDocument.chunkCount === ingested.chunks &&
      qualityDocument.latestVersion > 0 &&
      qualityDocument.headingCoverageRatio > 0 &&
      qualityDocument.checks.some((check) => check.id === "chunks_present" && check.status === "pass") &&
      qualityDocument.checks.some((check) => check.id === "versioned" && check.status === "pass") &&
      report.summary.totalDocuments >= 1 &&
      report.summary.totalChunks >= ingested.chunks &&
      gateIds.has("documents_present") &&
      gateIds.has("chunk_coverage") &&
      gateIds.has("version_coverage") &&
      report.score > 0;

    console.log(
      JSON.stringify(
        {
          ok,
          status: report.status,
          score: report.score,
          summary: report.summary,
          gates: report.gates,
          document: qualityDocument
            ? {
                path: qualityDocument.path,
                chunkCount: qualityDocument.chunkCount,
                latestVersion: qualityDocument.latestVersion,
                headingCoverageRatio: qualityDocument.headingCoverageRatio,
                checks: qualityDocument.checks
              }
            : null
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Index quality smoke test failed: report did not prove indexed document quality");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
