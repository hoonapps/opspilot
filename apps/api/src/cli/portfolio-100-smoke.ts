import "reflect-metadata";
import { MikroORM } from "@mikro-orm/core";
import { NestFactory } from "@nestjs/core";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AgentService } from "../agent/agent.service";
import { AnswerTraceService } from "../agent/answer-trace.service";
import { AppModule } from "../app.module";
import { ApprovalsService } from "../approvals/approvals.service";
import { ApprovalStatus } from "../database/entities/types";
import { DocumentsService } from "../documents/documents.service";
import { EvalQuestion, EvaluationService } from "../evaluation/evaluation.service";
import { FeedbackService } from "../feedback/feedback.service";
import { ObservabilityService } from "../observability/observability.service";

const REPORT_PATH = "../../docs/portfolio-100.md";
const ACTOR = { roles: ["ops_admin"], teamSlugs: ["payments"] };
const PROOF_DOC_PATH = "public/uploads/portfolio-100-local-proof.md";
const PROOF_DOC_TITLE = "포트폴리오 100점 로컬 증명 문서";
const PROOF_TOKEN = "PORT100-LOCAL";

type Portfolio100Check = {
  id: string;
  label: string;
  passed: boolean;
  evidence: string;
  verification: string;
};

type Portfolio100Report = {
  schemaVersion: "opspilot.portfolio_100.v1";
  generatedAt: string;
  score: number;
  status: "pass" | "fail";
  publicDeploymentUrlRequired: false;
  summary: {
    passed: number;
    total: number;
    cleanedPendingApprovals: number;
    readinessScore: number;
    releaseGateStatus: string;
    pendingApprovals: number;
    ciWorkflowIncludesGate: boolean;
    screenshotCount: number;
  };
  checks: Portfolio100Check[];
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const orm = app.get(MikroORM);
    const documents = app.get(DocumentsService);
    const agent = app.get(AgentService);
    const approvals = app.get(ApprovalsService);
    const evaluations = app.get(EvaluationService);
    const feedback = app.get(FeedbackService);
    const observability = app.get(ObservabilityService);
    const traces = app.get(AnswerTraceService);

    const cleanupBefore = await cleanupLocalProofApprovalBacklog(orm);
    await documents.ingestSeedDocuments();

    const proofDocument = await documents.ingestSource({
      sourceType: "text",
      path: PROOF_DOC_PATH,
      title: PROOF_DOC_TITLE,
      content: [
        `${PROOF_TOKEN} 문서는 공개 배포 URL 없이도 OpsPilot 포트폴리오를 검증할 수 있음을 증명합니다.`,
        "검증 기준은 로컬 문서 수집, 청킹, 임베딩, RAG 답변, 출처 일치율, 권한 경계, 도구 호출, 감사 추적, CI 재현성입니다.",
        "평가자는 pnpm product:proof 또는 pnpm portfolio:100 명령으로 같은 결과를 재현할 수 있습니다."
      ].join("\n\n")
    });

    const proofAnswer = await agent.ask(`${PROOF_TOKEN} 문서는 무엇을 증명해?`, ACTOR, "portfolio-100");
    const incidentAnswer = await agent.ask("E102 에러가 발생하면 어떻게 대응해야 해?", ACTOR, "portfolio-100");
    const runbookAnswer = await agent.ask("정산 배치가 30분 이상 지연되면 체크리스트가 뭐야?", ACTOR, "portfolio-100");
    const sensitiveAnswer = await agent.ask(
      "운영 DB에서 merchant balance, payment state, refund state를 직접 update 해도 돼?",
      ACTOR,
      "portfolio-100"
    );

    await feedback.create({
      answerId: incidentAnswer.answerId,
      rating: 1,
      comment: "Portfolio 100 gate confirms grounded incident answer."
    });
    await feedback.create({
      answerId: sensitiveAnswer.answerId,
      rating: 1,
      comment: "Portfolio 100 gate confirms the human-review boundary is auditable."
    });

    const pendingApproval = (await approvals.list(ApprovalStatus.Pending)).approvals.find(
      (approval) => approval.questionId === sensitiveAnswer.questionId
    );
    if (pendingApproval) {
      await approvals.update(pendingApproval.id, {
        status: ApprovalStatus.Rejected,
        reviewerNote: "Portfolio 100 local proof resolves its own sensitive-action request."
      });
    }

    const sensitiveTrace = await traces.getTrace(sensitiveAnswer.answerId, ACTOR);
    const evalSetPath = resolve(process.cwd(), process.env.EVAL_SET_PATH ?? "../../seed/eval/questions.json");
    const evalQuestions = JSON.parse(await readFile(evalSetPath, "utf8")) as EvalQuestion[];
    const evalReport = await evaluations.run("seed-ops-wiki", evalQuestions);
    const cleanupAfter = await cleanupLocalProofApprovalBacklog(orm);

    const [readiness, releaseGate, slo, errorBudget, auditLedger, indexQuality, indexSnapshot, repoEvidence] =
      await Promise.all([
        observability.portfolioReadiness(),
        observability.releaseGate(),
        observability.slo(),
        observability.errorBudget(),
        observability.auditLedger(100),
        documents.getIndexQualityReport(),
        documents.getIndexSnapshot(),
        inspectRepoEvidence()
      ]);

    const pendingApprovals = releaseGate.summary.pendingApprovals;
    const checks: Portfolio100Check[] = [
      {
        id: "local_reproducibility",
        label: "배포 URL 없는 로컬 재현성",
        passed: repoEvidence.packageJson.includes("\"product:proof\"") && repoEvidence.localProofMentionsNoPublicUrl,
        evidence: "README와 docs/local-proof.md가 공개 URL 없이 product:proof로 재현하는 경로를 설명합니다.",
        verification: "pnpm product:proof"
      },
      {
        id: "ci_gate",
        label: "CI에서 같은 증명 경로 검증",
        passed: repoEvidence.ciIncludesPortfolio100 && repoEvidence.ciIncludesWebSmoke,
        evidence: "GitHub Actions가 portfolio:100과 Web smoke를 실행하도록 구성돼 있습니다.",
        verification: ".github/workflows/ci.yml"
      },
      {
        id: "source_ingestion",
        label: "새 문서 수집, 청킹, 검색 연결",
        passed:
          proofDocument.quality.status === "ready" &&
          proofDocument.chunks > 0 &&
          proofAnswer.sources[0]?.path === PROOF_DOC_PATH,
        evidence: `${PROOF_DOC_PATH}를 등록했고 청크 ${proofDocument.chunks}개가 생성됐으며 질문의 1순위 출처로 반환됐습니다.`,
        verification: "pnpm source-ingestion:smoke"
      },
      {
        id: "rag_grounding",
        label: "RAG 답변 근거성과 문서 일치율",
        passed:
          incidentAnswer.sources.some((source) => source.path === "public/payment-error-codes.md") &&
          incidentAnswer.documentAgreement.score >= 0.8,
        evidence: `E102 답변 문서 일치율 ${formatPercent(incidentAnswer.documentAgreement.score)}, 출처 ${incidentAnswer.sources
          .map((source) => source.path)
          .join(", ")}.`,
        verification: "pnpm agreement:smoke"
      },
      {
        id: "agentic_tool_use",
        label: "에이전트 도구 선택",
        passed:
          runbookAnswer.toolCalls.some((tool) => tool.toolName === "search_documents") &&
          runbookAnswer.toolCalls.some((tool) => tool.toolName === "create_runbook_checklist"),
        evidence: `런북 질문 도구 호출: ${runbookAnswer.toolCalls.map((tool) => `${tool.toolName}:${tool.status}`).join(", ")}.`,
        verification: "pnpm agentic-tool-use:smoke"
      },
      {
        id: "permission_boundary",
        label: "민감 작업 사람 승인 경계",
        passed:
          sensitiveAnswer.needsHumanReview &&
          sensitiveAnswer.toolCalls.some((tool) => tool.toolName === "request_human_approval") &&
          sensitiveTrace.approvals.some((approval) => approval.action === "sensitive_operation" && approval.status === "rejected"),
        evidence: `민감 작업은 ${sensitiveAnswer.reviewReasons.map((reason) => reason.code).join(", ")} 사유로 검토 처리됐고 승인 요청은 검증 후 반려됐습니다.`,
        verification: "pnpm permission:smoke && pnpm review:smoke"
      },
      {
        id: "trace_audit",
        label: "답변 trace와 감사 원장",
        passed:
          sensitiveTrace.sources.length > 0 &&
          sensitiveTrace.toolCalls.length >= 2 &&
          sensitiveTrace.feedback.length >= 1 &&
          auditLedger.verified &&
          auditLedger.summary.tamperEvident,
        evidence: `trace 출처 ${sensitiveTrace.sources.length}개, 도구 ${sensitiveTrace.toolCalls.length}개, 감사 루트 ${auditLedger.rootHash.slice(0, 12)}...`,
        verification: "pnpm trace:smoke && pnpm audit-ledger:smoke"
      },
      {
        id: "evaluation_gate",
        label: "평가 게이트와 문서 커버리지",
        passed: evalReport.passed && evalReport.sourceHitRate === 1 && evalReport.topSourceAccuracy === 1 && evalReport.citationAccuracy === 1,
        evidence: `sourceHitRate ${formatPercent(evalReport.sourceHitRate)}, topSourceAccuracy ${formatPercent(
          evalReport.topSourceAccuracy
        )}, citationAccuracy ${formatPercent(evalReport.citationAccuracy)}.`,
        verification: "pnpm eval"
      },
      {
        id: "operational_readiness",
        label: "운영성, SLO, 릴리즈 게이트",
        passed:
          readiness.status === "pass" &&
          readiness.score === 1 &&
          releaseGate.status === "pass" &&
          slo.status === "ok" &&
          errorBudget.status === "healthy" &&
          releaseGate.checks.some((check) => check.id === "approval_backlog" && check.status === "pass"),
        evidence: `readiness ${readiness.score}, release ${releaseGate.status}, SLO ${slo.status}, pending approvals ${pendingApprovals}.`,
        verification: "pnpm product-readiness:smoke && pnpm release-gate:smoke"
      },
      {
        id: "demo_artifacts",
        label: "포트폴리오 산출물",
        passed:
          repoEvidence.screenshotCount >= 8 &&
          repoEvidence.demoReportExists &&
          indexQuality.score > 0 &&
          indexSnapshot.snapshotHash.length === 64,
        evidence: `스크린샷 ${repoEvidence.screenshotCount}개, 색인 품질 점수 ${formatPercent(indexQuality.score)}, 색인 스냅샷 ${indexSnapshot.snapshotHash.slice(0, 12)}...`,
        verification: "pnpm product:report && pnpm web:smoke"
      }
    ];

    const passed = checks.filter((check) => check.passed).length;
    const score = Math.round((passed / checks.length) * 100);
    const report: Portfolio100Report = {
      schemaVersion: "opspilot.portfolio_100.v1",
      generatedAt: new Date().toISOString(),
      score,
      status: score === 100 ? "pass" : "fail",
      publicDeploymentUrlRequired: false,
      summary: {
        passed,
        total: checks.length,
        cleanedPendingApprovals: cleanupBefore + cleanupAfter,
        readinessScore: readiness.score,
        releaseGateStatus: releaseGate.status,
        pendingApprovals,
        ciWorkflowIncludesGate: repoEvidence.ciIncludesPortfolio100,
        screenshotCount: repoEvidence.screenshotCount
      },
      checks
    };

    const reportPath = resolve(process.cwd(), REPORT_PATH);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, renderMarkdownReport(report), "utf8");

    console.log(JSON.stringify({ ok: report.status === "pass", reportPath, report }, null, 2));

    if (report.status !== "pass") {
      throw new Error("Portfolio 100 gate failed");
    }
  } finally {
    await app.close();
  }
}

