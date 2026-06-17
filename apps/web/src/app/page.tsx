"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Approval,
  ApiRequestObservabilityReport,
  AnswerEvidenceBundle,
  AnswerProof,
  AnswerReplay,
  AnswerTrace,
  askOpsPilot,
  AskResponse,
  createFeedback,
  DocumentInventoryItem,
  DocumentIndexQualityReport,
  DocumentVersionHistory,
  enqueueMarkdownIndexingJob,
  EvaluationHistory,
  EvaluationReport,
  getApiRequestObservability,
  getAnswerProof,
  getAnswerEvidenceBundle,
  getAnswerReplay,
  getAnswerTrace,
  getDocumentVersionHistory,
  getDocumentIndexQuality,
  getEvaluationHistory,
  getIndexingQueueHealth,
  getLatestEvaluation,
  getObservabilityReleaseGate,
  getObservabilitySlo,
  getObservabilitySummary,
  getPermissionBoundaryMatrix,
  GithubSyncResponse,
  IngestResponse,
  IndexingJobStatus,
  IndexingQueueHealth,
  AgentToolDefinition,
  listDocuments,
  listAgentTools,
  listRecentToolCalls,
  listApprovals,
  ObservabilityReleaseGate,
  ObservabilitySloReport,
  ObservabilitySummary,
  PermissionBoundaryMatrix,
  previewRetrieval,
  RetrievalPreviewResponse,
  simulateSlackMention,
  SlackSimulationTrace,
  syncGithubDocuments,
  ToolCallAuditItem,
  updateApproval,
  upsertMarkdown
} from "../lib/api";
import { UsageGuide } from "./usage-guide";

const sampleMarkdown = `---
title: "상태 페이지 장애 공지 기준"
visibility: public
tags: incident,status-page,communication
---
# 상태 페이지 장애 공지 기준

## 고객 공지 SLA

한국어 별칭: 장애 공지, 상태 페이지 공지, 고객 공지 SLA, 15분 공지.

고객 영향 장애가 확인되면 첫 상태 페이지 공지는 15분 안에 게시해야 합니다.
공지에는 영향받은 기능, 현재 영향도, 다음 업데이트 예정 시각, 장애 담당자를 반드시 포함합니다.
`;

const quickQuestions = [
  "E102 에러가 발생하면 어떻게 대응해야 해?",
  "정산 배치가 30분 이상 지연되면 체크리스트가 뭐야?",
  "장애 공지는 몇 분 안에 올려야 해?",
  "운영 DB에서 고객 정보를 바로 수정해도 돼?"
];

type ConsoleScreen = "ask" | "retrieval" | "documents" | "quality" | "review" | "audit" | "help";

type IndexProof = {
  path: string;
  query: string;
  chunkCount: number;
  topSourcePath: string | null;
  topScore: number | null;
  sourceHit: boolean;
  documentAgreement: number;
  confidence: number;
  answerId: string;
  verifiedAt: string;
};

const screens: Array<{ id: ConsoleScreen; label: string; title: string; description: string }> = [
  {
    id: "ask",
    label: "질문",
    title: "운영 문서에 질문하기",
    description: "근거 기반 답변, 출처, 실행 추적, 검토 사유, 피드백을 한 화면에서 확인합니다."
  },
  {
    id: "retrieval",
    label: "검색",
    title: "RAG 검색 실험실",
    description: "답변 생성 전에 후보 청크, 점수 분해, 권한 필터링 결과를 미리 확인합니다."
  },
  {
    id: "documents",
    label: "문서",
    title: "지식 베이스 관리",
    description: "Markdown 문서 등록, GitHub 문서 동기화, 신규 문서의 RAG 색인 반영을 검증합니다."
  },
  {
    id: "quality",
    label: "품질",
    title: "품질 게이트와 운영 지표",
    description: "평가 게이트, 문서 일치율, 색인 규모, 도구 호출, 승인, 피드백을 점검합니다."
  },
  {
    id: "review",
    label: "승인",
    title: "사람 승인 대기열",
    description: "에이전트가 자동 실행하지 않고 분리한 민감 작업을 승인 또는 반려합니다."
  },
  {
    id: "audit",
    label: "감사",
    title: "도구 호출 감사",
    description: "저장된 에이전트 도구 호출, 권한 감사 요약, 승인 위임 흐름을 확인합니다."
  },
  {
    id: "help",
    label: "사용법",
    title: "OpsPilot 사용법",
    description: "로컬 실행부터 문서 색인, RAG 검색, 답변 검증, 품질 게이트 확인까지 따라 합니다."
  }
];

