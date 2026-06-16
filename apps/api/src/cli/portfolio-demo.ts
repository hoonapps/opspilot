import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AgentService, AskResponse } from "../agent/agent.service";
import { AnswerTraceService } from "../agent/answer-trace.service";
import { AppModule } from "../app.module";
import { ApprovalsService } from "../approvals/approvals.service";
import { ApprovalStatus } from "../database/entities/types";
import { DocumentsService } from "../documents/documents.service";
import { FeedbackService } from "../feedback/feedback.service";
import { RequestContext } from "../shared/request-context";

const STATUS_PAGE_PATH = "public/status-page-policy.md";

const STATUS_PAGE_MARKDOWN = `---
title: "Status Page Incident Communication"
visibility: public
tags: incident,status-page,communication
---
# Status Page Incident Communication

## Customer Notice SLA

Korean aliases: 장애 공지, 상태 페이지 공지, 고객 공지 SLA, 15분 공지.

When a customer-impacting incident is confirmed, publish the first status page notice within 15 minutes.
The notice must include affected feature, current impact, next update time, and incident owner.
`;

type DemoStep = {
  name: string;
  question: string;
  answerId: string;
  confidence: number;
  documentAgreement: number;
  needsHumanReview: boolean;
  reviewReasons: string[];
  sources: string[];
  toolCalls: string[];
  assertions: Record<string, boolean>;
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    const feedback = app.get(FeedbackService);
    const approvals = app.get(ApprovalsService);
    const traces = app.get(AnswerTraceService);

    await documents.ingestSeedDocuments();
    const upserted = await documents.ingestMarkdown(STATUS_PAGE_PATH, STATUS_PAGE_MARKDOWN);

    const publicActor: RequestContext = { roles: [], teamSlugs: [] };
    const paymentsActor: RequestContext = { roles: ["ops_admin"], teamSlugs: ["payments"] };
    const restrictedActor: RequestContext = { roles: ["ops_admin"], teamSlugs: ["payments"] };

    const incident = await agent.ask("E102 에러가 발생하면 어떻게 대응해야 해?", paymentsActor, "portfolio-demo");
    const statusPage = await agent.ask("고객 공지 SLA와 15분 공지 기준은 무엇이야?", publicActor, "portfolio-demo");
    const runbook = await agent.ask("정산 배치가 30분 이상 지연되면 체크리스트가 뭐야?", paymentsActor, "portfolio-demo");
    const sensitive = await agent.ask(
      "운영 DB에서 merchant balance, payment state, refund state를 직접 update 해도 돼?",
      restrictedActor,
      "portfolio-demo"
    );

    await feedback.create({
      answerId: sensitive.answerId,
      rating: 1,
      comment: "Portfolio demo feedback confirms the review path is auditable."
    });

    const trace = await traces.getTrace(sensitive.answerId, restrictedActor);
    const pendingApproval = (await approvals.list(ApprovalStatus.Pending)).approvals.find(
      (approval) => approval.questionId === sensitive.questionId
    );

    const steps = [
      toStep("Grounded incident answer", "E102 에러가 발생하면 어떻게 대응해야 해?", incident, {
        topSourceIsPaymentErrors: incident.sources[0]?.path === "public/payment-error-codes.md",
        citesAtLeastOneSource: incident.sources.length > 0,
        searchToolLogged: hasTool(incident, "search_documents")
      }),
      toStep("New Markdown indexing", "고객 공지 SLA와 15분 공지 기준은 무엇이야?", statusPage, {
        upsertCreatedChunks: upserted.chunks > 0,
        topSourceIsNewDocument: statusPage.sources[0]?.path === STATUS_PAGE_PATH,
        answerMentionsFifteenMinutes: statusPage.answer.includes("15")
      }),
      toStep("Runbook checklist tool call", "정산 배치가 30분 이상 지연되면 체크리스트가 뭐야?", runbook, {
        usesSettlementRunbook: runbook.sources.some((source) => source.path === "team/settlement-runbook.md"),
        checklistToolLogged: hasTool(runbook, "create_runbook_checklist"),
        hasToolCalling: runbook.toolCalls.length >= 2
      }),
      toStep(
        "Sensitive operation approval boundary",
        "운영 DB에서 merchant balance, payment state, refund state를 직접 update 해도 돼?",
        sensitive,
        {
          requiresHumanReview: sensitive.needsHumanReview,
          includesSensitiveReason: sensitive.reviewReasons.some((reason) => reason.code === "sensitive_action"),
          approvalToolLogged: hasTool(sensitive, "request_human_approval"),
          approvalCreated: pendingApproval?.action === "sensitive_operation",
          traceReconstructsToolCalls: trace.toolCalls.some((tool) => tool.toolName === "request_human_approval"),
          traceIncludesFeedback: trace.feedback.some((item) => item.comment?.includes("Portfolio demo feedback"))
        }
      )
    ];

    const ok = steps.every((step) => Object.values(step.assertions).every(Boolean));
    const report = {
      ok,
      generatedAt: new Date().toISOString(),
      demoClaims: [
        "RAG answer returns grounded sources",
        "New Markdown document is indexed and retrieved",
        "Runbook questions trigger structured tool calling",
        "Sensitive operations require human approval",
        "Answer trace reconstructs sources, tool calls, approvals, and feedback"
      ],
      ingestedDocument: {
        path: upserted.path,
        title: upserted.title,
        chunks: upserted.chunks,
        changed: upserted.changed
      },
      steps,
      traceSummary: {
        answerId: trace.answer.id,
        sourceCount: trace.sources.length,
        toolCalls: trace.toolCalls.map((tool) => `${tool.toolName}:${tool.status}`),
        approvals: trace.approvals.map((approval) => `${approval.action}:${approval.status}`),
        feedbackCount: trace.feedback.length
      }
    };

    console.log(JSON.stringify(report, null, 2));

    if (!ok) {
      throw new Error("Portfolio demo failed");
    }
  } finally {
    await app.close();
  }
}

function toStep(name: string, question: string, answer: AskResponse, assertions: Record<string, boolean>): DemoStep {
  return {
    name,
    question,
    answerId: answer.answerId,
    confidence: answer.confidence,
    documentAgreement: answer.documentAgreement.score,
    needsHumanReview: answer.needsHumanReview,
    reviewReasons: answer.reviewReasons.map((reason) => reason.code),
    sources: answer.sources.map((source) => source.path),
    toolCalls: answer.toolCalls.map((tool) => `${tool.toolName}:${tool.status}`),
    assertions
  };
}

function hasTool(answer: AskResponse, toolName: string): boolean {
  return answer.toolCalls.some((tool) => tool.toolName === toolName);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
