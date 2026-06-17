import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { AgentService } from "../agent/agent.service";
import { AnswerTraceService } from "../agent/answer-trace.service";
import { DocumentsService } from "../documents/documents.service";
import { FeedbackService } from "../feedback/feedback.service";

const ACTOR = { roles: ["ops_admin"], teamSlugs: ["payments"] };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const agent = app.get(AgentService);
    const answer = await agent.ask(
      "운영 DB에서 merchant balance, payment state, refund state를 직접 update 해도 돼?",
      ACTOR,
      "evidence-bundle-smoke"
    );
    await app.get(FeedbackService).create({ answerId: answer.answerId, rating: 1, comment: "증거 번들 smoke 피드백" });

    const bundle = await app.get(AnswerTraceService).getEvidenceBundle(answer.answerId, ACTOR);
    const unauthorizedDenied = await rejectsUnauthorized(app.get(AnswerTraceService), answer.answerId);
    const checks = Object.fromEntries(bundle.artifacts.proof.checks.map((check) => [check.id, check.status]));
    const ok =
      bundle.schemaVersion === "opspilot.answer_evidence_bundle.v1" &&
      bundle.answerId === answer.answerId &&
      bundle.questionId === answer.questionId &&
      bundle.integrity.algorithm === "sha256" &&
      /^[a-f0-9]{64}$/.test(bundle.integrity.hash) &&
      bundle.actorBoundary.sourceAccessRechecked === true &&
      bundle.summary.proofStatus === "verified" &&
      bundle.summary.replayStatus === bundle.artifacts.replay.status &&
      bundle.summary.needsHumanReview === true &&
      bundle.summary.approvalCount >= 1 &&
      bundle.summary.feedbackCount >= 1 &&
      bundle.summary.sourceCount === bundle.artifacts.trace.sources.length &&
      bundle.summary.toolCallCount === bundle.artifacts.trace.toolCalls.length &&
      bundle.artifacts.trace.sources.some((source) => source.path === "restricted/production-db-policy.md") &&
      bundle.artifacts.proof.evidence.toolCalls.some((tool) => tool.toolName === "request_human_approval") &&
      checks.search_tool_audited === "pass" &&
      checks.approval_boundary === "pass" &&
      unauthorizedDenied;

    console.log(
      JSON.stringify(
        {
          ok,
          schemaVersion: bundle.schemaVersion,
          proofStatus: bundle.summary.proofStatus,
          replayStatus: bundle.summary.replayStatus,
          sourceCount: bundle.summary.sourceCount,
          toolCallCount: bundle.summary.toolCallCount,
          approvalCount: bundle.summary.approvalCount,
          feedbackCount: bundle.summary.feedbackCount,
          hash: bundle.integrity.hash,
          unauthorizedDenied
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Evidence bundle smoke test failed");
    }
  } finally {
    await app.close();
  }
}

async function rejectsUnauthorized(traceService: AnswerTraceService, answerId: string): Promise<boolean> {
  try {
    await traceService.getEvidenceBundle(answerId, { roles: [], teamSlugs: [] });
    return false;
  } catch {
    return true;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
