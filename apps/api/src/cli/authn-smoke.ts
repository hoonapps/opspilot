import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Server } from "node:http";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { signActorToken } from "../authn/actor-token";

const SECRET = "opspilot-authn-smoke-secret";

async function main() {
  const previousSecret = process.env.OPSPILOT_ACTOR_TOKEN_SECRET;
  process.env.OPSPILOT_ACTOR_TOKEN_SECRET = SECRET;

  const app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  try {
    await app.get(DocumentsService).ingestSeedDocuments();
    await app.listen(0);

    const baseUrl = localBaseUrl(app.getHttpServer() as Server);
    const goodToken = signActorToken(
      {
        sub: "authn-smoke-operator",
        email: "operator@example.com",
        roles: ["ops_admin"],
        teamSlugs: ["payments"],
        exp: Math.floor(Date.now() / 1000) + 300
      },
      SECRET
    );
    const expiredToken = signActorToken(
      {
        sub: "expired-operator",
        roles: ["ops_admin"],
        teamSlugs: ["payments"],
        exp: Math.floor(Date.now() / 1000) - 1
      },
      SECRET
    );

    const health = await fetch(`${baseUrl}/health`);
    const missingToken = await ask(baseUrl);
    const tamperedToken = await ask(baseUrl, `${goodToken.slice(0, -2)}xx`);
    const expired = await ask(baseUrl, expiredToken);
    const allowed = await ask(baseUrl, goodToken);
    const answerBody = (await allowed.json()) as { sources?: Array<{ path: string }>; answer?: string };

    const ok =
      health.status === 200 &&
      missingToken.status === 401 &&
      tamperedToken.status === 401 &&
      expired.status === 401 &&
      allowed.status === 201 &&
      answerBody.sources?.some((source) => source.path === "restricted/production-db-policy.md") === true &&
      answerBody.answer?.includes("approval") === true;

    console.log(
      JSON.stringify(
        {
          ok,
          checks: {
            publicHealth: health.status,
            missingToken: missingToken.status,
            tamperedToken: tamperedToken.status,
            expiredToken: expired.status,
            signedAsk: allowed.status,
            signedAskSources: answerBody.sources?.map((source) => source.path) ?? []
          }
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Authentication smoke test failed");
    }
  } finally {
    await app.close();
    if (previousSecret === undefined) {
      delete process.env.OPSPILOT_ACTOR_TOKEN_SECRET;
    } else {
      process.env.OPSPILOT_ACTOR_TOKEN_SECRET = previousSecret;
    }
  }
}

async function ask(baseUrl: string, token?: string): Promise<Response> {
  return fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-opspilot-actor-token": token } : {})
    },
    body: JSON.stringify({ question: "운영 DB에서 고객 정보를 바로 수정해도 돼?" })
  });
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
