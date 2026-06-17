import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService } from "../agent/agent.service";
import { AnswerTraceService } from "../agent/answer-trace.service";
import { AppModule } from "../app.module";
import { DocumentsService } from "../documents/documents.service";
import { FeedbackService } from "../feedback/feedback.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(DocumentsService).ingestSeedDocuments();

    const question = "운영 DB에서 merchant balance, payment state, refund state를 직접 update 해도 돼?";
    const answer = await app
      .get(AgentService)
      .ask(question, { roles: ["ops_admin"], teamSlugs: ["payments"] }, "trace-smoke");
    await app.get(FeedbackService).create({
      answerId: answer.answerId,
      rating: -1,
      comment: "Trace smoke feedback"
    });

    const traceService = app.get(AnswerTraceService);
    const trace = await traceService.getTrace(answer.answerId, { roles: ["ops_admin"], teamSlugs: ["payments"] });
    const unauthorizedDenied = await rejectsTrace(traceService, answer.answerId);
    const sourcePaths = trace.sources.map((source) => source.path);
    const toolNames = trace.toolCalls.map((toolCall) => toolCall.toolName);
    const timelineTitles = trace.timeline.map((event) => event.title);
    const reviewReasons = trace.answer.metadata.reviewReasons as Array<{ code?: string }> | undefined;
    const ok =
      trace.answer.id === answer.answerId &&
      trace.answer.questionId === answer.questionId &&
      trace.summary.sourceCount === trace.sources.length &&
      trace.summary.toolCallCount === trace.toolCalls.length &&
      trace.summary.approvalCount === trace.approvals.length &&
      trace.summary.feedbackCount === trace.feedback.length &&
      trace.summary.needsHumanReview === true &&
      trace.summary.documentAgreementScore >= 0 &&
      trace.timeline.length >= 5 &&
      timelineTitles.includes("Question persisted") &&
      timelineTitles.includes("Sources attached") &&
      timelineTitles.includes("Answer generated") &&
      timelineTitles.includes("request_human_approval") &&
      timelineTitles.includes("Feedback saved") &&
      sourcePaths.some((path) => path.startsWith("restricted/")) &&
      sourcePaths.length > 0 &&
      toolNames.includes("search_documents") &&
      toolNames.includes("request_human_approval") &&
      trace.approvals.some((approval) => approval.action === "sensitive_operation") &&
      trace.feedback.some((item) => item.comment === "Trace smoke feedback") &&
      unauthorizedDenied &&
      Array.isArray(reviewReasons) &&
      reviewReasons.some((reason) => reason.code === "sensitive_action");

    const report = {
      ok,
      answerId: answer.answerId,
      questionId: answer.questionId,
      trace: {
        sources: sourcePaths,
        toolCalls: toolNames,
        approvals: trace.approvals.map((approval) => approval.action),
        feedbackCount: trace.feedback.length,
        summary: trace.summary,
        timeline: timelineTitles,
        unauthorizedDenied,
        reviewReasons
      }
    };

    console.log(JSON.stringify(report, null, 2));

    if (!ok) {
      throw new Error("Answer trace smoke test failed");
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function rejectsTrace(traceService: AnswerTraceService, answerId: string): Promise<boolean> {
  try {
    await traceService.getTrace(answerId, { roles: [], teamSlugs: [] });
    return false;
  } catch (error) {
    return error instanceof Error && error.message.includes("not accessible");
  }
}
