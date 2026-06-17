import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Server } from "node:http";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

async function main() {
  const previousMax = process.env.ASK_RATE_LIMIT_MAX;
  const previousWindow = process.env.ASK_RATE_LIMIT_WINDOW_SECONDS;
  process.env.ASK_RATE_LIMIT_MAX = "2";
  process.env.ASK_RATE_LIMIT_WINDOW_SECONDS = "60";

  const app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  try {
    await app.get(DocumentsService).ingestSeedDocuments();
    await app.listen(0);

    const baseUrl = localBaseUrl(app.getHttpServer() as Server);
    const actorId = `rate-limit-smoke-${Date.now()}`;
    const first = await ask(baseUrl, actorId);
    const second = await ask(baseUrl, actorId);
    const third = await ask(baseUrl, actorId);
    const firstBody = await first.json();
    const secondBody = await second.json();
    const thirdBody = await third.json();
    const rateLimit = thirdBody.rateLimit as { limit?: number; remaining?: number; retryAfterSeconds?: number; resetAt?: string } | undefined;
    const ok =
      first.status === 201 &&
      second.status === 201 &&
      third.status === 429 &&
      Array.isArray(firstBody.sources) &&
      Array.isArray(secondBody.sources) &&
      rateLimit?.limit === 2 &&
      rateLimit.remaining === 0 &&
      typeof rateLimit.retryAfterSeconds === "number" &&
      typeof rateLimit.resetAt === "string";

    console.log(
      JSON.stringify(
        {
          ok,
          statuses: {
            first: first.status,
            second: second.status,
            third: third.status
          },
          blockedBody: thirdBody
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Rate limit smoke test failed");
    }
  } finally {
    await app.close();
    restoreEnv("ASK_RATE_LIMIT_MAX", previousMax);
    restoreEnv("ASK_RATE_LIMIT_WINDOW_SECONDS", previousWindow);
  }
}

async function ask(baseUrl: string, actorId: string): Promise<Response> {
  return fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": actorId,
      "x-user-roles": "ops_admin",
      "x-team-slugs": "payments"
    },
    body: JSON.stringify({ question: "E102 에러가 발생하면 어떻게 대응해야 해?", channel: "rate-limit-smoke" })
  });
}

function localBaseUrl(server: Server): string {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve smoke server address");
  }
  return `http://127.0.0.1:${address.port}`;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