export default function Home() {
  const [activeScreen, setActiveScreen] = useState<ConsoleScreen>("ask");
  const [question, setQuestion] = useState(quickQuestions[0]);
  const [teamSlugs, setTeamSlugs] = useState("payments");
  const [roles, setRoles] = useState("ops_admin");
  const [path, setPath] = useState("public/status-page-policy.md");
  const [markdown, setMarkdown] = useState(sampleMarkdown);
  const [githubOwner, setGithubOwner] = useState("hoonapps");
  const [githubRepo, setGithubRepo] = useState("opspilot");
  const [githubBranch, setGithubBranch] = useState("main");
  const [githubRootPath, setGithubRootPath] = useState("docs");
  const [githubSourcePrefix, setGithubSourcePrefix] = useState("github/hoonapps/opspilot");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [trace, setTrace] = useState<AnswerTrace | null>(null);
  const [proof, setProof] = useState<AnswerProof | null>(null);
  const [replay, setReplay] = useState<AnswerReplay | null>(null);
  const [evidenceBundle, setEvidenceBundle] = useState<AnswerEvidenceBundle | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationReport | null>(null);
  const [evaluationHistory, setEvaluationHistory] = useState<EvaluationHistory | null>(null);
  const [observability, setObservability] = useState<ObservabilitySummary | null>(null);
  const [apiRequests, setApiRequests] = useState<ApiRequestObservabilityReport | null>(null);
  const [sloReport, setSloReport] = useState<ObservabilitySloReport | null>(null);
  const [releaseGate, setReleaseGate] = useState<ObservabilityReleaseGate | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallAuditItem[]>([]);
  const [agentTools, setAgentTools] = useState<AgentToolDefinition[]>([]);
  const [slackTrace, setSlackTrace] = useState<SlackSimulationTrace | null>(null);
  const [retrievalPreview, setRetrievalPreview] = useState<RetrievalPreviewResponse | null>(null);
  const [retrievalLimit, setRetrievalLimit] = useState(5);
  const [ingest, setIngest] = useState<IngestResponse | null>(null);
  const [githubSync, setGithubSync] = useState<GithubSyncResponse | null>(null);
  const [indexProof, setIndexProof] = useState<IndexProof | null>(null);
  const [indexQuality, setIndexQuality] = useState<DocumentIndexQualityReport | null>(null);
  const [queueHealth, setQueueHealth] = useState<IndexingQueueHealth | null>(null);
  const [queuedIndexingJob, setQueuedIndexingJob] = useState<IndexingJobStatus | null>(null);
  const [documents, setDocuments] = useState<DocumentInventoryItem[]>([]);
  const [documentVersionHistory, setDocumentVersionHistory] = useState<DocumentVersionHistory | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionBoundaryMatrix | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<
    | "ask"
    | "retrieval"
    | "ingest"
    | "verify"
    | "quality-report"
    | "github"
    | "documents"
    | "queue"
    | "versions"
    | "matrix"
    | "approval"
    | "audit"
    | "evaluation"
    | "observability"
    | "feedback"
    | "trace"
    | "tools"
    | "slack"
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const confidencePercent = useMemo(() => Math.round((answer?.confidence ?? 0) * 100), [answer]);
  const documentAgreementPercent = useMemo(() => Math.round((answer?.documentAgreement.score ?? 0) * 100), [answer]);
  const visibleApprovals = useMemo(() => approvals.slice(0, 3), [approvals]);
  const currentScreen = screens.find((screen) => screen.id === activeScreen) ?? screens[0];
  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) ?? documents[0] ?? null,
    [documents, selectedDocumentId]
  );
  const topRetrievalCandidate = retrievalPreview?.candidates[0] ?? null;
  const documentStats = useMemo(
    () => ({
      total: documents.length,
      chunks: documents.reduce((sum, document) => sum + document.chunkCount, 0),
      restricted: documents.filter((document) => document.visibility === "restricted").length,
      redactions: documents.reduce((sum, document) => sum + getRedactionCount(document), 0),
      promptRisks: documents.filter((document) => hasPromptInjectionRisk(document)).length
    }),
    [documents]
  );

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedbackStatus(null);
    setLoading("ask");
    try {
      const nextAnswer = await askOpsPilot({ question, teamSlugs, roles });
      const [nextTrace, nextProof, nextReplay, nextEvidenceBundle] = await fetchAnswerEvidence(nextAnswer.answerId);
      setAnswer(nextAnswer);
      setTrace(nextTrace);
      setProof(nextProof);
      setReplay(nextReplay);
      setEvidenceBundle(nextEvidenceBundle);
      setApprovals(await listApprovals());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "질문 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function submitRetrievalPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading("retrieval");
    try {
      setRetrievalPreview(await previewRetrieval({ question, teamSlugs, roles, limit: retrievalLimit }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "검색 미리보기 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function submitFeedback(rating: number) {
    if (!answer) {
      return;
    }

    setError(null);
    setLoading("feedback");
    try {
      const feedback = await createFeedback({ answerId: answer.answerId, rating, comment: feedbackComment });
      setFeedbackStatus(`피드백 저장됨 (${feedback.rating > 0 ? "도움됨" : "개선 필요"})`);
      setFeedbackComment("");
      const [nextTrace, nextProof, nextReplay, nextEvidenceBundle] = await fetchAnswerEvidence(answer.answerId);
      setTrace(nextTrace);
      setProof(nextProof);
      setReplay(nextReplay);
      setEvidenceBundle(nextEvidenceBundle);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "피드백 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function resolveApproval(id: string, status: "approved" | "rejected") {
    setError(null);
    setLoading("approval");
    try {
      await updateApproval({
        id,
        status,
        reviewerNote: status === "approved" ? "OpsPilot 웹 콘솔에서 승인했습니다." : "OpsPilot 웹 콘솔에서 반려했습니다."
      });
      setApprovals(await listApprovals());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "승인 처리에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function submitMarkdown(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading("ingest");
    try {
      const nextIngest = await upsertMarkdown({ path, markdown });
      setIngest(nextIngest);
      const verificationQuery = "고객 공지 SLA와 15분 공지 기준은 무엇이야?";
      setQuestion(verificationQuery);
      const nextDocuments = await listDocuments();
      setDocuments(nextDocuments);
      setIndexQuality(await getDocumentIndexQuality());
      const indexedDocument = nextDocuments.find((document) => document.path === nextIngest.path) ?? nextDocuments[0] ?? null;
      setSelectedDocumentId(indexedDocument?.id ?? null);
      if (indexedDocument) {
        await loadDocumentVersions(indexedDocument.id);
      }
      await verifyIndexedDocument(nextIngest, verificationQuery);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "색인 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function verifyIndexedDocument(targetIngest = ingest, query = question) {
    if (!targetIngest) {
      return;
    }

    setError(null);
    setLoading((current) => current ?? "verify");
    try {
      const [preview, verificationAnswer] = await Promise.all([
        previewRetrieval({ question: query, teamSlugs, roles, limit: 5 }),
        askOpsPilot({ question: query, teamSlugs, roles })
      ]);
      const topCandidate = preview.candidates[0] ?? null;
      const topSource = verificationAnswer.sources[0] ?? null;
      setRetrievalPreview(preview);
      setIndexProof({
        path: targetIngest.path,
        query,
        chunkCount: targetIngest.chunks,
        topSourcePath: topSource?.path ?? topCandidate?.path ?? null,
        topScore: topSource?.score ?? topCandidate?.score ?? null,
        sourceHit: topSource?.path === targetIngest.path || topCandidate?.path === targetIngest.path,
        documentAgreement: verificationAnswer.documentAgreement.score,
        confidence: verificationAnswer.confidence,
        answerId: verificationAnswer.answerId,
        verifiedAt: new Date().toISOString()
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "색인 검증 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function submitGithubSync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading("github");
    try {
      const result = await syncGithubDocuments({
        owner: githubOwner,
        repo: githubRepo,
        branch: githubBranch || undefined,
        rootPath: githubRootPath || undefined,
        sourcePrefix: githubSourcePrefix || undefined
      });
      setGithubSync(result);
      setQuestion("OpsPilot의 권한 경계는 어디에서 적용돼?");
      const nextDocuments = await listDocuments();
      setDocuments(nextDocuments);
      setIndexQuality(await getDocumentIndexQuality());
      setSelectedDocumentId(
        nextDocuments.find((document) => document.path.startsWith(result.source))?.id ?? nextDocuments[0]?.id ?? null
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "GitHub 동기화 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadIndexingQueueHealth() {
    setError(null);
    setLoading("queue");
    try {
      setQueueHealth(await getIndexingQueueHealth());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "색인 큐 상태 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function enqueueCurrentMarkdownIndexingJob() {
    setError(null);
    setLoading("queue");
    try {
      const job = await enqueueMarkdownIndexingJob({ path, markdown });
      setQueuedIndexingJob(job);
      setQueueHealth(await getIndexingQueueHealth());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "비동기 색인 작업 생성에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadDocuments() {
    setError(null);
    setLoading("documents");
    try {
      const nextDocuments = await listDocuments();
      setDocuments(nextDocuments);
      setIndexQuality(await getDocumentIndexQuality());
      setSelectedDocumentId((currentId) =>
        currentId && nextDocuments.some((document) => document.id === currentId) ? currentId : nextDocuments[0]?.id ?? null
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "문서 목록 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadIndexQuality() {
    setError(null);
    setLoading("quality-report");
    try {
      setIndexQuality(await getDocumentIndexQuality());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "색인 품질 리포트 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadDocumentVersions(documentId = selectedDocument?.id) {
    if (!documentId) {
      return;
    }

    setError(null);
    setLoading((current) => current ?? "versions");
    try {
      setDocumentVersionHistory(await getDocumentVersionHistory(documentId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "문서 버전 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadPermissionMatrix() {
    setError(null);
    setLoading("matrix");
    try {
      setPermissionMatrix(await getPermissionBoundaryMatrix());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "권한 매트릭스 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadEvaluation() {
    setError(null);
    setLoading("evaluation");
    try {
      const [latest, history] = await Promise.all([getLatestEvaluation(), getEvaluationHistory()]);
      setEvaluation(latest);
      setEvaluationHistory(history);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "평가 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadToolCalls() {
    setError(null);
    setLoading("audit");
    try {
      setToolCalls(await listRecentToolCalls());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "도구 호출 감사 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadAgentTools() {
    setError(null);
    setLoading("tools");
    try {
      setAgentTools(await listAgentTools());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "도구 레지스트리 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function runSlackSimulation() {
    setError(null);
    setLoading("slack");
    try {
      setSlackTrace(await simulateSlackMention());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Slack 시뮬레이션 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadObservability() {
    setError(null);
    setLoading("observability");
    try {
      const [summary, apiRequestReport, slo, gate] = await Promise.all([
        getObservabilitySummary(),
        getApiRequestObservability(),
        getObservabilitySlo(),
        getObservabilityReleaseGate()
      ]);
      setObservability(summary);
      setApiRequests(apiRequestReport);
      setSloReport(slo);
      setReleaseGate(gate);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "운영 지표 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadTrace(answerId = answer?.answerId) {
    if (!answerId) {
      return;
    }

    setError(null);
    setLoading("trace");
    try {
      const [nextTrace, nextProof, nextReplay, nextEvidenceBundle] = await fetchAnswerEvidence(answerId);
      setTrace(nextTrace);
      setProof(nextProof);
      setReplay(nextReplay);
      setEvidenceBundle(nextEvidenceBundle);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "답변 추적 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function fetchAnswerEvidence(answerId: string): Promise<[AnswerTrace, AnswerProof, AnswerReplay, AnswerEvidenceBundle]> {
    return Promise.all([
      getAnswerTrace({ answerId, teamSlugs, roles }),
      getAnswerProof({ answerId, teamSlugs, roles }),
      getAnswerReplay({ answerId, teamSlugs, roles }),
      getAnswerEvidenceBundle({ answerId, teamSlugs, roles })
    ]);
  }

  return (
    <main className="appShell">
      <aside className="appRail" aria-label="OpsPilot 작업 영역 내비게이션">
        <div className="railBrand">
          <span className="brandMark">OP</span>
          <div>
	            <strong>OpsPilot</strong>
	            <p>운영 에이전트</p>
          </div>
        </div>
	        <nav className="railNav" aria-label="콘솔 화면">
          {screens.map((screen) => (
            <button
              className={activeScreen === screen.id ? "active" : ""}
              key={screen.id}
              onClick={() => setActiveScreen(screen.id)}
              type="button"
            >
              <span>{screen.label}</span>
              <small>{screen.title}</small>
            </button>
          ))}
        </nav>
	        <div className="railCard">
	          <span>권한 경계</span>
	          <strong>검색 전 필터링</strong>
	          <p>제한 문서 청크는 프롬프트 컨텍스트가 만들어지기 전에 제거됩니다.</p>
	        </div>
      </aside>

      <section className="shell">
      <header className="topbar">
        <div>
	          <p className="eyebrow">OpsPilot 콘솔</p>
          <h1>{currentScreen.title}</h1>
          <p className="headerLead">{currentScreen.description}</p>
        </div>
	        <div className="statusGroup" aria-label="시스템 상태">
	          <span className="statusDot" />
	          <span>API 대상: localhost:3000</span>
	        </div>
	      </header>

	      <section className="metrics" aria-label="검색 핵심 지표">
	        <Metric label="검색" value="pgvector + 하이브리드" />
	        <Metric label="권한" value="문서 접근 필터" />
	        <Metric label="검토" value="사람 승인" />
	        <Metric label="근거" value="출처 인용" />
	      </section>

      {error ? <div className="errorPanel">{error}</div> : null}

	      <div className={`workspace ${activeScreen}`}>
        {activeScreen === "help" ? (
	          <UsageGuide />
	        ) : null}

	        {activeScreen === "ask" ? (
        <section className="queryPanel" id="ask">
          <div className="sectionHeader">
            <div>
	              <p className="eyebrow">질문</p>
	              <h2>근거 기반 운영 답변</h2>
	            </div>
	            {answer ? <span className={answer.needsHumanReview ? "badge review" : "badge"}>{answer.needsHumanReview ? "검토 필요" : "자동 답변"}</span> : null}
          </div>

          <form onSubmit={submitQuestion} className="stack">
            <label>
	              질문
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} />
            </label>

            <div className="quickGrid">
              {quickQuestions.map((item) => (
                <button key={item} type="button" className="chip" onClick={() => setQuestion(item)}>
                  {item}
                </button>
              ))}
            </div>

            <div className="fieldGrid">
              <label>
	                팀
                <input value={teamSlugs} onChange={(event) => setTeamSlugs(event.target.value)} placeholder="payments" />
              </label>
              <label>
	                역할
                <input value={roles} onChange={(event) => setRoles(event.target.value)} placeholder="ops_admin, oncall" />
              </label>
            </div>

            <button className="primaryButton" disabled={loading === "ask"} type="submit">
	              {loading === "ask" ? "질문 중..." : "OpsPilot에 질문"}
            </button>
          </form>

          <div className="answerPanel">
            <div className="answerMeta">
              <span>
	                신뢰도 {confidencePercent}% · 문서 일치율 {documentAgreementPercent}%
	              </span>
	                <span>{answer?.toolCalls.map((tool) => `${tool.toolName}: ${formatRuntimeStatus(tool.status)}`).join(", ") ?? "아직 도구 호출 없음"}</span>
	              <span>
	                {answer?.idempotency
	                  ? `멱등성 ${answer.idempotency.replayed ? "재사용" : "신규"} · ${shortHash(answer.idempotency.requestHash)}`
	                  : "멱등성 키 대기"}
	              </span>
	            </div>
	            <pre>{answer?.answer ?? "질문을 실행하면 근거 기반 답변, 신뢰도, 도구 호출, 출처가 여기에 표시됩니다."}</pre>
            {answer ? (
              <div className="boundaryAudit">
                <span>{formatPermissionEnforcement(answer.permissionAudit.enforcement)}</span>
	                <strong>차단 후보 {answer.permissionAudit.deniedCandidateCount}개</strong>
                <code>{formatDeniedVisibility(answer.permissionAudit.deniedByVisibility)}</code>
              </div>
            ) : null}
            {answer?.reviewReasons.length ? (
              <div className="reviewReasons">
                {answer.reviewReasons.map((reason) => (
                  <div className="reasonItem" key={reason.code}>
                    <span>{formatReviewReasonCode(reason.code)}</span>
                    <p>{reason.message}</p>
                    {"confidence" in reason && typeof reason.confidence === "number" && typeof reason.threshold === "number" ? (
                      <code>
                        {Math.round(reason.confidence * 100)}% / {Math.round(reason.threshold * 100)}%
                      </code>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {trace ? (
              <section className="tracePanel">
                <div className="traceSummary">
                  <div>
	                    <span>추적</span>
	                    <strong>출처 {trace.summary.sourceCount}개</strong>
                  </div>
                  <div>
	                    <span>일치율</span>
                    <strong>{formatPercent(trace.summary.documentAgreementScore)}</strong>
                  </div>
                  <div>
	                    <span>커버리지</span>
                    <strong>{formatPercent(trace.grounding.coverageRatio)}</strong>
                  </div>
                  <div>
	                    <span>컨텍스트</span>
                    <strong>
                      {trace.contextPackage.estimatedTokenCount}/{trace.contextPackage.tokenBudget}
                    </strong>
                  </div>
                  <div>
	                    <span>도구</span>
                    <strong>{trace.summary.toolCallCount}</strong>
                  </div>
                  <div>
	                    <span>승인</span>
                    <strong>{trace.summary.approvalCount}</strong>
                  </div>
                  <div>
	                    <span>시간</span>
                    <strong>{formatDuration(trace.summary.durationMs)}</strong>
                  </div>
                  <button disabled={loading === "trace"} onClick={() => loadTrace()} type="button">
	                    {loading === "trace" ? "새로고침 중..." : "추적 새로고침"}
                  </button>
                </div>
                <div className="groundingPanel" aria-label="근거 커버리지">
                  <div className="groundingHeader">
                    <div>
	                      <span>근거 커버리지</span>
	                      <strong>
	                        답변 토큰 {trace.grounding.coveredAnswerTokenCount}/{trace.grounding.answerTokenCount}
                      </strong>
                    </div>
                    <code>{trace.grounding.method}</code>
                  </div>
                  <div className="groundingList">
                    {trace.grounding.sources.slice(0, 3).map((source) => (
                      <article className="groundingItem" key={`${source.rank}-${source.path}`}>
                        <div>
                          <strong>{source.title}</strong>
                          <p>{source.path}</p>
                        </div>
                        <span>{formatPercent(source.coverageRatio)}</span>
	                        <code>{source.matchedTokens.length > 0 ? source.matchedTokens.join(" ") : "겹치는 토큰 없음"}</code>
                        <div className="evidenceSnippetList">
                          {source.evidenceSnippets.length > 0 ? (
                            source.evidenceSnippets.map((snippet, index) => (
                              <blockquote key={`${source.rank}-snippet-${index}`}>
                                {snippet.text}
                                <small>
                                  매칭 {snippet.matchedTokenCount}개 ·{" "}
                                  {snippet.matchedTokens.length > 0 ? snippet.matchedTokens.join(" ") : "토큰 없음"}
                                </small>
                              </blockquote>
                            ))
                          ) : (
                            <blockquote>
                              근거 문장 추출 없음
                              <small>매칭 토큰 부족</small>
                            </blockquote>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="contextPanel" aria-label="답변 컨텍스트 패키지">
                  <div className="contextHeader">
                    <div>
	                      <span>컨텍스트 예산</span>
	                      <strong>
	                        포함 {trace.contextPackage.includedChunkCount}개 · 제외 {trace.contextPackage.omittedChunkCount}개
                      </strong>
                    </div>
                    <code>{trace.contextPackage.method}</code>
                  </div>
                  <div className="contextMeter">
                    <i style={{ width: `${Math.min(100, (trace.contextPackage.estimatedTokenCount / trace.contextPackage.tokenBudget) * 100)}%` }} />
                  </div>
                  <div className="contextChunkList">
                    {trace.contextPackage.chunks.slice(0, 4).map((chunk) => (
                      <article className="contextChunkItem" key={`${chunk.rank}-${chunk.path}`}>
                        <span>{chunk.rank}</span>
                        <div>
                          <strong>{chunk.title}</strong>
                          <p>{chunk.path}</p>
                        </div>
	                        <code>{chunk.included ? "포함" : formatContextReason(chunk.reason)}</code>
                        <small>{chunk.estimatedTokens} 토큰</small>
                      </article>
                    ))}
                  </div>
                </div>
                {proof ? (
                  <div className="proofPanel" aria-label="답변 증명 패킷">
                    <div className="proofHeader">
                      <div>
	                        <span>증명 패킷</span>
	                        <strong>검사 통과율 {formatPercent(proof.score)}</strong>
                      </div>
	                      <code>{formatProofStatus(proof.status)}</code>
                    </div>
                    <div className="proofChecklist">
	                      {proof.checks.map((check) => (
	                        <article className="proofItem" key={check.id}>
	                          <span className={check.status === "pass" ? "badge" : "badge review"}>{formatGateStatus(check.status)}</span>
	                          <div>
	                            <strong>{formatProofLabel(check.id, check.label)}</strong>
	                            <p>{formatProofEvidence(check.id, check.evidence)}</p>
	                          </div>
	                          <code>{formatProofMetric(check)}</code>
                        </article>
                      ))}
                    </div>
                    <div className="proofEvidence">
	                      <span>출처 {proof.evidence.sourcePaths.length}</span>
	                      <span>도구 {proof.evidence.toolCalls.map((tool) => `${tool.toolName}:${formatRuntimeStatus(tool.status)}`).join(" ")}</span>
	                      <span>검토 {proof.evidence.reviewReasons.join(" ") || "없음"}</span>
                    </div>
                  </div>
                ) : null}
                {replay ? (
                  <div className="replayPanel" aria-label="답변 변경 감지">
                    <div className="proofHeader">
                      <div>
	                        <span>답변 변경 감지</span>
	                        <strong>{formatReplayStatus(replay.status)}</strong>
                      </div>
	                      <code>
	                        현재 일치율 {formatPercent(replay.summary.currentDocumentAgreement)} · 출처 겹침{" "}
	                        {formatPercent(replay.summary.sourceOverlapRatio)}
	                      </code>
                    </div>
                    <div className="replaySummary">
                      <div>
	                        <span>원래 1순위</span>
	                        <code>{replay.summary.originalTopSourcePath ?? "없음"}</code>
                      </div>
                      <div>
	                        <span>현재 1순위</span>
	                        <code>{replay.summary.currentTopSourcePath ?? "없음"}</code>
                      </div>
                      <div>
	                        <span>권한 차단</span>
	                        <strong>{replay.summary.permissionDeniedCandidates}개</strong>
                      </div>
                    </div>
                    <div className="proofChecklist">
	                      {replay.checks.map((check) => (
	                        <article className="proofItem" key={check.id}>
	                          <span className={check.status === "pass" ? "badge" : "badge review"}>{formatGateStatus(check.status)}</span>
	                          <div>
	                            <strong>{formatReplayCheckLabel(check.id, check.label)}</strong>
	                            <p>{formatReplayCheckEvidence(check.id, check.evidence)}</p>
	                          </div>
	                          <code>{formatProofMetric(check)}</code>
	                        </article>
	                      ))}
                    </div>
                  </div>
                ) : null}
                {evidenceBundle ? (
                  <div className="proofPanel" aria-label="답변 증거 번들">
                    <div className="proofHeader">
                      <div>
	                        <span>증거 번들</span>
	                        <strong>{evidenceBundle.schemaVersion}</strong>
                      </div>
	                      <code>{evidenceBundle.integrity.algorithm}:{shortHash(evidenceBundle.integrity.hash)}</code>
                    </div>
                    <div className="replaySummary">
                      <div>
	                        <span>증명</span>
	                        <strong>{formatProofStatus(evidenceBundle.summary.proofStatus)}</strong>
                      </div>
                      <div>
                        <span>재실행</span>
                        <strong>{formatReplayStatus(evidenceBundle.summary.replayStatus)}</strong>
                      </div>
                      <div>
	                        <span>권한 재검사</span>
	                        <strong>{evidenceBundle.actorBoundary.sourceAccessRechecked ? "완료" : "미확인"}</strong>
                      </div>
                    </div>
                    <div className="proofEvidence">
	                      <span>출처 {evidenceBundle.summary.sourceCount}</span>
	                      <span>도구 {evidenceBundle.summary.toolCallCount}</span>
	                      <span>승인 {evidenceBundle.summary.approvalCount}</span>
	                      <span>피드백 {evidenceBundle.summary.feedbackCount}</span>
                    </div>
                  </div>
                ) : null}
                <div className="traceTimeline" aria-label="답변 추적 타임라인">
	                  {trace.timeline.map((event) => (
	                    <article className="timelineItem" key={`${event.order}-${event.kind}-${event.title}-${event.at}`}>
	                      <span>{formatTraceKind(event.kind)}</span>
	                      <div>
	                        <strong>{formatTraceEventTitle(event.title)}</strong>
	                        <p>{summarizeTraceEvent(event)}</p>
	                      </div>
	                      <code>{formatRuntimeStatus(event.status)}</code>
	                    </article>
	                  ))}
                </div>
              </section>
            ) : null}
            <div className="feedbackBar">
              <input
	                aria-label="피드백 의견"
                disabled={!answer || loading === "feedback"}
                onChange={(event) => setFeedbackComment(event.target.value)}
	                placeholder="선택 입력: 답변 피드백"
                value={feedbackComment}
              />
              <button disabled={!answer || loading === "feedback"} onClick={() => submitFeedback(1)} type="button">
	                도움됨
              </button>
              <button disabled={!answer || loading === "feedback"} onClick={() => submitFeedback(-1)} type="button">
	                개선 필요
              </button>
            </div>
            {feedbackStatus ? <p className="inlineStatus">{feedbackStatus}</p> : null}
          </div>
        </section>
        ) : null}

        <aside className="sidePanel">
          {activeScreen === "ask" ? (
          <>
          <div className="sectionHeader compact">
            <div>
	              <p className="eyebrow">출처</p>
	              <h2 id="sources">검색된 근거</h2>
            </div>
          </div>
          <div className="sourceList">
            {(answer?.sources ?? []).length > 0 ? (
              answer?.sources.map((source, index) => (
                <div className="sourceItem" key={`${source.path}-${index}`}>
                  <span className="rank">{index + 1}</span>
                  <div>
                    <strong>{source.title}</strong>
                    <p>{source.path}</p>
                  </div>
                  <span className="score">{source.score.toFixed(3)}</span>
                </div>
              ))
            ) : (
	              <p className="empty">질문을 실행하면 출처가 여기에 표시됩니다.</p>
            )}
          </div>
          </>
          ) : null}

          {activeScreen === "retrieval" ? (
          <>
          <form onSubmit={submitRetrievalPreview} className="retrievalPanel">
            <div className="sectionHeader compact">
              <div>
	                <p className="eyebrow">미리보기</p>
	                <h2>후보 청크 순위</h2>
	              </div>
	              {retrievalPreview ? <span className="badge">후보 {retrievalPreview.candidates.length}개</span> : null}
            </div>

            <label>
	              검색 질문
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} />
            </label>
            <div className="fieldGrid">
              <label>
	                팀
                <input value={teamSlugs} onChange={(event) => setTeamSlugs(event.target.value)} placeholder="payments" />
              </label>
              <label>
	                역할
                <input value={roles} onChange={(event) => setRoles(event.target.value)} placeholder="ops_admin, oncall" />
              </label>
            </div>
            <label>
	              후보 개수
              <input
                max={10}
                min={1}
                onChange={(event) => setRetrievalLimit(Number(event.target.value))}
                type="number"
                value={retrievalLimit}
              />
            </label>
            <button className="secondaryButton" disabled={loading === "retrieval"} type="submit">
	              {loading === "retrieval" ? "검색 중..." : "검색 미리보기"}
            </button>
          </form>

          <section className="retrievalPanel">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">권한</p>
                <h2>권한 감사</h2>
              </div>
              {retrievalPreview ? <span className="badge">{formatPermissionEnforcement(retrievalPreview.permissionAudit.enforcement)}</span> : null}
            </div>
            {retrievalPreview ? (
              <>
                <div className="retrievalStats">
                  <Metric label="허용" value={String(retrievalPreview.permissionAudit.allowedCandidateCount)} />
                  <Metric label="차단" value={String(retrievalPreview.permissionAudit.deniedCandidateCount)} />
                  <Metric label="후보 범위" value={String(retrievalPreview.permissionAudit.candidateWindow)} />
                  <Metric label="최고 점수" value={topRetrievalCandidate ? formatScore(topRetrievalCandidate.score) : "0.000"} />
                </div>
                <div className="opsBreakdown">
                  <span>사용자</span>
                  <code>
                    역할:{retrievalPreview.permissionAudit.actor.roles.join("|") || "없음"} 팀:
                    {retrievalPreview.permissionAudit.actor.teamSlugs.join("|") || "없음"}
                  </code>
                  <span>차단</span>
                  <code>{formatDeniedVisibility(retrievalPreview.permissionAudit.deniedByVisibility)}</code>
                </div>
              </>
            ) : (
              <p className="empty">답변 생성 전에 검색을 미리 실행해 허용 후보, 차단 범위, 권한 적용 방식을 확인합니다.</p>
            )}
          </section>

          <section className="retrievalDiagnostics" aria-label="검색 품질 진단">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">진단</p>
                <h2>검색 품질 진단</h2>
              </div>
              {retrievalPreview ? (
                <span className={retrievalPreview.diagnostics.status === "ready" ? "badge" : "badge review"}>
                  {formatRetrievalHealth(retrievalPreview.diagnostics.status)}
                </span>
              ) : null}
            </div>
            {retrievalPreview ? (
              <>
                <div className="diagnosticStats">
                  <Metric label="신뢰도 추정" value={formatPercent(retrievalPreview.diagnostics.confidenceEstimate)} />
                  <Metric label="점수 격차" value={formatScore(retrievalPreview.diagnostics.scoreGap)} />
                  <Metric label="출처 경로" value={String(retrievalPreview.diagnostics.sourceDiversity.uniquePathCount)} />
                  <Metric label="컨텍스트 포함" value={String(retrievalPreview.diagnostics.contextPackage.includedChunkCount)} />
                </div>
                <div className="diagnosticBanner">
                  <span>{formatRecommendedAction(retrievalPreview.diagnostics.recommendedAction)}</span>
                  <code>
                    컨텍스트 예산 {retrievalPreview.diagnostics.contextPackage.estimatedTokenCount}/
                    {retrievalPreview.diagnostics.contextPackage.tokenBudget} 토큰
                  </code>
                </div>
                <div className="queryTermList">
                  {retrievalPreview.diagnostics.queryTerms.length > 0 ? (
                    retrievalPreview.diagnostics.queryTerms.map((term) => <code key={term}>{term}</code>)
                  ) : (
                    <span>분리된 검색어 없음</span>
                  )}
                </div>
                <div className="queryPlanPanel" aria-label="검색 실행 계획">
                  <div className="queryPlanHeader">
                    <div>
                      <span>검색 실행 계획</span>
                      <strong>{formatRetrievalMode(retrievalPreview.diagnostics.queryPlan.mode)}</strong>
                    </div>
                    <code>{retrievalPreview.diagnostics.queryPlan.scoreFormula}</code>
                  </div>
                  <div className="queryPlanMeta">
                    <Metric label="후보 창" value={String(retrievalPreview.diagnostics.queryPlan.candidateWindow)} />
                    <Metric label="신뢰도 기준" value={formatPercent(retrievalPreview.diagnostics.queryPlan.thresholds.confidence)} />
                    <Metric label="최고 점수 기준" value={formatPercent(retrievalPreview.diagnostics.queryPlan.thresholds.topScore)} />
                    <Metric label="최대 청크" value={String(retrievalPreview.diagnostics.queryPlan.thresholds.maxContextChunks)} />
                  </div>
                  <div className="queryPlanStages">
                    {retrievalPreview.diagnostics.queryPlan.stages.map((stage, index) => (
                      <article className="queryPlanStage" key={stage.id}>
                        <span className={`statusDot ${stage.status}`} />
                        <div>
                          <strong>
                            {index + 1}. {stage.label}
                          </strong>
                          <p>{stage.input}</p>
                        </div>
                        <code>{stage.output}</code>
                        <small>{stage.evidence}</small>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="diagnosticChecks">
                  {retrievalPreview.diagnostics.checks.map((check) => (
                    <article className="diagnosticCheck" key={check.id}>
                      <div>
                        <span className={`statusDot ${check.status}`} />
                        <strong>{check.label}</strong>
                        <code>{formatDiagnosticMetric(check)}</code>
                      </div>
                      <p>{check.message}</p>
                    </article>
                  ))}
                </div>
                <div className="contextChunkList">
                  {retrievalPreview.diagnostics.contextPackage.chunks.slice(0, 4).map((chunk) => (
                    <div className="contextChunkItem" key={`${chunk.rank}-${chunk.path}`}>
                      <span>{chunk.rank}</span>
                      <strong>{chunk.path}</strong>
                      <code>{chunk.estimatedTokens} 토큰 · {formatContextReason(chunk.reason)}</code>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="empty">검색 미리보기를 실행하면 신뢰도 추정, 점수 격차, 출처 다양성, 컨텍스트 예산 진단을 확인합니다.</p>
            )}
          </section>

          <section className="retrievalResults">
            <div className="sectionHeader compact">
              <div>
	                <p className="eyebrow">근거</p>
	                <h2>순위가 매겨진 청크</h2>
              </div>
	              {retrievalPreview ? <span className="badge">상위 {retrievalPreview.limit}개</span> : null}
            </div>
            <div className="candidateList">
              {(retrievalPreview?.candidates ?? []).length > 0 ? (
                retrievalPreview?.candidates.map((candidate) => (
                  <article className="candidateItem" key={candidate.chunkId}>
                    <div className="candidateHead">
                      <span className="rank">{candidate.rank}</span>
                      <div>
                        <strong>{candidate.title}</strong>
                        <p>{candidate.path}</p>
                      </div>
                      <span className="badge">{formatVisibility(candidate.visibility)}</span>
                    </div>
                    <div className="scoreBars">
                      <ScoreBar label="종합" value={candidate.score} />
                      <ScoreBar label="벡터" value={candidate.retrieval.vectorScore ?? 0} />
                      <ScoreBar label="키워드" value={candidate.retrieval.lexicalScore ?? 0} />
                    </div>
                    <div className="candidateMeta">
                      <code>{formatRetrievalMode(candidate.retrieval.mode)}</code>
                      <code>{candidate.heading ?? "문서 본문"}</code>
                      <code>{candidate.teamSlug ?? "전체 공개"}</code>
                    </div>
                    <div className="rankingExplanation" aria-label="랭킹 설명">
                      <div className="rankingExplanationHead">
                        <strong>랭킹 설명</strong>
                        <code>{formatRankingMethod(candidate.rankingExplanation.method)}</code>
                      </div>
                      <div className="matchedTermStrip">
                        <span>매칭 검색어</span>
                        <div>
                          {candidate.rankingExplanation.matchedQueryTerms.length > 0 ? (
                            candidate.rankingExplanation.matchedQueryTerms.slice(0, 8).map((term) => <code key={term}>{term}</code>)
                          ) : (
                            <code>semantic_only</code>
                          )}
                        </div>
                      </div>
                      <div className="scoreContributionList">
                        {candidate.rankingExplanation.scoreContributions.slice(0, 3).map((item) => (
                          <div className="scoreContribution" key={`${candidate.chunkId}-${item.signal}`}>
                            <span>{item.label}</span>
                            <strong>
                              {formatScore(item.contribution)}
                              {typeof item.weight === "number" ? ` · 가중치 ${formatPercent(item.weight)}` : ""}
                            </strong>
                            <small>{item.evidence}</small>
                          </div>
                        ))}
                      </div>
                      <div className="accessExplanation">
                        <span>권한 통과</span>
                        <p>{candidate.rankingExplanation.accessDecision.reason}</p>
                        <code>{formatPermissionEnforcement(candidate.rankingExplanation.accessDecision.enforcement)}</code>
                      </div>
                    </div>
                    <p>{candidate.contentPreview}</p>
                  </article>
                ))
              ) : (
	                <p className="empty">검색 미리보기를 실행하면 후보 청크가 여기에 표시됩니다.</p>
              )}
            </div>
          </section>
          </>
          ) : null}

          {activeScreen === "quality" ? (
          <>
          <section className="observabilityPanel">
            <div className="sectionHeader compact">
              <div>
	                <p className="eyebrow">운영</p>
	                <h2>운영 지표 요약</h2>
	              </div>
	              {observability ? <span className="badge">도구 {observability.toolCalls.total}회</span> : null}
	              <button className="smallButton" disabled={loading === "observability"} onClick={loadObservability} type="button">
	                {loading === "observability" ? "불러오는 중..." : "운영 지표 불러오기"}
              </button>
            </div>
            {observability ? (
              <>
                {releaseGate ? (
                  <section className="releaseGatePanel" aria-label="배포 게이트">
                    <div className="releaseGateHeader">
                      <div>
	                        <span>릴리즈 게이트</span>
	                        <strong>{formatReleaseStatus(releaseGate.status)}</strong>
                      </div>
                      <code>
	                        준비:{releaseGate.summary.readinessOk ? "예" : "아니오"} 평가:
	                        {releaseGate.summary.latestEvalPassed ? "통과" : "실패"} 최신성:
	                        {releaseGate.summary.knowledgeFreshness.stale ? "재평가 필요" : "최신"} SLO:
	                        {formatSloStatus(releaseGate.summary.sloStatus)}
                      </code>
                    </div>
                    <div className="releaseGateList">
                      {releaseGate.checks.map((check) => (
	                        <article className="releaseGateItem" key={check.id}>
	                          <span className={check.status === "pass" ? "badge" : "badge review"}>{formatGateStatus(check.status)}</span>
	                          <div>
	                            <strong>{formatReleaseGateLabel(check.id, check.label)}</strong>
	                            <p>{formatReleaseGateEvidence(check.id, check.evidence)}</p>
	                          </div>
	                          <code>{check.owner}</code>
	                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
                <div className="opsGrid">
	                  <Metric label="질문" value={String(observability.questions.total)} />
	                  <Metric label="사람 검토율" value={formatPercent(observability.answers.humanReviewRate)} />
	                  <Metric label="평균 신뢰도" value={formatPercent(observability.answers.averageConfidence)} />
	                  <Metric label="평균 일치율" value={formatPercent(observability.answers.averageDocumentAgreement)} />
	                  <Metric label="승인" value={String(observability.approvals.total)} />
	                  <Metric label="피드백" value={String(observability.feedback.total)} />
                </div>
                <div className="opsBreakdown">
	                  <span>도구</span>
                  <code>{formatCountMap(observability.toolCalls.byName)}</code>
	                  <span>상태</span>
                  <code>{formatStatusCountMap(observability.toolCalls.byStatus)}</code>
	                  <span>색인</span>
                  <code>
	                    문서 {observability.documents.total}개 / 청크 {observability.documents.chunks}개
                  </code>
                </div>
                {apiRequests ? (
                  <section className="apiRequestPanel" aria-label="API 요청 관측성">
                    <div className="evalHistoryHead">
                      <span>API 요청 관측성</span>
                      <code>p95 {formatDuration(apiRequests.summary.p95DurationMs)}</code>
                    </div>
                    <div className="apiRequestStats">
                      <Metric label="24시간 요청" value={String(apiRequests.summary.total)} />
                      <Metric label="성공률" value={formatPercent(apiRequests.summary.successRate)} />
                      <Metric label="오류율" value={formatPercent(apiRequests.summary.errorRate)} />
                      <Metric label="중앙값" value={formatDuration(apiRequests.summary.p50DurationMs)} />
                    </div>
                    <div className="endpointList">
                      {apiRequests.byEndpoint.slice(0, 5).map((endpoint) => (
                        <article className="endpointItem" key={`${endpoint.method}-${endpoint.route}`}>
                          <div>
                            <strong>{endpoint.method} {endpoint.route}</strong>
                            <p>
                              요청 {endpoint.total}회 · 성공 {formatPercent(endpoint.successRate)} · 오류{" "}
                              {formatPercent(endpoint.errorRate)}
                            </p>
                          </div>
                          <code>p95 {formatDuration(endpoint.p95DurationMs)}</code>
                        </article>
                      ))}
                    </div>
                    <div className="recentRequestList">
                      {apiRequests.recent.slice(0, 4).map((request) => (
                        <div className="recentRequestItem" key={request.id}>
                          <span className={request.statusCode >= 500 ? "badge review" : "badge"}>
                            {request.statusCode}
                          </span>
                          <strong>{request.method} {request.route}</strong>
                          <code>{formatDuration(request.durationMs)}</code>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
                {sloReport ? (
                  <section className="sloPanel" aria-label="SLO 가드레일">
                    <div className="evalHistoryHead">
	                      <span>SLO 가드레일</span>
                    <code>{formatSloStatus(sloReport.status)}</code>
                    </div>
                    <div className="sloList">
	                      {sloReport.objectives.map((objective) => (
	                        <article className="sloItem" key={objective.id}>
	                          <div>
	                            <strong>{formatSloLabel(objective.id, objective.label)}</strong>
	                            <p>{formatSloDescription(objective.id, objective.description)}</p>
	                          </div>
	                          <span className={objective.status === "ok" ? "badge" : "badge review"}>{formatSloStatus(objective.status)}</span>
                          <div className="sloMeter">
                            <span>
                              {formatPercent(objective.actual)} {objective.operator} {formatPercent(objective.target)}
                            </span>
	                            <strong>예산 {formatPercent(objective.errorBudgetRemaining)}</strong>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
	              <p className="empty">저장된 운영 지표를 불러와 답변 품질, 검토 경계, 도구 호출, 승인, 피드백을 확인합니다.</p>
            )}
          </section>

          <section className="evalPanel" id="quality">
            <div className="sectionHeader compact">
              <div>
	                <p className="eyebrow">평가</p>
	                <h2>품질 게이트</h2>
	              </div>
	              {evaluation ? <span className={evaluation.passed ? "badge" : "badge review"}>{evaluation.passed ? "통과" : "실패"}</span> : null}
	              <button className="smallButton" disabled={loading === "evaluation"} onClick={loadEvaluation} type="button">
	                {loading === "evaluation" ? "불러오는 중..." : "평가 불러오기"}
              </button>
            </div>
            {evaluation ? (
              <>
                <div className="evalGrid">
	                  <Metric label="출처 적중" value={formatPercent(evaluation.metrics.sourceHitRate)} />
	                  <Metric label="1순위 출처" value={formatPercent(evaluation.metrics.topSourceAccuracy)} />
	                  <Metric label="사람 검토" value={formatPercent(evaluation.metrics.humanReviewAccuracy)} />
	                  <Metric label="문서 일치율" value={formatPercent(evaluation.metrics.documentAgreementScore)} />
	                  <Metric label="인용" value={formatPercent(evaluation.metrics.citationAccuracy)} />
                </div>
                <p className="ingestResult">
	                  {evaluation.suiteName} · 케이스 {evaluation.total}개 · 적중 {evaluation.rows.filter((row) => row.hit).length}개 ·{" "}
	                  일치율 {formatPercent(evaluation.metrics.documentAgreementScore)} · 인용 {formatPercent(evaluation.metrics.citationAccuracy)}
                </p>
                {evaluationHistory && evaluationHistory.items.length > 0 ? (
                  <div className="evalHistory" aria-label="평가 이력">
                    <div className="evalHistoryHead">
	                      <span>회귀 이력</span>
	                      <code>실행 {evaluationHistory.count}회</code>
                    </div>
                    {evaluationHistory.items.slice(0, 4).map((item) => (
                      <article className="evalHistoryItem" key={item.runId}>
                        <div>
	                          <strong>{item.passed ? "통과" : "실패"}</strong>
                          <p>
	                            {formatShortDate(item.createdAt)} · 케이스 {item.total}개 · {shortId(item.runId)}
                          </p>
                        </div>
                        <div className="evalHistoryMetrics">
	                          <span>적중 {formatPercent(item.metrics.sourceHitRate)}</span>
	                          <span>일치 {formatPercent(item.metrics.documentAgreementScore)}</span>
	                          <span>인용 {formatPercent(item.metrics.citationAccuracy)}</span>
	                          <span>Δ 일치 {formatDeltaPercent(item.deltas.documentAgreementScore)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
                <div className="evalCaseExplorer" aria-label="평가 케이스 탐색기">
                  {evaluation.rows.map((row) => (
                    <article className="evalCaseItem" key={row.id}>
                      <div className="evalCaseHead">
                        <div>
                          <strong>{row.id}</strong>
                          <p>
                            {row.expectedSources.join(", ")} {"->"} {row.actualSources[0] ?? "출처 없음"}
                          </p>
                        </div>
	                        <span className={row.hit ? "badge" : "badge review"}>{row.hit ? "적중" : "실패"}</span>
                      </div>
                      <div className="evalCaseMetrics">
	                        <Metric label="신뢰도" value={formatPercent(row.confidence)} />
	                        <Metric label="일치율" value={formatPercent(row.documentAgreement)} />
	                        <Metric label="사람 검토" value={row.needsHumanReview ? "예" : "아니오"} />
	                        <Metric label="인용" value={row.citationPresent ? "있음" : "없음"} />
                      </div>
                      <div className="evalSourceCompare">
	                        <span>기대 출처</span>
                        <code>{row.expectedSources.join(" | ")}</code>
	                        <span>실제 출처</span>
                        <code>{row.actualSources.join(" | ") || "없음"}</code>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
	              <p className="empty">`pnpm eval`을 실행한 뒤 최신 품질 리포트를 불러오세요.</p>
            )}
          </section>
          </>
          ) : null}

          {activeScreen === "review" ? (
          <section className="approvalPanel" id="review">
            <div className="sectionHeader compact">
              <div>
	                <p className="eyebrow">승인</p>
	                <h2>승인 대기열</h2>
	              </div>
	              <span className="badge review">대기 중</span>
            </div>
            <div className="approvalList">
              {visibleApprovals.length > 0 ? (
                visibleApprovals.map((approval) => (
                  <div className="approvalItem" key={approval.id}>
                    <strong>{approval.action}</strong>
	                    <p>{approval.question ?? "연결된 질문 없음"}</p>
                    <div className="approvalActions">
                      <button disabled={loading === "approval"} onClick={() => resolveApproval(approval.id, "approved")} type="button">
	                        승인
                      </button>
                      <button disabled={loading === "approval"} onClick={() => resolveApproval(approval.id, "rejected")} type="button">
	                        반려
                      </button>
                    </div>
                  </div>
                ))
              ) : (
	                <p className="empty">사람 검토가 필요한 민감 요청이 생기면 여기에 표시됩니다.</p>
              )}
            </div>
          </section>
          ) : null}

          {activeScreen === "audit" ? (
          <section className="auditPanel" id="audit">
            <div className="sectionHeader compact">
              <div>
	                <p className="eyebrow">감사</p>
	                <h2>도구 호출</h2>
	              </div>
	              <button className="smallButton" disabled={loading === "audit"} onClick={loadToolCalls} type="button">
	                {loading === "audit" ? "불러오는 중..." : "도구 호출 불러오기"}
              </button>
            </div>
            <section className="toolRegistry">
              <div className="sectionHeader compact">
                <div>
	                  <p className="eyebrow">레지스트리</p>
	                  <h2>에이전트 도구 계약</h2>
	                </div>
	                {agentTools.length > 0 ? <span className="badge">도구 {agentTools.length}개</span> : null}
	                <button className="smallButton" disabled={loading === "tools"} onClick={loadAgentTools} type="button">
	                  {loading === "tools" ? "불러오는 중..." : "레지스트리 불러오기"}
                </button>
              </div>
              {agentTools.length > 0 ? (
                <div className="toolRegistryList" aria-label="에이전트 도구 레지스트리">
                  {agentTools.map((tool) => (
                    <article className="toolRegistryItem" key={tool.name}>
                      <div>
                        <strong>{tool.name}</strong>
                        <p>{tool.description}</p>
                      </div>
                      <span className={tool.approvalPolicy === "human_required" ? "badge review" : "badge"}>
	                        {tool.approvalPolicy === "human_required" ? "사람 승인 필요" : "자동 허용"}
                      </span>
                      <div className="toolRegistryMeta">
                        <code>{formatToolCategory(tool.category)}</code>
                        <code>{formatToolSideEffect(tool.sideEffect)}</code>
                        <code>{formatRuntimeStatus(tool.statusWhenCalled)}</code>
                      </div>
                      <div className="toolSchemaGrid">
	                        <span>입력</span>
                        <code>{formatSchemaMap(tool.inputSchema)}</code>
	                        <span>출력</span>
                        <code>{formatSchemaMap(tool.outputSchema)}</code>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
	                <p className="empty">레지스트리를 불러와 도구 계약, 부작용, 승인 정책을 확인합니다.</p>
              )}
            </section>
            <section className="slackProof">
              <div className="sectionHeader compact">
                <div>
	                  <p className="eyebrow">Slack</p>
	                  <h2>스레드 답변 증명</h2>
                </div>
                {slackTrace?.trace ? <span className="badge">{formatSlackPostMode(slackTrace.trace.reply.postMode)}</span> : null}
                <button className="smallButton" disabled={loading === "slack"} onClick={runSlackSimulation} type="button">
	                  {loading === "slack" ? "시뮬레이션 중..." : "Slack 시뮬레이션"}
                </button>
              </div>
              {slackTrace?.trace ? (
                <>
                  <div className="slackProofGrid">
	                    <Metric label="채널" value={slackTrace.trace.channel} />
	                    <Metric label="스레드" value={slackTrace.trace.threadTs} />
	                    <Metric label="답변 블록" value={String(slackTrace.trace.reply.blockCount)} />
	                    <Metric label="출처" value={String(slackTrace.trace.sources.length)} />
                  </div>
                  <div className="slackProofDetails">
	                    <span>사용자</span>
                    <code>
                      {slackTrace.trace.actor.actorId ?? "알 수 없음"} · 역할:{slackTrace.trace.actor.roles.join("|") || "없음"} · 팀:
                      {slackTrace.trace.actor.teamSlugs.join("|") || "없음"}
                    </code>
	                    <span>질문</span>
                    <code>{slackTrace.trace.question}</code>
	                    <span>답변</span>
                    <code>{slackTrace.trace.answerId}</code>
	                    <span>도구</span>
                    <code>{slackTrace.trace.toolCalls.map((tool) => `${tool.toolName}:${formatRuntimeStatus(tool.status)}`).join(" ") || "없음"}</code>
                  </div>
                </>
              ) : (
	                <p className="empty">Slack 멘션을 시뮬레이션해서 사용자 매핑, 스레드 답변 메타데이터, 출처, 도구 호출을 확인합니다.</p>
              )}
            </section>
            <div className="auditList">
              {toolCalls.length > 0 ? (
                toolCalls.map((tool) => (
                  <div className="auditItem" key={tool.id}>
                    <div>
                      <strong>{tool.toolName}</strong>
	                      <p>{tool.question ?? "연결된 질문 없음"}</p>
                    </div>
	                    <span className={tool.status === "needs_approval" ? "badge review" : "badge"}>{formatRuntimeStatus(tool.status)}</span>
                    <code>{summarizeToolOutput(tool.output)}</code>
                  </div>
                ))
              ) : (
	                <p className="empty">질문을 실행하면 최근 에이전트 도구 호출이 여기에 표시됩니다.</p>
              )}
            </div>
          </section>
          ) : null}

          {activeScreen === "documents" ? (
          <>
          <section className="knowledgePanel">
            <div className="sectionHeader compact">
              <div>
	                <p className="eyebrow">지식 베이스</p>
	                <h2>색인 현황과 청크</h2>
	              </div>
	              <button className="smallButton" disabled={loading === "documents"} onClick={loadDocuments} type="button">
	                {loading === "documents" ? "불러오는 중..." : "색인 새로고침"}
              </button>
            </div>

            <div className="inventoryStats">
	              <Metric label="문서" value={String(documentStats.total)} />
	              <Metric label="청크" value={String(documentStats.chunks)} />
	              <Metric label="제한 문서" value={String(documentStats.restricted)} />
	              <Metric label="마스킹" value={String(documentStats.redactions)} />
	              <Metric label="주입 격리" value={String(documentStats.promptRisks)} />
            </div>

            <section className="indexQualityPanel" aria-label="색인 품질 리포트">
              <div className="qualityHead">
                <div>
                  <p className="eyebrow">품질 게이트</p>
                  <h2>색인 품질 리포트</h2>
                </div>
                {indexQuality ? (
                  <span className={indexQuality.status === "healthy" ? "badge" : "badge review"}>
                    {formatIndexQualityStatus(indexQuality.status)}
                  </span>
                ) : null}
                <button className="smallButton" disabled={loading === "quality-report"} onClick={loadIndexQuality} type="button">
                  {loading === "quality-report" ? "검사 중..." : "품질 검사"}
                </button>
              </div>

              {indexQuality ? (
                <>
                  <div className="qualitySummary">
                    <Metric label="게이트 통과율" value={formatPercent(indexQuality.score)} />
                    <Metric label="평균 청크" value={`${Math.round(indexQuality.summary.avgChunkLength)}자`} />
                    <Metric label="문서당 청크" value={indexQuality.summary.avgChunksPerDocument.toFixed(1)} />
                    <Metric label="보안 격리" value={`${indexQuality.summary.promptInjectionRiskCount}건`} />
                  </div>
                  <div className="qualityGateList">
                    {indexQuality.gates.map((gate) => (
                      <article className="qualityGateItem" key={gate.id}>
                        <span className={gate.status === "pass" ? "badge" : "badge review"}>{formatGateStatus(gate.status)}</span>
                        <div>
                          <strong>{gate.label}</strong>
                          <p>{gate.message}</p>
                        </div>
                        <code>
                          {gate.metric}/{gate.threshold}
                        </code>
                      </article>
                    ))}
                  </div>
                  <div className="qualityDocumentList">
                    {indexQuality.documents.slice(0, 4).map((document) => (
                      <article className="qualityDocumentItem" key={document.id}>
                        <div className="qualityDocumentTitle">
                          <div>
                            <strong>{document.title}</strong>
                            <p>{document.path}</p>
                          </div>
                          <code>
                            청크 {document.chunkCount}개 · 헤딩 {formatPercent(document.headingCoverageRatio)}
                          </code>
                        </div>
                        <div className="qualityChecks">
                          {document.checks.map((check) => (
                            <span className={check.status === "pass" ? "allow" : "deny"} key={check.id} title={check.message}>
                              {check.label}
                            </span>
                          ))}
                        </div>
                        <p>{document.recommendations[0]}</p>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <p className="empty">품질 검사를 실행하면 문서 수, 청크 커버리지, 버전 커버리지, 헤딩 보존, 보안 격리 상태가 표시됩니다.</p>
              )}
            </section>

            {documents.length > 0 ? (
              <div className="inventoryGrid">
                <div className="documentList" aria-label="색인된 문서">
                  {documents.map((document) => (
                    <button
                      className={selectedDocument?.id === document.id ? "documentRow active" : "documentRow"}
                      key={document.id}
                      onClick={() => {
                        setSelectedDocumentId(document.id);
                        setDocumentVersionHistory(null);
                      }}
                      type="button"
                    >
                      <span>
                        <strong>{document.title}</strong>
                        <small>{document.path}</small>
                      </span>
	                      <code>청크 {document.chunkCount}개</code>
                    </button>
                  ))}
                </div>

                <div className="chunkInspector">
                  {selectedDocument ? (
                    <>
                      <div className="chunkHeader">
                        <div>
                          <span>{formatVisibility(selectedDocument.visibility)}</span>
                          <strong>{selectedDocument.title}</strong>
                          <p>{selectedDocument.path}</p>
                        </div>
                        <button className="smallButton" disabled={loading === "versions"} onClick={() => loadDocumentVersions()} type="button">
	                          {loading === "versions" ? "불러오는 중..." : `v${selectedDocument.latestVersion} 이력`}
                        </button>
                      </div>
                      <div className="securityLine">
	                        <span>팀: {selectedDocument.teamSlug ?? "전체 공개"}</span>
	                        <span>마스킹: {getRedactionCount(selectedDocument)}</span>
	                        <span className={hasPromptInjectionRisk(selectedDocument) ? "securityWarn" : ""}>
	                          프롬프트 주입: {formatPromptInjectionRisk(selectedDocument)}
	                        </span>
	                        <span>해시: {selectedDocument.contentHash.slice(0, 10)}</span>
                      </div>
                      {documentVersionHistory?.document.id === selectedDocument.id ? (
                        <section className="versionPanel" aria-label="문서 버전 이력">
                          <div className="versionSummary">
                            <div>
	                              <span>버전 이력</span>
	                              <strong>버전 {documentVersionHistory.versions.length}개</strong>
                            </div>
                            <div>
	                              <span>최신 변경</span>
                              <strong>
                                {documentVersionHistory.latestDiff
                                  ? `+${documentVersionHistory.latestDiff.addedLineCount} -${documentVersionHistory.latestDiff.removedLineCount}`
	                                  : "초기 버전"}
                              </strong>
                            </div>
                            <code>{documentVersionHistory.latestDiff?.method ?? "이전 버전 없음"}</code>
                          </div>
                          <div className="versionList">
                            {documentVersionHistory.versions.slice(0, 4).map((version) => (
                              <article className="versionItem" key={version.id}>
                                <div>
                                  <strong>v{version.version}</strong>
                                  <span>{formatShortDate(version.createdAt)}</span>
                                  <code>{version.contentHash.slice(0, 10)}</code>
                                </div>
                                <p>{version.contentPreview}</p>
                                {version.diffFromPrevious ? (
                                  <small>
                                    +{version.diffFromPrevious.addedLineCount} -{version.diffFromPrevious.removedLineCount} ·{" "}
	                                    {version.diffFromPrevious.addedPreview[0] ?? "메타데이터만 변경"}
                                  </small>
                                ) : (
	                                  <small>초기 색인 버전</small>
                                )}
                              </article>
                            ))}
                          </div>
                        </section>
                      ) : null}
                      <div className="chunkList">
                        {selectedDocument.chunks.map((chunk) => (
                          <article className="chunkItem" key={chunk.id}>
                            <div>
                              <strong>#{chunk.chunkIndex}</strong>
	                              <span>{chunk.heading ?? "문서 본문"}</span>
	                              <code>{chunk.contentLength}자</code>
                            </div>
                            <p>{chunk.contentPreview}</p>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
	              <p className="empty">색인을 새로고침하거나 Markdown 문서를 등록하면 청킹 결과를 확인할 수 있습니다.</p>
            )}
          </section>

          <section className="queuePanel" aria-label="BullMQ 색인 큐 관제">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">비동기 색인</p>
                <h2>BullMQ 큐 관제</h2>
              </div>
              <div className="headerActions">
                {queueHealth ? (
                  <span className={queueHealth.worker.running ? "badge" : "badge review"}>
                    {queueHealth.worker.running ? "워커 실행 중" : "워커 미실행"}
                  </span>
                ) : null}
                <button className="smallButton" disabled={loading === "queue"} onClick={loadIndexingQueueHealth} type="button">
                  {loading === "queue" ? "불러오는 중..." : "큐 상태 불러오기"}
                </button>
              </div>
            </div>

            {queueHealth ? (
              <>
                <div className="queueStats">
                  <Metric label="대기" value={String(queueHealth.counts.waiting)} />
                  <Metric label="실행" value={String(queueHealth.counts.active)} />
                  <Metric label="완료" value={String(queueHealth.counts.completed)} />
                  <Metric label="실패" value={String(queueHealth.counts.failed)} />
                  <Metric label="지연" value={String(queueHealth.counts.delayed)} />
                  <Metric label="동시성" value={String(queueHealth.worker.concurrency)} />
                </div>
                <div className="queueMetaLine">
                  <span>{queueHealth.queueName}</span>
                  <span>생성 {formatShortDate(queueHealth.generatedAt)}</span>
                  <button className="smallButton" disabled={loading === "queue"} onClick={enqueueCurrentMarkdownIndexingJob} type="button">
                    현재 Markdown 큐 등록
                  </button>
                </div>
                {queuedIndexingJob ? (
                  <div className="queueNotice">
                    <strong>{formatQueueState(queuedIndexingJob.state)}</strong>
                    <span>{queuedIndexingJob.data.path}</span>
                    <code>{shortId(queuedIndexingJob.id)}</code>
                  </div>
                ) : null}
                <div className="queueJobList">
                  {queueHealth.recent.length > 0 ? (
                    queueHealth.recent.map((job) => (
                      <article className="queueJobItem" key={job.id}>
                        <div className="queueJobHead">
                          <span className={job.state === "failed" ? "badge review" : "badge"}>{formatQueueState(job.state)}</span>
                          <div>
                            <strong>{job.data.path}</strong>
                            <p>{job.name} · {formatQueueSource(job.data.source)} · {shortId(job.id)}</p>
                          </div>
                          <code>{formatQueueDuration(job.durationMs)}</code>
                        </div>
                        <div className="queueJobMeta">
                          <span>요청 {formatShortDate(job.data.requestedAt)}</span>
                          <span>시도 {job.attemptsMade}회</span>
                          <span>{formatQueueProgress(job.progress)}</span>
                          {job.result ? <span>청크 {job.result.chunks}개</span> : null}
                        </div>
                        {job.failedReason ? <p className="queueFailure">{job.failedReason}</p> : null}
                      </article>
                    ))
                  ) : (
                    <p className="empty">최근 색인 큐 작업이 없습니다.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="empty">큐 상태를 불러오면 대기, 실행, 완료, 실패 작업과 워커 상태가 표시됩니다.</p>
            )}
          </section>

          <section className="permissionMatrixPanel">
            <div className="sectionHeader compact">
              <div>
	                <p className="eyebrow">권한 매트릭스</p>
	                <h2>문서 접근 시뮬레이터</h2>
              </div>
	              {permissionMatrix ? <span className="badge">문서 {permissionMatrix.documents.length}개</span> : null}
	              <button className="smallButton" disabled={loading === "matrix"} onClick={loadPermissionMatrix} type="button">
	                {loading === "matrix" ? "불러오는 중..." : "매트릭스 불러오기"}
              </button>
            </div>

            {permissionMatrix ? (
              <>
                <div className="matrixSummary">
                  {permissionMatrix.summary.map((summary) => (
                    <Metric
                      key={summary.persona}
                      label={formatPersonaLabel(permissionMatrix, summary.persona)}
	                      value={`${summary.allowed}/${summary.allowed + summary.denied} 허용`}
                    />
                  ))}
                </div>
                <div className="matrixTable" aria-label="권한 경계 매트릭스">
                  <div className="matrixHeader">
	                    <span>문서</span>
                    {permissionMatrix.policy.personas.map((persona) => (
                      <span key={persona.id}>{persona.label}</span>
                    ))}
                  </div>
                  {permissionMatrix.documents.slice(0, 8).map((document) => (
                    <article className="matrixRow" key={document.id}>
                      <div>
                        <strong>{document.title}</strong>
                        <p>
                          {document.path} · {formatVisibility(document.visibility)}
                          {document.teamSlug ? `:${document.teamSlug}` : ""}
                        </p>
                      </div>
                      {permissionMatrix.policy.personas.map((persona) => {
                        const decision = document.decisions.find((item) => item.persona === persona.id);
                        return (
                          <span className={decision?.allowed ? "allow" : "deny"} key={`${document.id}-${persona.id}`} title={decision?.reason}>
	                            {decision?.allowed ? "허용" : "차단"}
                          </span>
                        );
                      })}
                    </article>
                  ))}
                </div>
                <div className="policyRules">
                  {permissionMatrix.policy.visibilityLevels.map((level) => (
                    <p key={level.visibility}>
                      <strong>{level.visibility}</strong>
                      {level.rule}
                    </p>
                  ))}
                </div>
              </>
            ) : (
	              <p className="empty">매트릭스를 불러와 전체 공개, 팀 한정, 제한 문서 접근이 사용자별로 어떻게 달라지는지 확인합니다.</p>
            )}
          </section>

          <form onSubmit={submitMarkdown} className="indexPanel" id="index">
            <div className="sectionHeader compact">
              <div>
	                <p className="eyebrow">색인</p>
	                <h2>Markdown 등록</h2>
	              </div>
	              {ingest ? <span className="badge">{ingest.changed ? "변경됨" : "색인됨"}</span> : null}
            </div>

            <label>
	              경로
              <input value={path} onChange={(event) => setPath(event.target.value)} />
            </label>
            <label>
	              Markdown
              <textarea value={markdown} onChange={(event) => setMarkdown(event.target.value)} rows={10} />
            </label>
            <button className="secondaryButton" disabled={loading === "ingest"} type="submit">
	              {loading === "ingest" ? "색인 중..." : "등록하고 RAG 검증"}
            </button>
            <button className="smallButton" disabled={!ingest || loading === "verify"} onClick={() => verifyIndexedDocument()} type="button">
	              {loading === "verify" ? "검증 중..." : "색인 문서 검증"}
            </button>
            {ingest ? (
              <p className="ingestResult">
	                {ingest.title} 문서가 청크 {ingest.chunks}개로 색인됐습니다.
              </p>
            ) : null}
            {indexProof ? (
              <section className={indexProof.sourceHit ? "indexProof" : "indexProof warning"} aria-label="색인 검증 증거">
                <div className="sectionHeader compact">
                  <div>
	                    <p className="eyebrow">증명</p>
	                    <h2>{indexProof.sourceHit ? "색인 문서 검색 성공" : "1순위 출처 불일치"}</h2>
	                  </div>
	                  <span className={indexProof.sourceHit ? "badge" : "badge review"}>{indexProof.sourceHit ? "출처 적중" : "검토"}</span>
                </div>
                <div className="proofGrid">
	                  <Metric label="청크" value={String(indexProof.chunkCount)} />
	                  <Metric label="최고 점수" value={indexProof.topScore === null ? "해당 없음" : formatScore(indexProof.topScore)} />
	                  <Metric label="답변 일치율" value={formatPercent(indexProof.documentAgreement)} />
	                  <Metric label="신뢰도" value={formatPercent(indexProof.confidence)} />
                </div>
                <div className="proofDetails">
	                  <span>질문</span>
                  <code>{indexProof.query}</code>
	                  <span>기대 출처</span>
                  <code>{indexProof.path}</code>
	                  <span>1순위 출처</span>
                  <code>{indexProof.topSourcePath ?? "없음"}</code>
	                  <span>답변</span>
                  <code>{indexProof.answerId}</code>
                </div>
              </section>
            ) : null}
          </form>

          <form onSubmit={submitGithubSync} className="indexPanel">
            <div className="sectionHeader compact">
              <div>
	                <p className="eyebrow">동기화</p>
	                <h2>GitHub Markdown</h2>
	              </div>
	              {githubSync ? <span className="badge">문서 {githubSync.documents.length}개</span> : null}
            </div>

            <div className="fieldGrid compactFields">
              <label>
	                소유자
                <input value={githubOwner} onChange={(event) => setGithubOwner(event.target.value)} />
              </label>
              <label>
	                저장소
                <input value={githubRepo} onChange={(event) => setGithubRepo(event.target.value)} />
              </label>
            </div>
            <div className="fieldGrid compactFields">
              <label>
	                브랜치
                <input value={githubBranch} onChange={(event) => setGithubBranch(event.target.value)} />
              </label>
              <label>
	                루트 경로
                <input value={githubRootPath} onChange={(event) => setGithubRootPath(event.target.value)} />
              </label>
            </div>
            <label>
	              출처 prefix
              <input value={githubSourcePrefix} onChange={(event) => setGithubSourcePrefix(event.target.value)} />
            </label>
            <button className="secondaryButton" disabled={loading === "github"} type="submit">
	              {loading === "github" ? "동기화 중..." : "GitHub 문서 동기화"}
            </button>
            {githubSync ? (
              <p className="ingestResult">
	                {githubSync.owner}/{githubSync.repo}에서 Markdown 문서 {githubSync.documents.length}개를 동기화했습니다.
              </p>
            ) : null}
          </form>
          </>
          ) : null}
        </aside>
      </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const width = `${Math.max(0, Math.min(value, 1)) * 100}%`;
  return (
    <div className="scoreBar">
      <div>
        <span>{label}</span>
        <strong>{formatScore(value)}</strong>
      </div>
      <i style={{ width }} />
    </div>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatScore(value: number): string {
  return value.toFixed(3);
}

function formatDuration(value: number): string {
  if (value < 1000) {
    return `${value}ms`;
  }
  return `${(value / 1000).toFixed(1)}s`;
}

function formatProofMetric(check: AnswerProof["checks"][number]): string {
  if (typeof check.metric === "number" && typeof check.threshold === "number") {
    return `${formatPercent(check.metric)} / ${formatPercent(check.threshold)}`;
  }
  return "검사 완료";
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function formatDeltaPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "해당 없음";
  }

  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function summarizeToolOutput(output: Record<string, unknown>): string {
  if (typeof output.sourceCount === "number") {
    const permissionAudit = output.permissionAudit as { deniedCandidateCount?: unknown } | undefined;
    const denied =
      permissionAudit && typeof permissionAudit.deniedCandidateCount === "number"
        ? `, 차단 ${permissionAudit.deniedCandidateCount}개`
        : "";
    return `출처 ${output.sourceCount}개${denied}`;
  }
  if (typeof output.approvalStatus === "string") {
    return `승인 ${output.approvalStatus}`;
  }
  if (typeof output.itemCount === "number") {
    return `체크리스트 ${output.itemCount}개`;
  }
  return "기록됨";
}

function summarizeTraceEvent(event: AnswerTrace["timeline"][number]): string {
  if (event.kind === "retrieval") {
    const sourceCount = typeof event.detail.sourceCount === "number" ? event.detail.sourceCount : 0;
    const topSource = typeof event.detail.topSource === "string" ? event.detail.topSource : "없음";
    return `출처 ${sourceCount}개 · 1순위 ${topSource}`;
  }

  if (event.kind === "answer") {
    const confidence = typeof event.detail.confidence === "number" ? formatPercent(event.detail.confidence) : "해당 없음";
    const match = typeof event.detail.documentAgreementScore === "number" ? formatPercent(event.detail.documentAgreementScore) : "해당 없음";
    const duration = typeof event.detail.durationMs === "number" ? formatDuration(event.detail.durationMs) : "해당 없음";
    return `신뢰도 ${confidence} · 일치율 ${match} · ${duration}`;
  }

  if (event.kind === "tool") {
    const output = event.detail.output && typeof event.detail.output === "object" ? (event.detail.output as Record<string, unknown>) : {};
    return summarizeToolOutput(output);
  }

  if (event.kind === "approval") {
    const reason = event.detail.reason && typeof event.detail.reason === "object" ? (event.detail.reason as Record<string, unknown>) : {};
    return typeof reason.policy === "string" ? reason.policy : "사람 승인 경계";
  }

  if (event.kind === "feedback") {
    return typeof event.detail.comment === "string" && event.detail.comment ? event.detail.comment : "평점 기록됨";
  }

  return typeof event.detail.question === "string" ? event.detail.question : "질문 수신";
}

function formatDeniedVisibility(deniedByVisibility: Record<string, number>): string {
  const entries = Object.entries(deniedByVisibility);
  if (entries.length === 0) {
    return "차단된 권한 레벨 없음";
  }

  return entries.map(([visibility, count]) => `${formatVisibility(visibility)}:${count}`).join(" ");
}

function formatPersonaLabel(matrix: PermissionBoundaryMatrix, personaId: string): string {
  return matrix.policy.personas.find((persona) => persona.id === personaId)?.label ?? personaId;
}

function formatCountMap(values: Record<string, number>): string {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return "없음";
  }
  return entries.map(([key, value]) => `${key}:${value}`).join(" ");
}

function formatSchemaType(value: string): string {
  const labels: Record<string, string> = {
    string: "문자열",
    number: "숫자",
    "string[]": "문자열[]",
    RequestContext: "호출자 컨텍스트",
    PermissionBoundaryAudit: "권한 감사"
  };
  return labels[value] ?? value;
}

function formatStatusCountMap(values: Record<string, number>): string {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return "없음";
  }
  return entries.map(([key, value]) => `${formatRuntimeStatus(key)}:${value}`).join(" ");
}

function formatSchemaMap(values: Record<string, string>): string {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return "없음";
  }
  return entries.map(([key, value]) => `${key}:${formatSchemaType(value)}`).join(" ");
}

function formatGateStatus(status: string): string {
  const labels: Record<string, string> = {
    pass: "통과",
    warn: "주의",
    fail: "실패",
    ok: "정상",
    breach: "위반"
  };
  return labels[status] ?? status;
}

function formatIndexQualityStatus(status: string): string {
  const labels: Record<string, string> = {
    healthy: "정상",
    warning: "주의",
    critical: "위험"
  };
  return labels[status] ?? status;
}

function formatSloStatus(status: string): string {
  const labels: Record<string, string> = {
    ok: "정상",
    warn: "주의",
    breach: "위반"
  };
  return labels[status] ?? status;
}

function formatReleaseStatus(status: string): string {
  const labels: Record<string, string> = {
    pass: "통과",
    review: "검토 필요",
    block: "차단"
  };
  return labels[status] ?? status;
}

function formatProofStatus(status: string): string {
  const labels: Record<string, string> = {
    verified: "검증됨",
    review_required: "검토 필요",
    insufficient_evidence: "근거 부족"
  };
  return labels[status] ?? status;
}

function formatReplayStatus(status: string): string {
  const labels: Record<string, string> = {
    stable: "안정",
    needs_review: "검토 필요",
    drifted: "변경 감지"
  };
  return labels[status] ?? status;
}

function formatRuntimeStatus(status: string): string {
  const labels: Record<string, string> = {
    allowed: "허용",
    needs_approval: "승인 필요",
    needs_review: "검토 필요",
    created: "생성",
    grounded: "근거 있음",
    empty: "비어 있음",
    auto: "자동",
    helpful: "도움됨",
    needs_work: "개선 필요",
    pending: "대기",
    approved: "승인",
    rejected: "반려",
    pass: "통과",
    warn: "주의",
    fail: "실패",
    completed: "완료",
    failed: "실패"
  };
  return labels[status] ?? status;
}

function formatQueueState(state: string): string {
  const labels: Record<string, string> = {
    waiting: "대기",
    active: "실행",
    completed: "완료",
    failed: "실패",
    delayed: "지연",
    paused: "일시정지",
    prioritized: "우선순위",
    "waiting-children": "하위 작업 대기"
  };
  return labels[state] ?? state;
}

function formatQueueSource(source: string): string {
  const labels: Record<string, string> = {
    api: "API",
    smoke: "스모크"
  };
  return labels[source] ?? source;
}

function formatQueueDuration(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "처리 전";
  }
  return formatDuration(value);
}

function formatQueueProgress(progress: IndexingJobStatus["progress"]): string {
  if (typeof progress === "number") {
    return `진행률 ${progress}%`;
  }
  if (typeof progress === "string") {
    return progress;
  }
  if (typeof progress === "object" && progress !== null) {
    const stage = "stage" in progress && typeof progress.stage === "string" ? progress.stage : "진행 중";
    const chunks = "chunks" in progress && typeof progress.chunks === "number" ? ` · 청크 ${progress.chunks}개` : "";
    return `${formatQueueStage(stage)}${chunks}`;
  }
  return "진행 정보 없음";
}

function formatQueueStage(stage: string): string {
  const labels: Record<string, string> = {
    ingesting: "색인 중",
    indexed: "색인 완료"
  };
  return labels[stage] ?? stage;
}

function formatVisibility(visibility: string): string {
  const labels: Record<string, string> = {
    public: "전체 공개",
    team: "팀 한정",
    restricted: "제한"
  };
  return labels[visibility] ?? visibility;
}

function formatPermissionEnforcement(enforcement: string): string {
  const labels: Record<string, string> = {
    pre_ranking_sql_filter: "검색 전 SQL 권한 필터",
    postgres_recheck_after_elasticsearch: "Elasticsearch 이후 PostgreSQL 권한 재검사"
  };
  return labels[enforcement] ?? enforcement;
}

function formatRetrievalMode(mode: string): string {
  const labels: Record<string, string> = {
    vector: "벡터 검색",
    hybrid: "하이브리드 검색"
  };
  return labels[mode] ?? mode;
}

function formatRankingMethod(method: string): string {
  const labels: Record<string, string> = {
    weighted_vector_lexical_v1: "벡터/키워드 가중 랭킹",
    rrf_hybrid_v1: "RRF 하이브리드 랭킹"
  };
  return labels[method] ?? method;
}

function formatRetrievalHealth(status: string): string {
  const labels: Record<string, string> = {
    ready: "답변 가능",
    review: "검토 권고",
    blocked: "근거 부족"
  };
  return labels[status] ?? status;
}

function formatRecommendedAction(action: string): string {
  const labels: Record<string, string> = {
    answer: "리뷰 없이 답변 생성 가능",
    answer_with_context_review: "답변 가능, 제외 청크만 확인",
    human_review: "답변 전 담당자 검토 권고",
    clarify_or_expand_sources: "질문 보강 또는 문서 추가 필요"
  };
  return labels[action] ?? action;
}

function formatDiagnosticMetric(check: RetrievalPreviewResponse["diagnostics"]["checks"][number]): string {
  if (typeof check.metric !== "number") {
    return "측정값 없음";
  }
  if (typeof check.threshold !== "number") {
    return formatDiagnosticNumber(check.metric, check.metric);
  }
  const value = formatDiagnosticNumber(check.metric, check.threshold);
  const threshold = formatDiagnosticNumber(check.threshold, check.metric);
  return `${value} / ${threshold}`;
}

function formatDiagnosticNumber(value: number, pairedValue: number): string {
  if (value <= 1 && pairedValue <= 1) {
    return formatPercent(value);
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return formatScore(value);
}

function formatToolCategory(category: string): string {
  const labels: Record<string, string> = {
    retrieval: "검색",
    runbook: "런북",
    approval: "승인"
  };
  return labels[category] ?? category;
}

function formatToolSideEffect(sideEffect: string): string {
  const labels: Record<string, string> = {
    none: "부작용 없음",
    database_write: "데이터베이스 쓰기"
  };
  return labels[sideEffect] ?? sideEffect;
}

function formatSlackPostMode(mode: string): string {
  const labels: Record<string, string> = {
    dry_run: "로컬 시뮬레이션",
    live: "실제 전송"
  };
  return labels[mode] ?? mode;
}

function formatContextReason(reason: string): string {
  const labels: Record<string, string> = {
    within_budget: "예산 안",
    rank_cutoff: "순위 제외",
    budget_exceeded: "예산 초과"
  };
  return labels[reason] ?? reason;
}

function formatTraceKind(kind: string): string {
  const labels: Record<string, string> = {
    question: "질문",
    retrieval: "검색",
    answer: "답변",
    tool: "도구",
    approval: "승인",
    feedback: "피드백"
  };
  return labels[kind] ?? kind;
}

function formatTraceEventTitle(title: string): string {
  const labels: Record<string, string> = {
    "Question persisted": "질문 저장",
    "Sources attached": "출처 연결",
    "Answer generated": "답변 생성",
    "Tool call persisted": "도구 호출 저장",
    "Approval requested": "승인 요청",
    "Feedback saved": "피드백 저장"
  };
  return labels[title] ?? title;
}

function formatReleaseGateLabel(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    dependencies_ready: "의존성 준비",
    indexed_knowledge_ready: "지식 색인 준비",
    latest_eval_gate: "최신 평가 게이트",
    knowledge_freshness: "평가 최신성",
    slo_guardrails: "SLO 가드레일",
    agent_audit_trail: "에이전트 감사 추적",
    approval_backlog: "승인 대기열",
    feedback_signal: "피드백 신호"
  };
  return labels[id] ?? fallback;
}

function formatReleaseGateEvidence(id: string, fallback: string): string {
  if (id === "dependencies_ready") {
    return fallback
      .replace("PostgreSQL=", "PostgreSQL=")
      .replace("Redis=", "Redis=")
      .replace("Elasticsearch=", "Elasticsearch=");
  }
  if (id === "indexed_knowledge_ready") {
    const match = fallback.match(/(\d+) documents and (\d+) chunks/);
    return match ? `문서 ${match[1]}개와 청크 ${match[2]}개가 색인됐습니다.` : fallback;
  }
  if (id === "latest_eval_gate") {
    return fallback.includes("passed") ? "최신 seed-ops-wiki 평가가 통과했습니다." : "최신 seed-ops-wiki 평가가 없거나 실패했습니다.";
  }
  if (id === "knowledge_freshness") {
    const staleMatch = fallback.match(/(\d+) documents changed after the latest seed-ops-wiki evaluation/);
    if (staleMatch) {
      return `최신 평가 이후 변경된 문서가 ${staleMatch[1]}개 있습니다. 재평가가 필요합니다.`;
    }
    if (fallback.includes("No seed-ops-wiki evaluation")) {
      return "색인된 지식 베이스에 대한 seed-ops-wiki 평가가 아직 없습니다.";
    }
    return "최신 seed-ops-wiki 평가가 색인 문서보다 최신입니다.";
  }
  if (id === "slo_guardrails") {
    const match = fallback.match(/(\d+) SLO objectives report ([^.]+)/);
    return match ? `SLO 목표 ${match[1]}개가 ${formatSloStatus(match[2])} 상태입니다.` : fallback;
  }
  if (id === "agent_audit_trail") {
    return fallback.replace("search_documents=", "search_documents=").replace("request_human_approval=", "request_human_approval=");
  }
  if (id === "approval_backlog") {
    const match = fallback.match(/(\d+) pending approvals; review threshold is (\d+)/);
    return match ? `대기 중인 승인 ${match[1]}개, 검토 기준 ${match[2]}개입니다.` : fallback;
  }
  if (id === "feedback_signal") {
    const match = fallback.match(/(\d+) feedback records/);
    return match ? `피드백 ${match[1]}건이 저장돼 있습니다.` : "아직 저장된 피드백이 없습니다.";
  }
  return fallback;
}

function formatSloLabel(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    answer_grounding: "답변 근거성",
    review_load: "검토 부하",
    tool_audit_coverage: "도구 감사 커버리지",
    eval_gate: "평가 게이트",
    api_success_rate: "API 성공률"
  };
  return labels[id] ?? fallback;
}

function formatSloDescription(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    answer_grounding: "평균 답변/문서 일치율이 목표치 이상이어야 합니다.",
    review_load: "사람 검토 비율이 운영자가 처리 가능한 기준 안에 있어야 합니다.",
    tool_audit_coverage: "질문은 저장된 search_documents 도구 호출로 추적돼야 합니다.",
    eval_gate: "최신 seed 평가가 설정된 품질 게이트를 통과해야 합니다.",
    api_success_rate: "최근 24시간 HTTP 요청에서 5xx 응답이 목표치 이하로 유지돼야 합니다."
  };
  return labels[id] ?? fallback;
}

function formatProofLabel(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    source_access_rechecked: "출처 접근 재검사",
    sources_attached: "출처 연결",
    document_agreement: "문서 일치율",
    grounding_coverage: "근거 커버리지",
    search_tool_audited: "검색 도구 감사",
    approval_boundary: "승인 경계",
    context_budget: "컨텍스트 예산",
    feedback_captured: "피드백 저장"
  };
  return labels[id] ?? fallback;
}

function formatReplayCheckLabel(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    top_source_stable: "1순위 출처 안정성",
    source_overlap: "출처 겹침",
    current_document_agreement: "현재 문서 일치율",
    permission_boundary_replayed: "권한 경계 재실행"
  };
  return labels[id] ?? fallback;
}

function formatReplayCheckEvidence(id: string, fallback: string): string {
  if (id === "top_source_stable") {
    const changed = fallback.match(/Top source changed from (.*) to (.*)\./);
    if (changed) {
      return `1순위 출처가 ${changed[1]}에서 ${changed[2]}로 바뀌었습니다.`;
    }
    const stable = fallback.match(/Top source remains (.*)\./);
    return stable ? `1순위 출처가 ${stable[1]}로 유지됩니다.` : fallback;
  }
  if (id === "source_overlap") {
    const match = fallback.match(/overlaps (\d+)%/);
    return match ? `현재 검색 결과가 원래 출처와 ${match[1]}% 겹칩니다.` : fallback;
  }
  if (id === "current_document_agreement") {
    const match = fallback.match(/agreement is (\d+)%/);
    return match ? `원래 답변과 현재 출처 문서의 일치율은 ${match[1]}%입니다.` : fallback;
  }
  if (id === "permission_boundary_replayed") {
    const match = fallback.match(/denied (\d+) inaccessible candidates/);
    return match ? `권한 필터를 다시 적용했고 접근 불가 후보 ${match[1]}개를 차단했습니다.` : fallback;
  }
  return fallback;
}

function formatProofEvidence(id: string, fallback: string): string {
  if (id === "source_access_rechecked") {
    const match = fallback.match(/rechecked (\d+) returned sources/);
    return match ? `반환된 출처 ${match[1]}개의 접근 권한을 호출자 기준으로 다시 확인했습니다.` : fallback;
  }
  if (id === "sources_attached") {
    const match = fallback.match(/(\d+) sources persisted/);
    return match ? `답변에 출처 ${match[1]}개가 저장돼 있습니다.` : "저장된 출처가 없습니다.";
  }
  if (id === "document_agreement") {
    const match = fallback.match(/is ([^.]+)/);
    return match ? `답변/출처 토큰 일치율은 ${match[1]}입니다.` : fallback;
  }
  if (id === "grounding_coverage") {
    const match = fallback.match(/(\d+)\/(\d+) answer tokens/);
    return match ? `답변 토큰 ${match[1]}/${match[2]}개가 검색 출처와 겹칩니다.` : fallback;
  }
  if (id === "search_tool_audited") {
    return fallback.includes("was persisted")
      ? fallback.replace("search_documents was persisted with status", "search_documents가 저장된 상태:")
      : "저장된 search_documents 도구 호출을 찾지 못했습니다.";
  }
  if (id === "approval_boundary") {
    if (fallback.includes("Sensitive answer created")) {
      const match = fallback.match(/created (\d+) approval request/);
      return `민감 답변이 승인 요청 ${match?.[1] ?? "1"}개를 만들고 request_human_approval 경계를 유지했습니다.`;
    }
    return fallback.includes("No sensitive") ? "이 답변에는 민감 작업 승인 위임이 필요하지 않습니다." : "민감 답변의 승인 위임 증거가 부족합니다.";
  }
  if (id === "context_budget") {
    const match = fallback.match(/(\d+)\/(\d+) estimated context tokens/);
    return match ? `예상 컨텍스트 토큰 ${match[1]}/${match[2]}개를 사용했습니다.` : fallback;
  }
  if (id === "feedback_captured") {
    const match = fallback.match(/(\d+) feedback records/);
    return match ? `답변에 피드백 ${match[1]}건이 연결돼 있습니다.` : "아직 연결된 리뷰어 피드백이 없습니다.";
  }
  return fallback;
}

function formatReviewReasonCode(code: AskResponse["reviewReasons"][number]["code"]): string {
  const labels: Record<AskResponse["reviewReasons"][number]["code"], string> = {
    no_sources: "근거 없음",
    low_confidence: "낮은 신뢰도",
    sensitive_action: "민감 작업"
  };
  return labels[code];
}

function getRedactionCount(document: DocumentInventoryItem): number {
  return typeof document.metadata.security?.redactionCount === "number" ? document.metadata.security.redactionCount : 0;
}

function hasPromptInjectionRisk(document: DocumentInventoryItem): boolean {
  return document.metadata.security?.promptInjectionRisk === true;
}

function formatPromptInjectionRisk(document: DocumentInventoryItem): string {
  if (!hasPromptInjectionRisk(document)) {
    return "정상";
  }
  const count = document.metadata.security?.promptInjectionPatternCount ?? document.metadata.security?.promptInjectionPatterns?.length ?? 0;
  return `격리 ${count}개`;
}
