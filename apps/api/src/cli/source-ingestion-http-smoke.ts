import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Server } from "node:http";
import { AppModule } from "../app.module";
import { configureRequestBody, requestBodyLimit } from "../config/request-body";
import { DocumentsService } from "../documents/documents.service";

const SMOKE_PATH = "public/uploads/http-body-limit-smoke.md";

async function main() {
  const previousSecret = process.env.OPSPILOT_ACTOR_TOKEN_SECRET;
  delete process.env.OPSPILOT_ACTOR_TOKEN_SECRET;

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false, rawBody: true, bodyParser: false });
  configureRequestBody(app);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  try {
    await app.listen(0);
    const baseUrl = localBaseUrl(app.getHttpServer() as Server);
    const content = [
      "HTTPBODY-413 업로드 제한 회귀 테스트 문서입니다.",
      "이 문서는 API 기본 body limit보다 큰 요청도 /documents/source에서 정상 수집되어야 함을 검증합니다.",
      "PDF와 Word는 base64 JSON으로 전송되므로 실제 파일보다 HTTP 본문이 더 커집니다.",
      "정상 기준은 413 없이 저장, 청킹, 색인 결과가 반환되는 것입니다."
    ].join(" ").repeat(1024);

    const response = await fetch(`${baseUrl}/documents/source`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceType: "text",
        path: SMOKE_PATH,
        title: "HTTP body limit smoke 문서",
        content
      })
    });
    const body = (await response.json().catch(() => ({}))) as { path?: string; chunks?: number; extractedCharacters?: number };

    const ok =
      response.status === 201 &&
      body.path === SMOKE_PATH &&
      typeof body.chunks === "number" &&
      body.chunks > 0 &&
      typeof body.extractedCharacters === "number" &&
      body.extractedCharacters > 100_000;

    console.log(
      JSON.stringify(
        {
          ok,
          requestBodyLimit: requestBodyLimit(),
          requestBytes: Buffer.byteLength(content, "utf8"),
          status: response.status,
          path: body.path,
          chunks: body.chunks,
          extractedCharacters: body.extractedCharacters
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Source ingestion HTTP body smoke test failed");
    }
  } finally {
    await deleteSmokeDocument(app);
    await app.close();
    if (previousSecret === undefined) {
      delete process.env.OPSPILOT_ACTOR_TOKEN_SECRET;
    } else {
      process.env.OPSPILOT_ACTOR_TOKEN_SECRET = previousSecret;
    }
  }
}

async function deleteSmokeDocument(app: NestExpressApplication): Promise<void> {
  const documents = app.get(DocumentsService);
  const inventory = await documents.listInventory();
  const smokeDocument = inventory.documents.find((document) => document.path === SMOKE_PATH);
  if (smokeDocument) {
    await documents.deleteDocument(smokeDocument.id);
  }
}

function localBaseUrl(server: Server): string {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve smoke server address");
  }
  return `http://127.0.0.1:${address.port}`;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
