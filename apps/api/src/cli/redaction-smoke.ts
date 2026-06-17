import "reflect-metadata";
import { MikroORM } from "@mikro-orm/core";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AnswerTraceService } from "../agent/answer-trace.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const REDACTION_DOCUMENT_PATH = "public/secret-rotation-bridge.md";
const RAW_AWS_KEY = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
const RAW_GITHUB_TOKEN = ["ghp_", "1234567890abcdefghijklmnopQRSTUV"].join("");
const RAW_API_KEY = "fixture-api-key-value-1234567890";
const RAW_BEARER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.payload";
const REDACTED = "[REDACTED_SECRET]";

const REDACTION_DOCUMENT = `---
title: "시크릿 교체 브리지 절차"
visibility: public
tags: security,redaction,secrets
---
# 시크릿 교체 브리지 절차

한국어 별칭: 시크릿 교체, secret rotation bridge, 보안 토큰 교체.

시크릿 교체 브리지 알림이 발생하면 보안 온콜을 호출하고 커넥터 인증 정보를 교체합니다.
시크릿 교체 브리지 예시는 마스킹 이후에만 색인되어야 합니다: aws=${RAW_AWS_KEY}, github=${RAW_GITHUB_TOKEN}, api_key=${RAW_API_KEY}.
Authorization 예시도 검색 전에 정리되어야 합니다: Bearer ${RAW_BEARER_TOKEN}.
`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    const traces = app.get(AnswerTraceService);
    const orm = app.get(MikroORM);

    await documents.ingestSeedDocuments();
    const ingested = await documents.ingestMarkdown(REDACTION_DOCUMENT_PATH, REDACTION_DOCUMENT);

    const actor = { roles: [], teamSlugs: [] };
    const answer = await agent.ask("secret rotation bridge alert가 발생하면 어떤 절차야?", actor, "redaction-smoke");
    const trace = await traces.getTrace(answer.answerId, actor);

    const connection = orm.em.fork().getConnection();
    const chunks = (await connection.execute(
      `
        select c.content
        from document_chunks c
        join documents d on d.id = c.document_id
        where d.path = ?;
      `,
      [REDACTION_DOCUMENT_PATH]
    )) as Array<{ content: string }>;
    const versions = (await connection.execute(
      `
        select v.content
        from document_versions v
        join documents d on d.id = v.document_id
        where d.path = ?;
      `,
      [REDACTION_DOCUMENT_PATH]
    )) as Array<{ content: string }>;
    const [document] = (await connection.execute(
      "select metadata from documents where path = ?;",
      [REDACTION_DOCUMENT_PATH]
    )) as Array<{ metadata: { security?: { redactionCount?: number; redactionPatterns?: string[] } } }>;

    const rawSecrets = [RAW_AWS_KEY, RAW_GITHUB_TOKEN, RAW_API_KEY, RAW_BEARER_TOKEN];
    const persistedText = [...chunks.map((chunk) => chunk.content), ...versions.map((version) => version.content)].join("\n");
    const exposedText = [
      answer.answer,
      ...trace.sources.map((source) => source.contentPreview),
      ...answer.sources.map((source) => `${source.title} ${source.path}`)
    ].join("\n");

    const ok =
      ingested.chunks > 0 &&
      answer.sources[0]?.path === REDACTION_DOCUMENT_PATH &&
      rawSecrets.every((secret) => !persistedText.includes(secret)) &&
      rawSecrets.every((secret) => !exposedText.includes(secret)) &&
      persistedText.includes(REDACTED) &&
      exposedText.includes(REDACTED) &&
      (document?.metadata.security?.redactionCount ?? 0) >= 4 &&
      document?.metadata.security?.redactionPatterns?.includes("aws_access_key") === true &&
      document?.metadata.security?.redactionPatterns?.includes("github_token") === true &&
      document?.metadata.security?.redactionPatterns?.includes("key_value_secret") === true &&
      document?.metadata.security?.redactionPatterns?.includes("bearer_token") === true;

    const report = {
      ok,
      ingested,
      topSource: answer.sources[0]?.path ?? null,
      redactionMetadata: document?.metadata.security ?? null,
      persistedRawSecretHits: rawSecrets.filter((secret) => persistedText.includes(secret)),
      exposedRawSecretHits: rawSecrets.filter((secret) => exposedText.includes(secret)),
      answerPreview: answer.answer.slice(0, 320),
      tracePreview: trace.sources.find((source) => source.path === REDACTION_DOCUMENT_PATH)?.contentPreview.slice(0, 320) ?? null
    };

    console.log(JSON.stringify(report, null, 2));

    if (!ok) {
      throw new Error("Redaction smoke failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
