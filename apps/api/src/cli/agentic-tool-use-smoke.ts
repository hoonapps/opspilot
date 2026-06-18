import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AnswerTraceService } from "../agent/answer-trace.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const AGENTIC_RUNBOOK_PATH = "public/agentic-payment-runbook.md";

const AGENTIC_RUNBOOK = `---
title: "PAY-99 결제 장애 런북"
visibility: public
tags: payment,incident,runbook
---
# PAY-99 결제 장애 런북

PAY-99 결제 승인 지연이 발생하면 상태 페이지 공지를 15분 안에 게시합니다.

## Checklist

1. 결제 승인 오류율과 승인 큐 적체량을 확인합니다.
2. 고객 영향 범위와 다음 업데이트 예정 시각을 상태 페이지에 게시합니다.
3. 운영 DB 수정이나 강제 환불은 사람 승인 후 진행합니다.
`;

async function main() {
  const previousEnv = {
    AGENT_ORCHESTRATION: process.env.AGENT_ORCHESTRATION,
    AI_PROVIDER: process.env.AI_PROVIDER,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_CHAT_MODEL: process.env.ANTHROPIC_CHAT_MODEL,
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER,
    EMBEDDING_DIMENSIONS: process.env.EMBEDDING_DIMENSIONS
  };
  const previousFetch = globalThis.fetch;
  const requests: unknown[] = [];

  process.env.AGENT_ORCHESTRATION = "tool_use";
  process.env.AI_PROVIDER = "anthropic";
  process.env.ANTHROPIC_API_KEY = "mock-anthropic-key";
  process.env.ANTHROPIC_CHAT_MODEL = "claude-agentic-smoke";
  process.env.EMBEDDING_PROVIDER = "local";
  process.env.EMBEDDING_DIMENSIONS = "64";

  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    if (requests.length === 1) {
      return jsonResponse({
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "먼저 호출자 권한 안에서 관련 문서를 검색합니다." },
          { type: "tool_use", id: "toolu_search", name: "search_documents", input: { query: "PAY-99 결제 장애 런북", limit: 5 } }
        ]
      });
    }

    if (requests.length === 2) {
      return jsonResponse({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "toolu_checklist", name: "create_runbook_checklist", input: { question: "PAY-99 결제 장애 대응 체크리스트" } },
          {
            type: "tool_use",
            id: "toolu_approval",
            name: "request_human_approval",
            input: { action: "sensitive_operation", reason: "운영 DB 수정은 사람 승인이 필요합니다." }
          }
        ]
      });
    }

    return jsonResponse({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: "PAY-99 결제 장애는 상태 페이지 공지를 15분 안에 게시하고, 결제 승인 오류율과 승인 큐 적체량을 확인합니다. 운영 DB 수정은 사람 승인 후 진행해야 합니다.\n\n근거: PAY-99 결제 장애 런북"
        }
      ]
    });
  };

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    const traces = app.get(AnswerTraceService);

    await documents.ingestMarkdown(AGENTIC_RUNBOOK_PATH, AGENTIC_RUNBOOK);

    const answer = await agent.ask("PAY-99 결제 장애 대응 체크리스트 만들고 운영 DB 수정은 진행해도 돼?", { roles: [], teamSlugs: [] }, "agentic-tool-use-smoke");
    const trace = await traces.getTrace(answer.answerId, { roles: [], teamSlugs: [] });
    const orchestration = trace.answer.metadata.orchestration as
      | {
          mode?: string;
          turns?: number;
          modelToolCalls?: Array<{ name?: string; output?: Record<string, unknown>; isError?: boolean }>;
        }
      | undefined;
    const toolNames = answer.toolCalls.map((tool) => tool.toolName);
    const traceToolNames = trace.toolCalls.map((tool) => tool.toolName);
    const requestBodies = requests as Array<{ tools?: Array<{ name: string }>; messages?: unknown[] }>;
    const ok =
      answer.answer.includes("15분") &&
      answer.needsHumanReview === true &&
      toolNames.includes("search_documents") &&
      toolNames.includes("create_runbook_checklist") &&
      toolNames.includes("request_human_approval") &&
      traceToolNames.includes("search_documents") &&
      traceToolNames.includes("create_runbook_checklist") &&
      traceToolNames.includes("request_human_approval") &&
      trace.approvals.some((approval) => approval.action === "sensitive_operation") &&
      orchestration?.mode === "anthropic_tool_use" &&
      (orchestration.turns ?? 0) >= 3 &&
      (orchestration.modelToolCalls ?? []).length >= 3 &&
      (orchestration.modelToolCalls ?? []).some((tool) => tool.name === "create_runbook_checklist" && (tool.output as { itemCount?: number }).itemCount === 3) &&
      requestBodies[0]?.tools?.some((tool) => tool.name === "search_documents") === true &&
      JSON.stringify(requestBodies[1]?.messages ?? []).includes("tool_result");

    console.log(
      JSON.stringify(
        {
          ok,
          answerId: answer.answerId,
          toolNames,
          traceToolNames,
          approvalCount: trace.approvals.length,
          orchestration,
          anthropicRequestCount: requests.length
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Agentic tool-use smoke test failed");
    }
  } finally {
    await app.close();
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
