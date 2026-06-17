import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AnswerTraceService } from "../agent/answer-trace.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";

const REPLAY_DOCUMENT_PATH = "public/replay-drift-proof.md";
const REPLAY_TOKEN = "한글리플레이검증키";
const ACTOR = { roles: ["ops_admin"], teamSlugs: ["payments"] };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    const traces = app.get(AnswerTraceService);

    await documents.ingestMarkdown(
      REPLAY_DOCUMENT_PATH,
      `---
title: "답변 변경 감지 증명"
visibility: restricted
teamSlug: payments
tags: replay,drift,quality
---
# 답변 변경 감지 증명

${REPLAY_TOKEN} ${REPLAY_TOKEN} ${REPLAY_TOKEN} ${REPLAY_TOKEN}

${REPLAY_TOKEN} 런북은 재실행 변경 감지가 원래 답변과 현재 색인 문서 집합을 비교해야 한다고 설명합니다.
근거가 바뀌면 OpsPilot은 운영자가 다시 신뢰하기 전에 저장된 답변을 검토 대상으로 표시해야 합니다.
`
    );

    const answer = await agent.ask(`${REPLAY_TOKEN} runbook은 무엇을 검증해야 해?`, ACTOR, "answer-replay-smoke");
    const stableReplay = await traces.replay(answer.answerId, ACTOR);

    await documents.ingestMarkdown(
      REPLAY_DOCUMENT_PATH,
      `---
title: "답변 변경 감지 증명"
visibility: restricted
teamSlug: payments
tags: replay,drift,quality
---
# 답변 변경 감지 증명

이 문서는 의도적으로 교체되었습니다. 기존 재실행 변경 감지 답변의 근거 문장은 더 이상 현재 지식 베이스에 남아 있지 않습니다.
운영자는 재실행 결과를 보고 기존 답변을 재검토해야 합니다.
`
    );

    const driftReplay = await traces.replay(answer.answerId, ACTOR);
    const unauthorizedDenied = await rejectsReplay(traces, answer.answerId);
    const driftChecks = Object.fromEntries(driftReplay.checks.map((check) => [check.id, check]));
    const ok =
      stableReplay.status === "stable" &&
      stableReplay.summary.currentDocumentAgreement >= 0.8 &&
      driftReplay.status === "drifted" &&
      driftChecks.top_source_stable?.status === "fail" &&
      driftReplay.summary.topSourceChanged &&
      unauthorizedDenied;

    console.log(
      JSON.stringify(
        {
          ok,
          answerId: answer.answerId,
          stable: {
            status: stableReplay.status,
            summary: stableReplay.summary
          },
          drift: {
            status: driftReplay.status,
            summary: driftReplay.summary,
            checks: driftReplay.checks
          },
          unauthorizedDenied
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Answer replay smoke test failed");
    }
  } finally {
    await app.close();
  }
}

async function rejectsReplay(traceService: AnswerTraceService, answerId: string): Promise<boolean> {
  try {
    await traceService.replay(answerId, { roles: [], teamSlugs: [] });
    return false;
  } catch {
    return true;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
