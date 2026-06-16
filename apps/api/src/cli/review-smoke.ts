import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { ApprovalStatus } from "../database/entities/types";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { FeedbackService } from "../feedback/feedback.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const question = "운영 DB에서 고객 정보를 바로 수정해도 돼?";
    const answer = await app.get(AgentService).ask(question, { roles: ["admin"], teamSlugs: ["payments"] }, "review-smoke");

    if (!answer.needsHumanReview) {
      throw new Error("Expected sensitive question to require human review");
    }

    const hasSensitiveReason = answer.reviewReasons.some((reason) => reason.code === "sensitive_action");
    if (!hasSensitiveReason) {
      throw new Error("Expected sensitive question to include a sensitive_action review reason");
    }

    const feedback = await app.get(FeedbackService).create({
      answerId: answer.answerId,
      rating: 1,
      comment: "Smoke test feedback for review workflow."
    });

    const approvalsService = app.get(ApprovalsService);
    const pending = await approvalsService.list(ApprovalStatus.Pending);
    const approval = pending.approvals.find((item) => item.questionId === answer.questionId);

    if (!approval) {
      throw new Error("Expected pending approval request for sensitive question");
    }

    const resolved = await approvalsService.update(approval.id, {
      status: ApprovalStatus.Rejected,
      reviewerNote: "Smoke test rejected sensitive production action."
    });

    const report = {
      ok: true,
      questionId: answer.questionId,
      answerId: answer.answerId,
      needsHumanReview: answer.needsHumanReview,
      reviewReasons: answer.reviewReasons,
      toolCalls: answer.toolCalls,
      feedback: {
        id: feedback.id,
        rating: feedback.rating
      },
      approval: {
        id: resolved.id,
        action: resolved.action,
        status: resolved.status
      }
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
