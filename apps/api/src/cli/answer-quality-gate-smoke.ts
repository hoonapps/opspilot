import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AnswerTraceService } from "../agent/answer-trace.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { FeedbackService } from "../feedback/feedback.service";

const ACTOR = { roles: ["ops_admin"], teamSlugs: ["payments"] };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    const feedback = app.get(FeedbackService);
    const answers = app.get(AnswerTraceService);

    await documents.ingestSeedDocuments();

    const answer = await agent.ask("정산 배치가 30분 이상 지연되면 체크리스트가 뭐야?", ACTOR, "quality-gate-smoke");
    const reviewGate = await answers.getQualityGate(answer.answerId, ACTOR);

    await feedback.create({
      answerId: answer.answerId,
      rating: 1,
      comment: "Quality gate smoke reviewer approved this answer."
    });
    const passGate = await answers.getQualityGate(answer.answerId, ACTOR);

    const sensitiveAnswer = await agent.ask("운영 DB에서 고객 정보를 바로 수정해도 돼?", ACTOR, "quality-gate-smoke");
    const sensitiveGate = await answers.getQualityGate(sensitiveAnswer.answerId, ACTOR);

    const checks = {
      reviewGateWaitsForFeedback:
        reviewGate.status === "review" &&
        reviewGate.checks.some((check) => check.id === "feedback_signal" && check.status === "warn"),
      passGateAllowsReviewedAnswer:
        passGate.status === "pass" &&
        passGate.decision.recommendedAction === "share" &&
        passGate.summary.positiveFeedbackCount >= 1,
      sensitiveGateWaitsForApproval:
        sensitiveGate.status === "review" &&
        sensitiveGate.summary.needsHumanReview === true &&
        sensitiveGate.summary.approvalStatus === "pending" &&
        sensitiveGate.checks.some((check) => check.id === "approval_resolved" && check.status === "warn"),
      permissionBoundaryIncluded:
        passGate.summary.sourceAccessRechecked === true &&
        passGate.checks.some((check) => check.id === "permission_boundary" && check.status === "pass")
    };
    const ok = Object.values(checks).every(Boolean);

    console.log(
      JSON.stringify(
        {
          ok,
          checks,
          reviewGate: {
            status: reviewGate.status,
            score: reviewGate.score,
            reasons: reviewGate.decision.reasons
          },
          passGate: {
            status: passGate.status,
            score: passGate.score,
            action: passGate.decision.recommendedAction
          },
          sensitiveGate: {
            status: sensitiveGate.status,
            approvalStatus: sensitiveGate.summary.approvalStatus,
            action: sensitiveGate.decision.recommendedAction
          }
        },
        null,
        2
      )
    );

    if (!ok) {
      throw new Error("Answer quality gate smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