async function cleanupLocalProofApprovalBacklog(orm: MikroORM): Promise<number> {
  const rows = await orm.em.fork().getConnection().execute<Array<{ id: string }>>(
    `
      update approval_requests ar
      set
        status = 'rejected',
        reason = ar.reason || ?::jsonb
      from questions q
      where q.id = ar.question_id
        and ar.status = 'pending'
        and (
          q.channel like '%smoke%'
          or q.channel like '%demo%'
          or q.channel like '%portfolio%'
          or q.channel = 'eval'
        )
      returning ar.id::text as id;
    `,
    [JSON.stringify({ reviewerNote: "Local portfolio proof cleanup rejected stale smoke approval." })]
  );
  return rows.length;
}

async function inspectRepoEvidence() {
  const [packageJson, readme, localProof, ci] = await Promise.all([
    readFile(resolve(process.cwd(), "../../package.json"), "utf8"),
    readFile(resolve(process.cwd(), "../../README.md"), "utf8"),
    readFile(resolve(process.cwd(), "../../docs/local-proof.md"), "utf8"),
    readFile(resolve(process.cwd(), "../../.github/workflows/ci.yml"), "utf8")
  ]);
  const assetNames = await readdir(resolve(process.cwd(), "../../docs/assets"));
  const screenshotCount = assetNames.filter((name) => name.startsWith("opspilot-") && name.endsWith(".png")).length;
  const demoReportExists = await fileExists(resolve(process.cwd(), "../../docs/demo-report.md"));

  return {
    packageJson,
    readme,
    localProof,
    ci,
    screenshotCount,
    demoReportExists,
    localProofMentionsNoPublicUrl: readme.includes("공개 배포 URL 없이") && localProof.includes("공개 배포 URL 없이"),
    ciIncludesPortfolio100: ci.includes("pnpm portfolio:100"),
    ciIncludesWebSmoke: ci.includes("pnpm web:smoke")
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function renderMarkdownReport(report: Portfolio100Report): string {
  const lines = [
    "# OpsPilot 포트폴리오 100점 로컬 증명",
    "",
    `생성 시각: ${report.generatedAt}`,
    "",
    `점수: ${report.score}/100`,
    `상태: ${report.status === "pass" ? "통과" : "실패"}`,
    "공개 배포 URL 필요 여부: 아니오",
    "",
    "## 요약",
    "",
    `- 통과 항목: ${report.summary.passed}/${report.summary.total}`,
    `- 정리한 스모크 승인 요청: ${report.summary.cleanedPendingApprovals}`,
    `- 제품 검증 점수: ${formatPercent(report.summary.readinessScore)}`,
    `- 릴리즈 게이트: ${report.summary.releaseGateStatus}`,
    `- 대기 승인: ${report.summary.pendingApprovals}`,
    `- CI 100점 게이트 포함: ${report.summary.ciWorkflowIncludesGate ? "예" : "아니오"}`,
    `- README 스크린샷: ${report.summary.screenshotCount}개`,
    "",
    "## 채점표",
    "",
    "| 항목 | 결과 | 증거 | 검증 명령 |",
    "| --- | --- | --- | --- |",
    ...report.checks.map((check) =>
      `| ${escapeTable(check.label)} | ${check.passed ? "통과" : "실패"} | ${escapeTable(check.evidence)} | \`${escapeTable(check.verification)}\` |`
    ),
    "",
    "## 실행",
    "",
    "```bash",
    "pnpm install",
    "cp .env.example apps/api/.env",
    "pnpm portfolio:100",
    "```",
    "",
    "`pnpm product:proof`는 이 100점 게이트를 포함한 로컬 전체 증명 경로입니다.",
    ""
  ];
  return lines.join("\n");
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
