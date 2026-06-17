import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const IMPACT_DOCUMENT_PATH = "public/document-impact-proof.md";
const IMPACT_TOKEN = "문서영향분석키";
const ACTOR = { roles: ["ops_admin"], teamSlugs: ["payments"] };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);

    const firstIngest = await documents.ingestMarkdown(
      IMPACT_DOCUMENT_PATH,
      `---
title: "Document Impact Proof"
visibility: public
tags: impact,rag,quality
---
# Document Impact Proof

## Impact Marker

${IMPACT_TOKEN} ${IMPACT_TOKEN} ${IMPACT_TOKEN}

OpsPilot must show which stored answers used this document as source evidence before operators trust changed RAG knowledge.
`
    );
    const answer = await agent.ask(`${IMPACT_TOKEN} 문서는 무엇을 증명해야 해?`, ACTOR, "document-impact-smoke");
    const documentId = await findDocumentId(documents, IMPACT_DOCUMENT_PATH);
    const stableImpact = await documents.getImpactReport(documentId);

    await sleep(15);
    await documents.ingestMarkdown(
      IMPACT_DOCUMENT_PATH,
      `---
title: "Document Impact Proof"
visibility: public
tags: impact,rag,quality
---
# Document Impact Proof

이 문서는 변경 영향 분석 스모크를 위해 교체되었습니다.
운영자는 이 문서를 근거로 삼은 과거 답변을 stale 상태로 보고 재검증해야 합니다.
`
    );
    const staleImpact = await documents.getImpactReport(documentId);

    const staleAnswer = staleImpact?.affectedAnswers.find((item) => item.answerId === answer.answerId);
    const ok =
      firstIngest.chunks > 0 &&
      stableImpact !== null &&
      stableImpact.summary.affectedAnswerCount >= 1 &&
      stableImpact.affectedAnswers.some((item) => item.answerId === answer.answerId) &&
      staleImpact !== null &&
      staleImpact.summary.staleAnswerCount >= 1 &&
      staleAnswer?.staleAfterDocumentUpdate === true &&
      staleImpact.recommendations.some((item) => item.includes("replay"));

    console.log(
      JSON.stringify(
        {
          ok,
          answerId: answer.answerId,
          stable: stableImpact
            ? {
                document: stableImpact.document.path,
                summary: stableImpact.summary
              }
            : null,
          stale: staleImpact
            ? {
                document: staleImpact.document.path,
                summary: staleImpact.summary,
                recommendations: staleImpact.recommendations,
                affectedAnswers: staleImpact.affectedAnswers.map((item) => ({
                  answerId: item.answerId,
                  staleAfterDocumentUpdate: item.staleAfterDocumentUpdate,
                  sourceRank: item.sourceRank
                }))
              }
            : null
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Document impact smoke test failed");
    }
  } finally {
    await app.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findDocumentId(documents: DocumentsService, path: string): Promise<string> {
  const inventory = await documents.listInventory(100);
  const document = inventory.documents.find((item) => item.path === path);
  if (!document) {
    throw new Error(`Document not found in inventory: ${path}`);
  }
  return document.id;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
