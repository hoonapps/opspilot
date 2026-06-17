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
title: "Replay Drift Proof"
visibility: restricted
teamSlug: payments
tags: replay,drift,quality
---
# Replay Drift Proof

${REPLAY_TOKEN} ${REPLAY_TOKEN} ${REPLAY_TOKEN} ${REPLAY_TOKEN}

The ${REPLAY_TOKEN} runbook states that replay drift checks must compare the original answer against the current indexed document set.
When the evidence changes, OpsPilot should mark the persisted answer for review before an operator trusts it again.
`
    );

    const answer = await agent.ask(`${REPLAY_TOKEN} runbook은 무엇을 검증해야 해?`, ACTOR, "answer-replay-smoke");
    const stableReplay = await traces.replay(answer.answerId, ACTOR);

    await documents.ingestMarkdown(
      REPLAY_DOCUMENT_PATH,
      `---
title: "Replay Drift Proof"
visibility: restricted
teamSlug: payments
tags: replay,drift,quality
---
# Replay Drift Proof

이 문서는 의도적으로 교체되었습니다. 기존 replay drift 답변의 근거 문장은 더 이상 현재 지식 베이스에 남아 있지 않습니다.
운영자는 replay 결과를 보고 기존 답변을 재검토해야 합니다.
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
