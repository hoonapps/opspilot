import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Server } from "node:http";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

type AskBody = {
  questionId?: string;
  answerId?: string;
  idempotency?: {
    key: string;
    replayed: boolean;
    requestHash: string;
    expiresAt: string;
  };
  rateLimit?: {
    limit?: number;
    remaining?: number;
  };
};

async function main() {
  const previousMax = process.env.ASK_RATE_LIMIT_MAX;
  const previousWindow = process.env.ASK_RATE_LIMIT_WINDOW_SECONDS;
  process.env.ASK_RATE_LIMIT_MAX = "1";
  process.env.ASK_RATE_LIMIT_WINDOW_SECONDS = "60";

  const app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  try {
    await app.get(DocumentsService).ingestSeedDocuments();
    await app.listen(0);

    const baseUrl = localBaseUrl(app.getHttpServer() as Server);
    const actorId = `idempotency-smoke-${Date.now()}`;
    const key = `idem-${Date.now()}`;
    const first = await ask(baseUrl, actorId, key, "E102 에러가 발생하면 어떻게 대응해야 해?");
    const replay = await ask(baseUrl, actorId, key, "E102 에러가 발생하면 어떻게 대응해야 해?");
    const conflict = await ask(baseUrl, actorId, key, "정산 배치가 지연되면 어떻게 해?");
    const limited = await ask(baseUrl, actorId, `${key}-new`, "E102 에러가 발생하면 어떻게 대응해야 해?");
    const firstBody = (await first.json()) as AskBody;
    const replayBody = (await replay.json()) as AskBody;
    const conflictBody = (await conflict.json()) as AskBody;
    const limitedBody = (await limited.json()) as AskBody;

    const ok =
      first.status === 201 &&
      replay.status === 201 &&
      conflict.status === 409 &&
      limited.status === 429 &&
      firstBody.answerId === replayBody.answerId &&
      firstBody.questionId === replayBody.questionId &&
      firstBody.idempotency?.key === key &&
      replayBody.idempotency?.key === key &&
      firstBody.idempotency?.replayed === false &&
      replayBody.idempotency?.replayed === true &&
      typeof firstBody.idempotency?.requestHash === "string" &&
      firstBody.idempotency?.requestHash === replayBody.idempotency?.requestHash &&
      limitedBody.rateLimit?.limit === 1;

    console.log(
      JSON.stringify(
        {
          ok,
          statuses: {
            first: first.status,
            replay: replay.status,
            conflict: conflict.status,
            limited: limited.status
          },
          ids: {
            firstAnswerId: firstBody.answerId,
            replayAnswerId: replayBody.answerId,
            firstQuestionId: firstBody.questionId,
            replayQuestionId: replayBody.questionId
          },
          idempotency: {
            first: firstBody.idempotency,
            replay: replayBody.idempotency,
            conflict: conflictBody.idempotency,
            limitedRateLimit: limitedBody.rateLimit
          }
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Ask idempotency smoke test failed");
    }
  } finally {
    await app.close();
    restoreEnv("ASK_RATE_LIMIT_MAX", previousMax);
    restoreEnv("ASK_RATE_LIMIT_WINDOW_SECONDS", previousWindow);
  }
}

async function ask(baseUrl: string, actorId: string, idempotencyKey: string, question: string): Promise<Response> {
  return fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": actorId,
      "x-user-roles": "ops_admin",
      "x-team-slugs": "payments",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify({ question, channel: "idempotency-smoke" })
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
