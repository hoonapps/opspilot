import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { AppModule } from "../app.module";
import { AgentService } from "../agent/agent.service";
import { DocumentsService } from "../documents/documents.service";

const ACTOR = { roles: ["support_agent"], teamSlugs: ["payments"] };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const server = createFixtureServer();

  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    await listen(server);
    const address = server.address() as AddressInfo;
    const fixtureUrl = `http://127.0.0.1:${address.port}/ops-url-fixture`;

    await documents.resetDocuments(false);
    const text = await documents.ingestSource({
      sourceType: "text",
      path: "public/uploads/source-text-smoke.md",
      title: "텍스트 수집 Smoke 문서",
      content:
        "OPSTXT-77 텍스트 문서는 사용자가 txt 내용을 붙여넣으면 OpsPilot이 저장, 청킹, 임베딩, 검색 답변까지 연결해야 함을 증명합니다."
    });
    const url = await documents.ingestSource({
      sourceType: "url",
      path: "public/uploads/source-url-smoke.md",
      url: fixtureUrl,
      title: "URL 수집 Smoke 문서"
    });
    const textAnswer = await agent.ask("OPSTXT-77 텍스트 문서는 무엇을 증명해?", ACTOR, "source-ingestion-smoke");
    const urlAnswer = await agent.ask("OPSURL-88 URL 문서의 검증 기준은 뭐야?", ACTOR, "source-ingestion-smoke");
    const unsupportedAnswer = await agent.ask("화성 토양 배터리 교체 절차는 뭐야?", ACTOR, "source-ingestion-smoke");
    const reset = await documents.resetDocuments(true);
    const inventory = await documents.listInventory();

    const ok =
      text.parser === "plain_text_v1" &&
      text.chunks > 0 &&
      url.parser === "html_text_v1" &&
      url.chunks > 0 &&
      textAnswer.sources[0]?.path === "public/uploads/source-text-smoke.md" &&
      urlAnswer.sources[0]?.path === "public/uploads/source-url-smoke.md" &&
      unsupportedAnswer.answer.includes("문서에서 확인할 수 없습니다") &&
      unsupportedAnswer.needsHumanReview &&
      reset.deleted.documents >= 2 &&
      reset.reloadedSeed &&
      inventory.documents.some((document) => document.path === "public/payment-error-codes.md");

    console.log(
      JSON.stringify(
        {
          ok,
          ingested: { text, url },
          answers: {
            textTopSource: textAnswer.sources[0]?.path,
            urlTopSource: urlAnswer.sources[0]?.path,
            unsupported: unsupportedAnswer.answer,
            unsupportedReview: unsupportedAnswer.needsHumanReview
          },
          reset: {
            deleted: reset.deleted,
            reloadedSeed: reset.reloadedSeed,
            restoredDocuments: inventory.documents.length
          }
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Source ingestion smoke test failed");
    }
  } finally {
    server.close();
    await app.close();
  }
}

function createFixtureServer() {
  return createServer((request, response) => {
    if (request.url !== "/ops-url-fixture") {
      response.writeHead(404);
      response.end("not found");
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html>
        <head><title>URL 수집 Smoke 문서</title></head>
        <body>
          <h1>URL 수집 Smoke 문서</h1>
          <p>OPSURL-88 URL 문서는 사용자가 URL을 입력했을 때 HTML 본문을 텍스트로 추출하고 기존 RAG 색인에 연결해야 함을 증명합니다.</p>
          <p>검증 기준은 URL 문서가 1순위 출처로 검색되고 답변 근거에 포함되는 것입니다.</p>
        </body>
      </html>`);
  });
}

function listen(server: ReturnType<typeof createFixtureServer>): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
