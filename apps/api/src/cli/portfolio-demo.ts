import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
  documentAgreementTokens: {
    matched: number;
    answer: number;
  };
  needsHumanReview: boolean;
  reviewReasons: string[];
  sources: string[];
  toolCalls: string[];
  assertions: Record<string, boolean>;
};

type PortfolioReport = {
  ok: boolean;
  generatedAt: string;
  demoClaims: string[];
  ingestedDocument: {
    path: string;
    title: string;
    chunks: number;
    changed: boolean;
  };
  steps: DemoStep[];
  traceSummary: {
    answerId: string;
    sourceCount: number;
    toolCalls: string[];
    approvals: string[];
    feedbackCount: number;
  };
};

async function main() {
  const markdownReportPath = getMarkdownReportPath(process.argv);
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
      toStep("근거 기반 장애 답변", "E102 에러가 발생하면 어떻게 대응해야 해?", incident, {
        topSourceIsPaymentErrors: incident.sources[0]?.path === "public/payment-error-codes.md",
        citesAtLeastOneSource: incident.sources.length > 0,
        searchToolLogged: hasTool(incident, "search_documents")
      }),
      toStep("새 Markdown 색인", "고객 공지 SLA와 15분 공지 기준은 무엇이야?", statusPage, {
        upsertCreatedChunks: upserted.chunks > 0,
        topSourceIsNewDocument: statusPage.sources[0]?.path === STATUS_PAGE_PATH,
        answerMentionsFifteenMinutes: statusPage.answer.includes("15")
      }),
      toStep("Runbook checklist 도구 호출", "정산 배치가 30분 이상 지연되면 체크리스트가 뭐야?", runbook, {
        usesSettlementRunbook: runbook.sources.some((source) => source.path === "team/settlement-runbook.md"),
        checklistToolLogged: hasTool(runbook, "create_runbook_checklist"),
        hasToolCalling: runbook.toolCalls.length >= 2
      }),
      toStep(
        "민감 작업 승인 경계",
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
    const report: PortfolioReport = {
      ok,
      generatedAt: new Date().toISOString(),
      demoClaims: [
        "RAG 답변이 문서 출처를 포함합니다.",
        "새 Markdown 문서가 색인되고 검색됩니다.",
        "Runbook 질문이 구조화된 도구 호출을 발생시킵니다.",
        "민감 작업은 사람 승인으로 분리됩니다.",
        "Answer trace가 출처, 도구 호출, 승인, 피드백을 복원합니다."
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

    if (markdownReportPath) {
      const absolutePath = resolve(process.cwd(), markdownReportPath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, renderMarkdownReport(report), "utf8");
      console.log(JSON.stringify({ markdownReportPath: absolutePath }, null, 2));
    }

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
    documentAgreementTokens: {
      matched: answer.documentAgreement.matchedTokenCount,
      answer: answer.documentAgreement.answerTokenCount
    },
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

function getMarkdownReportPath(argv: string[]): string | null {
  const reportIndex = argv.indexOf("--report");
  if (reportIndex >= 0) {
    return argv[reportIndex + 1] ?? "docs/demo-report.md";
  }

  return process.env.PORTFOLIO_REPORT_PATH ?? null;
}

function renderMarkdownReport(report: PortfolioReport): string {
  const lines = [
    "# OpsPilot 포트폴리오 데모 리포트",
    "",
    `생성 시각: ${report.generatedAt}`,
    "",
    `전체 결과: ${report.ok ? "PASS" : "FAIL"}`,
    "",
    "## 증명한 항목",
    "",
    ...report.demoClaims.map((claim) => `- ${claim}`),
    "",
    "## 실행 증거",
    "",
    "| 단계 | 출처 | 문서 일치율 | 도구 호출 | 사람 검토 | Assertion |",
    "| --- | --- | ---: | --- | --- | --- |",
    ...report.steps.map((step) =>
      [
        escapeTable(step.name),
        escapeTable(step.sources.join("<br>")),
        `${Math.round(step.documentAgreement * 100)}% (${step.documentAgreement.toFixed(3)}, ${step.documentAgreementTokens.matched}/${step.documentAgreementTokens.answer} 토큰)`,
        escapeTable(step.toolCalls.join("<br>")),
        step.needsHumanReview ? "필요" : "불필요",
        escapeTable(renderAssertions(step.assertions))
      ].join(" | ")
    ).map((row) => `| ${row} |`),
    "",
    "## 새 문서 색인 증거",
    "",
    `- Path: \`${report.ingestedDocument.path}\``,
    `- 제목: ${report.ingestedDocument.title}`,
    `- 색인 chunk: ${report.ingestedDocument.chunks}`,
    `- 이번 실행에서 content hash 변경: ${report.ingestedDocument.changed ? "예" : "아니오"}`,
    "- 검색 검증: 한국어 SLA 질문을 던지고 이 문서가 top source로 반환되지 않으면 실패합니다.",
    "",
    "## 감사 trace 증거",
    "",
    `- Answer ID: \`${report.traceSummary.answerId}\``,
    `- 출처 수: ${report.traceSummary.sourceCount}`,
    `- 도구 호출: ${report.traceSummary.toolCalls.join(", ")}`,
    `- 승인: ${report.traceSummary.approvals.join(", ")}`,
    `- 피드백 수: ${report.traceSummary.feedbackCount}`,
    "",
    "이 파일은 `pnpm portfolio:report`가 `pnpm portfolio:demo`와 같은 assertion을 실행한 뒤 생성합니다.",
    ""
  ];

  return lines.join("\n");
}

function renderAssertions(assertions: Record<string, boolean>): string {
  return Object.entries(assertions)
    .map(([name, passed]) => `${passed ? "PASS" : "FAIL"} ${name}`)
    .join("<br>");
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
