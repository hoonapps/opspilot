import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Server } from "node:http";
import { AppModule } from "../app.module";

type ReadinessResponse = {
  ok: boolean;
  service: string;
  dependencies: {
    postgres: { ok: boolean; status: string };
    redis: { ok: boolean; status: string };
    elasticsearch: { ok: boolean; status: string };
  };
};

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
  try {
    await app.listen(0);
    const baseUrl = localBaseUrl(app.getHttpServer() as Server);
    const liveness = await fetch(`${baseUrl}/health`);
    const readiness = await fetch(`${baseUrl}/health/ready`);
    const body = (await readiness.json()) as ReadinessResponse;

    const ok =
      liveness.status === 200 &&
      readiness.status === 200 &&
      body.ok === true &&
      body.service === "opspilot-api" &&
      body.dependencies.postgres.status === "ok" &&
      body.dependencies.redis.status === "ok" &&
      body.dependencies.elasticsearch.status === "skipped";

    console.log(
      JSON.stringify(
        {
          ok,
          liveness: liveness.status,
          readiness: readiness.status,
          dependencies: body.dependencies
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Readiness smoke test failed");
    }
  } finally {
    await app.close();
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
