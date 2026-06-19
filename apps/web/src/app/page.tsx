"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import {
  Approval,
  ApiRequestObservabilityReport,
  AuditLedgerReport,
  AnswerClaimSupport,
  AnswerEvidenceBundle,
  AnswerLineageGraph,
  AnswerProof,
  AnswerQualityGate,
  AnswerReplay,
  analyzeRetrievalRobustness,
  AnswerTrace,
  askOpsPilot,
  AskResponse,
  createIncidentPlan,
  createFeedback,
  deleteDocument,
  DeleteDocumentResponse,
  DocumentImpactReport,
  DocumentIndexExplainReport,
  DocumentInventoryItem,
  DocumentIndexQualityReport,
  DocumentIndexSnapshotReport,
  DocumentSourceType,
  DocumentRevalidationQueueReport,
  DocumentRevalidationRunHistoryReport,
  DocumentRevalidationRunReport,
  DocumentVersionHistory,
  ErrorBudgetReport,
  enqueueMarkdownIndexingJob,
  EvaluationCaseReport,
  EvaluationCoverageReport,
  EvaluationHistory,
  EvaluationReport,
  EvaluationRegressionReport,
  getApiRequestObservability,
  getAuditLedger,
  getAnswerLineage,
  getAnswerClaimSupport,
  getAnswerProof,
  getAnswerEvidenceBundle,
  getAnswerQualityGate,
  getAnswerReplay,
  getAnswerTrace,
  getDocumentImpact,
  getDocumentIndexExplain,
  getDocumentIndexSnapshot,
  getDocumentRevalidationQueue,
  getDocumentRevalidationRuns,
  getDocumentVersionHistory,
  getDocumentIndexQuality,
  getErrorBudget,
  getEvaluationCases,
  getEvaluationCoverage,
  getEvaluationHistory,
  getEvaluationRegression,
  getIndexingQueueHealth,
  getLatestEvaluation,
  getObservabilityReleaseGate,
  getObservabilitySlo,
  getObservabilitySummary,
  getOperationalActionPlan,
  getPortfolioReadiness,
  getPermissionBoundaryMatrix,
  getQuestionAuditBundle,
  GithubSyncResponse,
  ingestDocumentSource,
  IngestResponse,
  IndexingJobStatus,
  IndexingQueueHealth,
  IncidentResponsePlan,
  AgentToolDefinition,
  analyzeRetrievalPermissionDiff,
  listDocuments,
  listAgentTools,
  listRecentToolCalls,
  listApprovals,
  ObservabilityReleaseGate,
  ObservabilitySloReport,
  ObservabilitySummary,
  OperationalActionPlan,
  PermissionBoundaryMatrix,
  PortfolioReadinessReport,
  QuestionAuditBundle,
  profileRetrieval,
  previewRetrieval,
  resetDocuments,
  ResetDocumentsResponse,
  RetrievalProfileReport,
  RetrievalPreviewResponse,
  RetrievalPermissionDiffReport,
  RetrievalRobustnessReport,
  runDocumentRevalidation,
  simulateSlackMention,
  SlackSimulationTrace,
  SourceIngestResponse,
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

type ConsoleScreen = "ask" | "retrieval" | "incident" | "documents" | "quality" | "review" | "audit" | "help";
type Locale = "ko" | "en";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
const apiStatusLabel = apiBaseUrl.replace(/^https?:\/\//, "");

const screenCopy: Record<Locale, Record<ConsoleScreen, { label: string; title: string; description: string }>> = {
  ko: {
    ask: {
      label: "검색",
      title: "OpsPilot 검색",
      description: "문서, URL, 파일에서 색인된 지식만 근거로 답합니다. 근거가 부족하면 답을 만들지 않습니다."
    },
    retrieval: {
      label: "검색 분석",
      title: "검색 분석",
      description: "질문이 어떤 청크를 찾았는지, 권한 때문에 어떤 문서가 제외됐는지 확인합니다."
    },
    incident: {
      label: "대응",
      title: "장애 대응 플랜",
      description: "운영 문서와 런북을 근거로 단계별 조치와 승인 경계를 생성합니다."
    },
    documents: {
      label: "문서",
      title: "지식 베이스 관리",
      description: "URL, Markdown, txt, PDF, Word 문서를 넣고 색인 상태와 질문 결과를 바로 확인합니다."
    },
    quality: {
      label: "상태",
      title: "제품 상태",
      description: "답변 품질, 문서 일치율, 검색 커버리지, 운영 상태를 확인합니다."
    },
    review: {
      label: "승인",
      title: "사람 승인과 피드백",
      description: "민감 작업 승인, 답변 피드백, 도구 호출 상태를 확인합니다."
    },
    audit: {
      label: "기록",
      title: "실행 기록과 도구",
      description: "질문, 도구 호출, 승인, 재검증 실행 이력을 추적합니다."
    },
    help: {
      label: "사용법",
      title: "OpsPilot 사용법",
      description: "로컬 실행부터 문서 색인, RAG 검색, 답변 검증까지 따라 합니다."
    }
  },
  en: {
    ask: {
      label: "Search",
      title: "OpsPilot Search",
      description: "Answers come only from indexed documents, URLs, and files. If evidence is weak, OpsPilot does not invent an answer."
    },
    retrieval: {
      label: "Analysis",
      title: "Search Analysis",
      description: "Inspect retrieved chunks, ranking signals, and permission boundaries before answering."
    },
    incident: {
      label: "Incident",
      title: "Incident Response Plan",
      description: "Generate response steps and approval boundaries from runbooks and operating docs."
    },
    documents: {
      label: "Docs",
      title: "Knowledge Base Manager",
      description: "Add URL, Markdown, txt, PDF, and Word documents, index them, then test with a question."
    },
    quality: {
      label: "Status",
      title: "Product Status",
      description: "Review answer quality, document agreement, coverage, and operating health."
    },
    review: {
      label: "Review",
      title: "Human Review and Feedback",
      description: "Handle sensitive approvals, answer feedback, and tool-call status."
    },
    audit: {
      label: "Records",
      title: "Execution Records and Tools",
      description: "Trace questions, tool calls, approvals, and revalidation runs."
    },
    help: {
      label: "Guide",
      title: "How To Use OpsPilot",
      description: "Follow local setup, document indexing, RAG search, and answer validation."
    }
  }
};

type IndexProof = {
  path: string;
  query: string;
  chunkCount: number;
  topSourcePath: string | null;
  topScore: number | null;
  sourceHit: boolean;
  documentAgreement: number;
  confidence: number;
  verdict: "pass" | "review";
  verdictReason: string;
  answerPreview: string;
  answerId: string;
  verifiedAt: string;
};

type RetrievalVerification = {
  question: string;
  answerId: string;
  generatedAt: string;
  topCandidatePath: string | null;
  topAnswerSourcePath: string | null;
  topSourceMatches: boolean;
  sourceOverlapRatio: number;
  previewCandidateCount: number;
  answerSourceCount: number;
  confidence: number;
  documentAgreement: number;
  needsHumanReview: boolean;
  reviewReasons: string[];
  toolCalls: string[];
};

const screenOrder: ConsoleScreen[] = ["ask", "retrieval", "incident", "documents", "quality", "review", "audit", "help"];

export default function Home() {
  const [activeScreen, setActiveScreen] = useState<ConsoleScreen>("ask");
  const [locale, setLocale] = useState<Locale>("ko");
  const [question, setQuestion] = useState("");
  const [teamSlugs, setTeamSlugs] = useState("payments");
  const [roles, setRoles] = useState("ops_admin");
  const [path, setPath] = useState("public/status-page-policy.md");
  const [markdown, setMarkdown] = useState(sampleMarkdown);
  const [sourceType, setSourceType] = useState<DocumentSourceType>("text");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("내 테스트 문서");
  const [sourcePath, setSourcePath] = useState("public/uploads/my-test-doc.md");
  const [sourceText, setSourceText] = useState(
    "MYDOC-42 테스트 문서는 사용자가 새 문서를 넣고 바로 질문했을 때 OpsPilot이 해당 문서를 근거로 답해야 함을 검증합니다."
  );
  const [sourceFileName, setSourceFileName] = useState("");
  const [sourceFileBase64, setSourceFileBase64] = useState("");
  const [sourceFileText, setSourceFileText] = useState("");
  const [sourceVisibility, setSourceVisibility] = useState<"public" | "team" | "restricted">("public");
  const [sourceTeamSlug, setSourceTeamSlug] = useState("payments");
  const [sourceQuestion, setSourceQuestion] = useState("MYDOC-42 테스트 문서는 무엇을 검증해?");
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
  const [claimSupport, setClaimSupport] = useState<AnswerClaimSupport | null>(null);
  const [lineageGraph, setLineageGraph] = useState<AnswerLineageGraph | null>(null);
  const [qualityGate, setQualityGate] = useState<AnswerQualityGate | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationReport | null>(null);
  const [evaluationHistory, setEvaluationHistory] = useState<EvaluationHistory | null>(null);
  const [evaluationCases, setEvaluationCases] = useState<EvaluationCaseReport | null>(null);
  const [evaluationRegression, setEvaluationRegression] = useState<EvaluationRegressionReport | null>(null);
  const [evaluationCoverage, setEvaluationCoverage] = useState<EvaluationCoverageReport | null>(null);
  const [observability, setObservability] = useState<ObservabilitySummary | null>(null);
  const [apiRequests, setApiRequests] = useState<ApiRequestObservabilityReport | null>(null);
  const [errorBudget, setErrorBudget] = useState<ErrorBudgetReport | null>(null);
  const [sloReport, setSloReport] = useState<ObservabilitySloReport | null>(null);
  const [releaseGate, setReleaseGate] = useState<ObservabilityReleaseGate | null>(null);
  const [actionPlan, setActionPlan] = useState<OperationalActionPlan | null>(null);
  const [portfolioReadiness, setPortfolioReadiness] = useState<PortfolioReadinessReport | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallAuditItem[]>([]);
  const [auditLedger, setAuditLedger] = useState<AuditLedgerReport | null>(null);
  const [agentTools, setAgentTools] = useState<AgentToolDefinition[]>([]);
  const [slackTrace, setSlackTrace] = useState<SlackSimulationTrace | null>(null);
  const [retrievalPreview, setRetrievalPreview] = useState<RetrievalPreviewResponse | null>(null);
  const [retrievalProfile, setRetrievalProfile] = useState<RetrievalProfileReport | null>(null);
  const [retrievalVerification, setRetrievalVerification] = useState<RetrievalVerification | null>(null);
  const [retrievalRobustness, setRetrievalRobustness] = useState<RetrievalRobustnessReport | null>(null);
  const [retrievalPermissionDiff, setRetrievalPermissionDiff] = useState<RetrievalPermissionDiffReport | null>(null);
  const [retrievalLimit, setRetrievalLimit] = useState(5);
  const [incidentDescription, setIncidentDescription] = useState(
    "정산 배치가 30분 이상 지연되고 settlement.dlq.count가 120이면 어떻게 대응해야 해?"
  );
  const [incidentPlan, setIncidentPlan] = useState<IncidentResponsePlan | null>(null);
  const [questionAuditBundle, setQuestionAuditBundle] = useState<QuestionAuditBundle | null>(null);
  const [ingest, setIngest] = useState<IngestResponse | null>(null);
  const [sourceIngest, setSourceIngest] = useState<SourceIngestResponse | null>(null);
  const [resetResult, setResetResult] = useState<ResetDocumentsResponse | null>(null);
  const [deleteResult, setDeleteResult] = useState<DeleteDocumentResponse | null>(null);
  const [githubSync, setGithubSync] = useState<GithubSyncResponse | null>(null);
  const [indexProof, setIndexProof] = useState<IndexProof | null>(null);
  const [indexQuality, setIndexQuality] = useState<DocumentIndexQualityReport | null>(null);
  const [indexSnapshot, setIndexSnapshot] = useState<DocumentIndexSnapshotReport | null>(null);
  const [queueHealth, setQueueHealth] = useState<IndexingQueueHealth | null>(null);
  const [queuedIndexingJob, setQueuedIndexingJob] = useState<IndexingJobStatus | null>(null);
  const [documents, setDocuments] = useState<DocumentInventoryItem[]>([]);
  const [documentVersionHistory, setDocumentVersionHistory] = useState<DocumentVersionHistory | null>(null);
  const [documentIndexExplain, setDocumentIndexExplain] = useState<DocumentIndexExplainReport | null>(null);
  const [documentImpact, setDocumentImpact] = useState<DocumentImpactReport | null>(null);
  const [documentRevalidationQueue, setDocumentRevalidationQueue] = useState<DocumentRevalidationQueueReport | null>(null);
  const [documentRevalidationRun, setDocumentRevalidationRun] = useState<DocumentRevalidationRunReport | null>(null);
  const [documentRevalidationRuns, setDocumentRevalidationRuns] = useState<DocumentRevalidationRunHistoryReport | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionBoundaryMatrix | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<
    | "ask"
    | "retrieval"
    | "retrieval-profile"
    | "retrieval-verification"
    | "retrieval-robustness"
    | "retrieval-permission-diff"
    | "incident"
    | "ingest"
    | "source-ingest"
    | "delete-document"
    | "reset-documents"
    | "seed-documents"
    | "verify"
    | "quality-report"
    | "github"
    | "documents"
    | "queue"
    | "versions"
    | "index-explain"
    | "index-snapshot"
    | "impact"
    | "revalidation"
    | "revalidation-history"
    | "revalidation-run"
    | "matrix"
    | "approval"
    | "audit"
    | "evaluation"
    | "observability"
    | "feedback"
    | "trace"
    | "question-audit"
    | "tools"
    | "ledger"
    | "slack"
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const confidencePercent = useMemo(() => Math.round((answer?.confidence ?? 0) * 100), [answer]);
  const documentAgreementPercent = useMemo(() => Math.round((answer?.documentAgreement.score ?? 0) * 100), [answer]);
  const visibleApprovals = useMemo(() => approvals.slice(0, 3), [approvals]);
  const localizedScreens = useMemo(
    () => screenOrder.map((id) => ({ id, ...screenCopy[locale][id] })),
    [locale]
  );
  const currentScreen = localizedScreens.find((screen) => screen.id === activeScreen) ?? localizedScreens[0];
  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) ?? documents[0] ?? null,
    [documents, selectedDocumentId]
  );
  const visibleRevalidationItems = useMemo(() => {
    const items = documentRevalidationQueue?.items ?? [];
    if (!selectedDocument) {
      return items.slice(0, 5);
    }
    return [...items]
      .sort((left, right) => {
        const leftSelected = left.document.id === selectedDocument.id ? 0 : 1;
        const rightSelected = right.document.id === selectedDocument.id ? 0 : 1;
        return leftSelected - rightSelected;
      })
      .slice(0, 5);
  }, [documentRevalidationQueue, selectedDocument]);
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
    const nextQuestion = question.trim();
    if (!nextQuestion) {
      setError("질문을 입력해 주세요.");
      return;
    }
    setError(null);
    setFeedbackStatus(null);
    setLoading("ask");
    try {
      setTrace(null);
      setProof(null);
      setReplay(null);
      setEvidenceBundle(null);
      setClaimSupport(null);
      setLineageGraph(null);
      setQualityGate(null);
      const nextAnswer = await askOpsPilot({ question: nextQuestion, teamSlugs, roles });
      const [nextTrace, nextProof, nextReplay, nextEvidenceBundle, nextClaimSupport, nextLineageGraph, nextQualityGate] =
        await fetchAnswerEvidence(nextAnswer.answerId);
      setAnswer(nextAnswer);
      setTrace(nextTrace);
      setProof(nextProof);
      setReplay(nextReplay);
      setEvidenceBundle(nextEvidenceBundle);
      setClaimSupport(nextClaimSupport);
      setLineageGraph(nextLineageGraph);
      setQualityGate(nextQualityGate);
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
    setRetrievalVerification(null);
    setLoading("retrieval");
    try {
      setRetrievalPreview(await previewRetrieval({ question, teamSlugs, roles, limit: retrievalLimit }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "검색 미리보기 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function runRetrievalProfile() {
    setError(null);
    setLoading("retrieval-profile");
    try {
      const report = await profileRetrieval({ question, teamSlugs, roles, limit: retrievalLimit });
      setRetrievalProfile(report);
      setRetrievalPreview(report.preview);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "검색 프로파일 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function verifyRetrievalAgainstAnswer() {
    setError(null);
    setLoading("retrieval-verification");
    try {
      const preview = retrievalPreview ?? (await previewRetrieval({ question, teamSlugs, roles, limit: retrievalLimit }));
      const generatedAnswer = await askOpsPilot({ question, teamSlugs, roles });
      const previewPaths = preview.candidates.map((candidate) => candidate.path);
      const answerPaths = generatedAnswer.sources.map((source) => source.path);
      setRetrievalPreview(preview);
      setRetrievalVerification({
        question,
        answerId: generatedAnswer.answerId,
        generatedAt: new Date().toISOString(),
        topCandidatePath: previewPaths[0] ?? null,
        topAnswerSourcePath: answerPaths[0] ?? null,
        topSourceMatches: previewPaths.length > 0 && answerPaths.length > 0 && previewPaths[0] === answerPaths[0],
        sourceOverlapRatio: calculateSourceOverlap(previewPaths, answerPaths),
        previewCandidateCount: previewPaths.length,
        answerSourceCount: answerPaths.length,
        confidence: generatedAnswer.confidence,
        documentAgreement: generatedAnswer.documentAgreement.score,
        needsHumanReview: generatedAnswer.needsHumanReview,
        reviewReasons: generatedAnswer.reviewReasons.map((reason) => formatReviewReasonCode(reason.code)),
        toolCalls: generatedAnswer.toolCalls.map((tool) => `${tool.toolName}:${tool.status}`)
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "미리보기-답변 검증에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function runRetrievalRobustness() {
    setError(null);
    setLoading("retrieval-robustness");
    try {
      setRetrievalRobustness(
        await analyzeRetrievalRobustness({
          question,
          teamSlugs,
          roles,
          limit: retrievalLimit,
          variants: [
            question.replace(/무엇이야|뭐야|알려줘/gu, "").trim(),
            `${question.replace(/[?？!！.。]+$/u, "").trim()} 기준`,
            `${question.replace(/[?？!！.。]+$/u, "").trim()} 절차`
          ].filter((variant) => variant.length >= 2 && variant !== question.trim())
        })
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "검색 강건성 진단 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function runRetrievalPermissionDiff() {
    setError(null);
    setLoading("retrieval-permission-diff");
    try {
      setRetrievalPermissionDiff(
        await analyzeRetrievalPermissionDiff({
          question,
          teamSlugs,
          roles,
          limit: retrievalLimit
        })
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "권한별 검색 비교 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function submitIncidentPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setQuestionAuditBundle(null);
    setLoading("incident");
    try {
      const plan = await createIncidentPlan({ incident: incidentDescription, teamSlugs, roles, limit: 5 });
      setIncidentPlan(plan);
      try {
        setQuestionAuditBundle(
          await getQuestionAuditBundle({ questionId: plan.audit.persistedQuestionId, teamSlugs, roles })
        );
      } catch (auditError) {
        setError(auditError instanceof Error ? `플랜은 생성됐지만 감사 번들 조회에 실패했습니다: ${auditError.message}` : "플랜은 생성됐지만 감사 번들 조회에 실패했습니다.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "장애 대응 플랜 생성에 실패했습니다.");
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
      const [nextTrace, nextProof, nextReplay, nextEvidenceBundle, nextClaimSupport, nextLineageGraph, nextQualityGate] =
        await fetchAnswerEvidence(answer.answerId);
      setTrace(nextTrace);
      setProof(nextProof);
      setReplay(nextReplay);
      setEvidenceBundle(nextEvidenceBundle);
      setClaimSupport(nextClaimSupport);
      setLineageGraph(nextLineageGraph);
      setQualityGate(nextQualityGate);
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
      setIndexSnapshot(await getDocumentIndexSnapshot());
      const indexedDocument = nextDocuments.find((document) => document.path === nextIngest.path) ?? nextDocuments[0] ?? null;
      setSelectedDocumentId(indexedDocument?.id ?? null);
      if (indexedDocument) {
        await Promise.all([loadDocumentVersions(indexedDocument.id), loadDocumentIndexExplain(indexedDocument.id)]);
      }
      await verifyIndexedDocument(nextIngest, verificationQuery);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "색인 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function submitDocumentSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading("source-ingest");
    try {
      const payload = buildSourcePayload();
      const result = await ingestDocumentSource(payload);
      setSourceIngest(result);
      setIngest(result);
      setQuestion(sourceQuestion);
      const nextDocuments = await listDocuments();
      setDocuments(nextDocuments);
      setIndexQuality(await getDocumentIndexQuality());
      setIndexSnapshot(await getDocumentIndexSnapshot());
      const indexedDocument = nextDocuments.find((document) => document.path === result.path) ?? nextDocuments[0] ?? null;
      setSelectedDocumentId(indexedDocument?.id ?? null);
      if (indexedDocument) {
        await Promise.all([loadDocumentVersions(indexedDocument.id), loadDocumentIndexExplain(indexedDocument.id)]);
      }
      await verifyIndexedDocument(result, sourceQuestion);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "문서 소스 등록에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  function buildSourcePayload() {
    const base = {
      sourceType,
      path: sourcePath || undefined,
      title: sourceTitle || undefined,
      visibility: sourceVisibility,
      teamSlug: sourceVisibility === "team" ? sourceTeamSlug || undefined : undefined,
      fileName: sourceFileName || undefined
    };

    if (sourceType === "url") {
      return { ...base, url: sourceUrl };
    }
    if (sourceType === "pdf" || sourceType === "docx") {
      return { ...base, base64: sourceFileBase64 };
    }
    if (sourceType === "markdown") {
      return { ...base, content: sourceFileText || markdown };
    }
    return { ...base, content: sourceFileText || sourceText };
  }

  async function handleSourceFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setSourceFileName(file.name);
    const nextType = inferSourceType(file.name);
    setSourceType(nextType);
    setSourcePath(`public/uploads/${safeUploadStem(file.name)}.md`);
    setSourceTitle(file.name.replace(/\.[a-z0-9]+$/i, ""));

    if (nextType === "markdown" || nextType === "text") {
      const text = await file.text();
      setSourceFileText(text);
      setSourceFileBase64("");
    } else {
      setSourceFileText("");
      setSourceFileBase64(await fileToBase64(file));
    }
  }

  async function clearDocuments(reloadSeed: boolean) {
    const confirmed = reloadSeed || window.confirm("현재 문서, 청크, 문서 버전을 초기화합니다. 계속할까요?");
    if (!confirmed) {
      return;
    }
    setError(null);
    setLoading(reloadSeed ? "seed-documents" : "reset-documents");
    try {
      const result = await resetDocuments({ reloadSeed });
      setResetResult(result);
      setDeleteResult(null);
      setIngest(null);
      setSourceIngest(null);
      setIndexProof(null);
      setDocumentVersionHistory(null);
      setDocumentIndexExplain(null);
      setDocumentImpact(null);
      setDocumentRevalidationQueue(null);
      setDocumentRevalidationRun(null);
      setDocumentRevalidationRuns(null);
      const nextDocuments = await listDocuments();
      setDocuments(nextDocuments);
      setIndexQuality(await getDocumentIndexQuality());
      setIndexSnapshot(await getDocumentIndexSnapshot());
      setSelectedDocumentId(nextDocuments[0]?.id ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "문서 초기화에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function removeSelectedDocument() {
    if (!selectedDocument) {
      return;
    }
    const confirmed = window.confirm(`문서 "${selectedDocument.title}"를 삭제합니다. 청크, 버전, 답변 출처 연결도 함께 제거됩니다. 계속할까요?`);
    if (!confirmed) {
      return;
    }
    setError(null);
    setLoading("delete-document");
    try {
      const result = await deleteDocument(selectedDocument.id);
      setDeleteResult(result);
      setResetResult(null);
      setDocumentVersionHistory(null);
      setDocumentIndexExplain(null);
      setDocumentImpact(null);
      setDocumentRevalidationQueue(null);
      setDocumentRevalidationRun(null);
      setDocumentRevalidationRuns(null);
      const nextDocuments = await listDocuments();
      setDocuments(nextDocuments);
      setSelectedDocumentId(nextDocuments[0]?.id ?? null);
      setIndexQuality(await getDocumentIndexQuality());
      setIndexSnapshot(await getDocumentIndexSnapshot());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "문서 삭제에 실패했습니다.");
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
      const sourceHit = topSource?.path === targetIngest.path || topCandidate?.path === targetIngest.path;
      const documentAgreement = verificationAnswer.documentAgreement.score;
      const confidence = verificationAnswer.confidence;
      const verdict = sourceHit && documentAgreement >= 0.6 && confidence >= 0.3 ? "pass" : "review";
      setRetrievalPreview(preview);
      setIndexProof({
        path: targetIngest.path,
        query,
        chunkCount: targetIngest.chunks,
        topSourcePath: topSource?.path ?? topCandidate?.path ?? null,
        topScore: topSource?.score ?? topCandidate?.score ?? null,
        sourceHit,
        documentAgreement,
        confidence,
        verdict,
        verdictReason:
          verdict === "pass"
            ? "신규 문서가 검색 후보 또는 답변 출처에 포함됐고, 답변 일치율과 신뢰도가 기준을 넘었습니다."
            : "신규 문서 출처 적중, 답변 일치율, 신뢰도 중 하나 이상이 검토 기준에 걸렸습니다.",
        answerPreview: verificationAnswer.answer.slice(0, 360),
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
      setIndexSnapshot(await getDocumentIndexSnapshot());
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
      setIndexSnapshot(await getDocumentIndexSnapshot());
      setDocumentRevalidationQueue(await getDocumentRevalidationQueue());
      setDocumentRevalidationRuns(await getDocumentRevalidationRuns());
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

  async function loadIndexSnapshot() {
    setError(null);
    setLoading("index-snapshot");
    try {
      setIndexSnapshot(await getDocumentIndexSnapshot());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "색인 스냅샷 요청에 실패했습니다.");
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

  async function loadDocumentIndexExplain(documentId = selectedDocument?.id) {
    if (!documentId) {
      return;
    }

    setError(null);
    setLoading((current) => current ?? "index-explain");
    try {
      setDocumentIndexExplain(await getDocumentIndexExplain(documentId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "문서 색인 설명 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadDocumentImpact(documentId = selectedDocument?.id) {
    if (!documentId) {
      return;
    }
    setError(null);
    setLoading((current) => current ?? "impact");
    try {
      setDocumentImpact(await getDocumentImpact(documentId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "문서 영향 분석 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadDocumentRevalidationQueue() {
    setError(null);
    setLoading("revalidation");
    try {
      setDocumentRevalidationQueue(await getDocumentRevalidationQueue());
      setDocumentRevalidationRuns(await getDocumentRevalidationRuns());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "문서 재검증 큐 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadDocumentRevalidationRuns() {
    setError(null);
    setLoading("revalidation-history");
    try {
      setDocumentRevalidationRuns(await getDocumentRevalidationRuns());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "문서 재검증 실행 이력 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function executeDocumentRevalidation(item: DocumentRevalidationQueueReport["items"][number]) {
    setError(null);
    setLoading("revalidation-run");
    try {
      const run = await runDocumentRevalidation({
        documentId: item.document.id,
        answerId: item.answer.id,
        teamSlugs,
        roles
      });
      setDocumentRevalidationRun(run);
      setDocumentRevalidationRuns(await getDocumentRevalidationRuns());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "문서 재검증 실행에 실패했습니다.");
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
      const [latest, history, cases, regression, coverage] = await Promise.all([
        getLatestEvaluation(),
        getEvaluationHistory(),
        getEvaluationCases(),
        getEvaluationRegression(),
        getEvaluationCoverage()
      ]);
      setEvaluation(latest);
      setEvaluationHistory(history);
      setEvaluationCases(cases);
      setEvaluationRegression(regression);
      setEvaluationCoverage(coverage);
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

  async function loadAuditLedger() {
    setError(null);
    setLoading("ledger");
    try {
      setAuditLedger(await getAuditLedger(40));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "감사 원장 요청에 실패했습니다.");
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
      const [summary, apiRequestReport, budget, slo, gate, plan, readiness] = await Promise.all([
        getObservabilitySummary(),
        getApiRequestObservability(),
        getErrorBudget(),
        getObservabilitySlo(),
        getObservabilityReleaseGate(),
        getOperationalActionPlan(),
        getPortfolioReadiness()
      ]);
      setObservability(summary);
      setApiRequests(apiRequestReport);
      setErrorBudget(budget);
      setSloReport(slo);
      setReleaseGate(gate);
      setActionPlan(plan);
      setPortfolioReadiness(readiness);
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
      const [nextTrace, nextProof, nextReplay, nextEvidenceBundle, nextClaimSupport, nextLineageGraph, nextQualityGate] =
        await fetchAnswerEvidence(answerId);
      setTrace(nextTrace);
      setProof(nextProof);
      setReplay(nextReplay);
      setEvidenceBundle(nextEvidenceBundle);
      setClaimSupport(nextClaimSupport);
      setLineageGraph(nextLineageGraph);
      setQualityGate(nextQualityGate);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "답변 추적 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function loadQuestionAuditBundle(questionId = incidentPlan?.audit.persistedQuestionId) {
    if (!questionId) {
      return;
    }

    setError(null);
    setLoading("question-audit");
    try {
      setQuestionAuditBundle(await getQuestionAuditBundle({ questionId, teamSlugs, roles }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "질문 감사 번들 요청에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  }

  async function fetchAnswerEvidence(
    answerId: string
  ): Promise<[AnswerTrace, AnswerProof, AnswerReplay, AnswerEvidenceBundle, AnswerClaimSupport, AnswerLineageGraph, AnswerQualityGate]> {
    return Promise.all([
      getAnswerTrace({ answerId, teamSlugs, roles }),
      getAnswerProof({ answerId, teamSlugs, roles }),
      getAnswerReplay({ answerId, teamSlugs, roles }),
      getAnswerEvidenceBundle({ answerId, teamSlugs, roles }),
      getAnswerClaimSupport({ answerId, teamSlugs, roles }),
      getAnswerLineage({ answerId, teamSlugs, roles }),
      getAnswerQualityGate({ answerId, teamSlugs, roles })
    ]);
  }

  return (
    <main className="appShell">
      <aside className="appRail" aria-label="OpsPilot 작업 영역 내비게이션">
        <div className="railBrand">
          <span className="brandMark">OP</span>
          <div>
	            <strong>OpsPilot</strong>
	            <p>운영 지식 검색</p>
          </div>
        </div>
	        <nav className="railNav" aria-label="콘솔 화면">
          {localizedScreens.map((screen) => (
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
	          <span>{locale === "ko" ? "답변 원칙" : "Answer Policy"}</span>
	          <strong>{locale === "ko" ? "근거가 있어야 답변" : "Evidence first"}</strong>
	          <p>
              {locale === "ko"
                ? "권한 없는 문서는 검색 단계에서 제외하고, 근거가 약하면 담당자 확인으로 넘깁니다."
                : "Unauthorized documents are removed during retrieval. Weak evidence is routed to human review."}
            </p>
	        </div>
      </aside>

      <section className="shell">
      <header className="topbar">
        <div>
	          <p className="eyebrow">OpsPilot</p>
          <h1>{currentScreen.title}</h1>
          <p className="headerLead">{currentScreen.description}</p>
        </div>
	        <div className="topbarActions">
            <div className="languageToggle" aria-label="Language">
              <button className={locale === "ko" ? "active" : ""} onClick={() => setLocale("ko")} type="button">
                한국어
              </button>
              <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")} type="button">
                English
              </button>
            </div>
	          <a className="topbarLink" href="/usage">
	            {locale === "ko" ? "전체 사용법" : "Full Guide"}
	          </a>
	          <div className="statusGroup" aria-label="시스템 상태">
	            <span className="statusDot" />
	            <span>{locale === "ko" ? `API 연결: ${apiStatusLabel}` : `API: ${apiStatusLabel}`}</span>
	          </div>
	        </div>
	      </header>

	      <section className="metrics" aria-label="제품 핵심 흐름">
	        <Metric label={locale === "ko" ? "문서 입력" : "Sources"} value="URL · PDF · Word · txt" />
	        <Metric label={locale === "ko" ? "검색" : "Search"} value="pgvector + hybrid" />
	        <Metric label={locale === "ko" ? "권한" : "Access"} value={locale === "ko" ? "검색 전 필터" : "pre-retrieval filter"} />
	        <Metric label={locale === "ko" ? "근거" : "Evidence"} value={locale === "ko" ? "출처와 일치율" : "sources + agreement"} />
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
	              <p className="eyebrow">검색</p>
	              <h2>무엇이든 물어보세요</h2>
	            </div>
	            {answer ? <span className={answer.needsHumanReview ? "badge review" : "badge"}>{answer.needsHumanReview ? "검토 필요" : "자동 답변"}</span> : null}
          </div>

          <form onSubmit={submitQuestion} className="searchForm">
            <label className="srOnly" htmlFor="ask-question">
              질문
            </label>
            <input
              id="ask-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="예: 정산 배치가 30분 이상 지연되면 어떻게 해?"
            />
            <button className="primaryButton" disabled={loading === "ask" || !question.trim()} type="submit">
	              {loading === "ask" ? "검색 중..." : "검색"}
            </button>
          </form>

          {answer || loading === "ask" ? (
          <div className="answerPanel">
            <div className="answerMeta">
              <span>
	                신뢰도 {confidencePercent}% · 문서 일치율 {documentAgreementPercent}%
	              </span>
	                <span>{answer?.toolCalls.map((tool) => `${formatToolName(tool.toolName)}: ${formatRuntimeStatus(tool.status)}`).join(", ") ?? "아직 도구 호출 없음"}</span>
	              <span>
	                {answer?.idempotency
	                  ? `멱등성 ${answer.idempotency.replayed ? "재사용" : "신규"} · ${shortHash(answer.idempotency.requestHash)}`
	                  : "멱등성 키 대기"}
	              </span>
            </div>
	            <pre>{loading === "ask" ? "검색 중입니다..." : answer?.answer}</pre>
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
	                    <span>실행 기록</span>
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
	                    {loading === "trace" ? "새로고침 중..." : "실행 기록 새로고침"}
                  </button>
                </div>
                {qualityGate ? (
                  <div className={`qualityGatePanel qualityGatePanel--${qualityGate.status}`} aria-label="답변 신뢰 게이트">
                    <div className="qualityGateHeader">
                      <div>
                        <span>답변 신뢰 게이트</span>
                        <strong>{qualityGate.decision.label}</strong>
                      </div>
                      <code>
                        {formatQualityGateStatus(qualityGate.status)} · 통과율 {formatPercent(qualityGate.score)}
                      </code>
                    </div>
                    <div className="qualityGateSummary">
                      <div>
                        <span>권장 액션</span>
                        <strong>{formatQualityGateAction(qualityGate.decision.recommendedAction)}</strong>
                      </div>
                      <div>
                        <span>승인</span>
                        <strong>{formatApprovalGateStatus(qualityGate.summary.approvalStatus)}</strong>
                      </div>
                      <div>
                        <span>피드백</span>
                        <strong>
                          +{qualityGate.summary.positiveFeedbackCount} / -{qualityGate.summary.negativeFeedbackCount}
                        </strong>
                      </div>
                      <div>
                        <span>재실행</span>
                        <strong>{formatReplayStatus(qualityGate.summary.replayStatus)}</strong>
                      </div>
                    </div>
                    <div className="qualityGateChecks">
                      {qualityGate.checks.map((check) => (
                        <article className="qualityGateCheck" key={check.id}>
                          <span className={check.status === "pass" ? "badge" : "badge review"}>{formatGateStatus(check.status)}</span>
                          <div>
                            <strong>{formatQualityGateCheckLabel(check.id, check.label)}</strong>
                            <p>{formatQualityGateEvidence(check.evidence)}</p>
                          </div>
                          <code>{formatProofMetric(check)}</code>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
                {claimSupport ? (
                  <div className={`claimSupportPanel claimSupportPanel--${claimSupport.status}`} aria-label="문장별 근거 검증">
                    <div className="claimSupportHeader">
                      <div>
                        <span>문장별 근거 검증</span>
                        <strong>{formatClaimSupportStatus(claimSupport.status)}</strong>
                      </div>
                      <code>{claimSupport.integrity.algorithm}:{shortHash(claimSupport.integrity.hash)}</code>
                    </div>
                    <div className="claimSupportSummary">
                      <Metric label="문장" value={`${claimSupport.summary.claimCount}개`} />
                      <Metric label="지원" value={`${claimSupport.summary.supportedClaimCount}개`} />
                      <Metric label="부분" value={`${claimSupport.summary.partialClaimCount}개`} />
                      <Metric label="미지원" value={`${claimSupport.summary.unsupportedClaimCount}개`} />
                      <Metric label="평균 점수" value={formatPercent(claimSupport.summary.averageSupportScore)} />
                      <Metric label="출처 커버" value={`${claimSupport.summary.sourceCoverageCount}개`} />
                    </div>
                    <div className="claimSupportList">
                      {claimSupport.claims.slice(0, 5).map((claim) => (
                        <article className={`claimSupportItem claimSupportItem--${claim.status}`} key={claim.rank}>
                          <div className="claimSupportClaim">
                            <span className={claim.status === "supported" ? "badge" : "badge review"}>
                              {formatClaimStatus(claim.status)}
                            </span>
                            <div>
                              <strong>
                                #{claim.rank} {claim.text}
                              </strong>
                              <p>
                                {claim.evidence[0]
                                  ? `${claim.evidence[0].title} · ${claim.evidence[0].path}`
                                  : "연결된 근거 스니펫이 없습니다."}
                              </p>
                            </div>
                            <code>{formatPercent(claim.supportScore)}</code>
                          </div>
                          {claim.evidence[0] ? (
                            <blockquote>
                              {claim.evidence[0].snippet}
                              <small>
                                매칭 {claim.matchedTokenCount}/{claim.tokenCount} ·{" "}
                                {claim.evidence[0].matchedTokens.join(" ") || "토큰 없음"} ·{" "}
                                {formatClaimAction(claim.recommendedAction)}
                              </small>
                            </blockquote>
                          ) : (
                            <blockquote>
                              근거 보강 필요
                              <small>{formatClaimAction(claim.recommendedAction)}</small>
                            </blockquote>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
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
	                      <span>도구 {proof.evidence.toolCalls.map((tool) => `${formatToolName(tool.toolName)}:${formatRuntimeStatus(tool.status)}`).join(" ")}</span>
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
                {lineageGraph ? (
                  <div className="lineagePanel" aria-label="답변 계보 그래프">
                    <div className="proofHeader">
                      <div>
                        <span>답변 계보 그래프</span>
                        <strong>{formatLineageStatus(lineageGraph.status)}</strong>
                      </div>
                      <code>{lineageGraph.integrity.algorithm}:{shortHash(lineageGraph.integrity.hash)}</code>
                    </div>
                    <div className="lineageSummary">
                      <Metric label="노드" value={String(lineageGraph.summary.nodeCount)} />
                      <Metric label="엣지" value={String(lineageGraph.summary.edgeCount)} />
                      <Metric label="출처" value={String(lineageGraph.summary.sourceCount)} />
                      <Metric label="도구" value={String(lineageGraph.summary.toolCallCount)} />
                      <Metric label="승인" value={String(lineageGraph.summary.approvalCount)} />
                      <Metric label="제한 출처" value={String(lineageGraph.summary.restrictedSourceCount)} />
                    </div>
                    <div className="lineageGraph">
                      {lineageGraph.nodes.slice(0, 10).map((node) => (
                        <article className={`lineageNode lineageNode--${node.kind}`} key={node.id}>
                          <span>{formatLineageKind(node.kind)}</span>
                          <strong>{node.label}</strong>
                          <p>{summarizeLineageNode(node)}</p>
                          <code>{formatLineageNodeStatus(node)}</code>
                        </article>
                      ))}
                    </div>
                    <div className="lineageEdges">
                      {lineageGraph.edges.slice(0, 8).map((edge, index) => (
                        <article key={`${edge.from}-${edge.to}-${index}`}>
                          <span>{formatLineageEdgeKind(edge.kind)}</span>
                          <p>
                            {shortLineageId(edge.from)} → {shortLineageId(edge.to)}
                          </p>
                          <code>{edge.label}</code>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="traceTimeline" aria-label="답변 실행 타임라인">
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
	          ) : null}
        </section>
        ) : null}

        {activeScreen === "incident" ? (
          <section className="incidentPlanPanel" id="incident-plan">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">대응 플랜</p>
                <h2>런북 기반 장애 대응</h2>
              </div>
              {incidentPlan ? (
                <span className={incidentPlan.status === "ready" ? "badge" : "badge review"}>
                  {formatIncidentPlanStatus(incidentPlan.status)}
                </span>
              ) : null}
            </div>

            <form onSubmit={submitIncidentPlan} className="stack">
              <label>
                장애 상황
                <textarea value={incidentDescription} onChange={(event) => setIncidentDescription(event.target.value)} rows={4} />
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
              <button className="primaryButton" disabled={loading === "incident"} type="submit">
                {loading === "incident" ? "플랜 생성 중..." : "장애 대응 플랜 생성"}
              </button>
            </form>

            {incidentPlan ? (
              <div className="incidentPlanResult">
                <div className="incidentSummary">
                  <div>
                    <span>심각도</span>
                    <strong>{formatIncidentSeverity(incidentPlan.severity)}</strong>
                  </div>
                  <div>
                    <span>신뢰도</span>
                    <strong>{formatPercent(incidentPlan.confidence)}</strong>
                  </div>
                  <div>
                    <span>런북</span>
                    <strong>{incidentPlan.runbook.matched ? `${incidentPlan.runbook.itemCount}개 항목` : "미매칭"}</strong>
                  </div>
                  <div>
                    <span>승인 경계</span>
                    <strong>{incidentPlan.approvalGates.length}개</strong>
                  </div>
                </div>
                <p className="incidentLead">{incidentPlan.summary}</p>

                <div className="incidentPlanGrid">
                  {incidentPlan.phases.map((phase) => (
                    <article className="incidentPhase" key={phase.id}>
                      <div className="incidentPhaseHead">
                        <span>{formatIncidentPhase(phase.id)}</span>
                        <strong>{phase.title}</strong>
                        <p>{phase.objective}</p>
                      </div>
                      <div className="incidentStepList">
                        {phase.steps.map((step) => (
                          <div className={step.requiresApproval ? "incidentStep approval" : "incidentStep"} key={`${phase.id}-${step.order}`}>
                            <span>{step.order}</span>
                            <div>
                              <strong>{step.action}</strong>
                              <p>{step.evidence}</p>
                            </div>
                            {step.requiresApproval ? <code>승인 필요</code> : <code>자동 가능</code>}
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="incidentOpsGrid">
                  <section className="incidentOpsPanel">
                    <div className="sectionHeader compact">
                      <div>
                        <p className="eyebrow">승인</p>
                        <h2>사람 승인 경계</h2>
                      </div>
                    </div>
                    {incidentPlan.approvalGates.length > 0 ? (
                      incidentPlan.approvalGates.map((gate) => (
                        <article className="incidentGate" key={gate.action}>
                          <strong>{gate.action}</strong>
                          <p>{gate.reason}</p>
                          <code>{formatApprovalPolicy(gate.policy)}</code>
                        </article>
                      ))
                    ) : (
                      <p className="empty">읽기/검증 중심 플랜이라 별도 승인 게이트가 없습니다.</p>
                    )}
                  </section>

                  <section className="incidentOpsPanel">
                    <div className="sectionHeader compact">
                      <div>
                        <p className="eyebrow">공유</p>
                        <h2>커뮤니케이션</h2>
                      </div>
                    </div>
                    {incidentPlan.communications.map((item) => (
                      <article className="incidentComms" key={`${item.channel}-${item.trigger}`}>
                        <strong>{item.channel}</strong>
                        <p>{item.message}</p>
                        <code>{item.trigger}</code>
                      </article>
                    ))}
                  </section>

                  <section className="incidentOpsPanel">
                    <div className="sectionHeader compact">
                      <div>
                        <p className="eyebrow">복구</p>
                        <h2>검증 조건</h2>
                      </div>
                    </div>
                    {incidentPlan.verification.slice(0, 4).map((item, index) => (
                      <article className="incidentVerify" key={`${item.check}-${index}`}>
                        <strong>{item.check}</strong>
                        <p>{item.expected}</p>
                        <code>{item.sourcePath ?? "출처 없음"}</code>
                      </article>
                    ))}
                  </section>
                </div>

                <div className="incidentAudit">
                  <div>
                    <span>권한 경계</span>
                    <strong>{formatPermissionEnforcement(incidentPlan.permissionAudit.enforcement)}</strong>
                    <p>차단 후보 {incidentPlan.permissionAudit.deniedCandidateCount}개</p>
                  </div>
                  <div>
                    <span>도구 호출</span>
                    <strong>{incidentPlan.audit.toolCalls.map((tool) => formatToolName(tool.toolName)).join(" → ")}</strong>
                    <p>{incidentPlan.audit.persistedQuestionId}</p>
                  </div>
                  <div>
                    <span>출처</span>
                    <strong>{incidentPlan.sources[0]?.path ?? "없음"}</strong>
                    <p>{incidentPlan.sources.length}개 근거</p>
                  </div>
                </div>

                <section className="questionAuditBundle" aria-label="질문 감사 번들">
                  <div className="sectionHeader compact">
                    <div>
                      <p className="eyebrow">감사 번들</p>
                      <h2>질문 단위 실행 증거</h2>
                    </div>
                    <button disabled={loading === "question-audit"} onClick={() => loadQuestionAuditBundle()} type="button">
                      {loading === "question-audit" ? "검증 중..." : "감사 번들 재검증"}
                    </button>
                  </div>
                  {questionAuditBundle ? (
                    <>
                      <div className="questionAuditSummary">
                        <div>
                          <span>판정</span>
                          <strong>{formatQuestionAuditStatus(questionAuditBundle.summary.status)}</strong>
                        </div>
                        <div>
                          <span>정책</span>
                          <strong>
                            {questionAuditBundle.summary.passedPolicyCheckCount}/{questionAuditBundle.summary.policyCheckCount}
                          </strong>
                        </div>
                        <div>
                          <span>출처</span>
                          <strong>{questionAuditBundle.summary.sourceCount}개</strong>
                        </div>
                        <div>
                          <span>무결성</span>
                          <strong>{shortHash(questionAuditBundle.integrity.hash)}</strong>
                        </div>
                      </div>
                      <div className="questionAuditGrid">
                        <div className="questionAuditColumn">
                          <span>도구 정책 검사</span>
                          {questionAuditBundle.policyChecks.map((check) => (
                            <article className="questionAuditItem" key={check.toolCallId}>
                              <div>
                                <strong>{formatToolName(check.toolName)}</strong>
                                <p>
                                  기대 {formatRuntimeStatus(check.expectedStatus)} · 실제 {formatRuntimeStatus(check.actualStatus)}
                                </p>
                              </div>
                              <code className={check.status === "pass" ? "ok" : "warn"}>{formatGateStatus(check.status)}</code>
                            </article>
                          ))}
                        </div>
                        <div className="questionAuditColumn">
                          <span>출처 계보</span>
                          {questionAuditBundle.evidence.sources.slice(0, 4).map((source, index) => (
                            <article className="questionAuditItem" key={`${source.path}-${index}`}>
                              <div>
                                <strong>{source.title}</strong>
                                <p>{source.path}</p>
                              </div>
                              <code>{formatDocumentVisibility(source.visibility)}</code>
                            </article>
                          ))}
                        </div>
                      </div>
                      <div className="questionAuditTimeline">
                        {questionAuditBundle.decisionPath.slice(0, 6).map((event) => (
                          <article className="timelineItem" key={`${event.order}-${event.kind}-${event.title}`}>
                            <span>{formatQuestionAuditKind(event.kind)}</span>
                            <div>
                              <strong>{event.title}</strong>
                              <p>{formatDateTime(event.at)}</p>
                            </div>
                            <code>{formatRuntimeStatus(event.status)}</code>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="empty">플랜 생성 후 저장된 질문 ID로 도구 호출, 권한 재검사, 출처 계보, 무결성 해시를 묶어 표시합니다.</p>
                  )}
                </section>
              </div>
            ) : (
              <p className="empty">장애 상황을 입력하면 근거 문서 기반 대응 단계, 승인 경계, 커뮤니케이션, 복구 검증 조건이 생성됩니다.</p>
            )}
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
	              <p className="empty">
	                {answer ? "답변에 사용할 수 있는 근거 문서가 없습니다." : "질문을 실행하면 출처가 여기에 표시됩니다."}
	              </p>
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
            <button className="secondaryButton" disabled={loading === "retrieval-profile"} onClick={runRetrievalProfile} type="button">
              {loading === "retrieval-profile" ? "프로파일링 중..." : "검색 프로파일"}
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

          <section className="permissionDiffPanel" aria-label="권한별 검색 비교">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">권한 비교</p>
                <h2>권한별 검색 비교</h2>
              </div>
              {retrievalPermissionDiff ? (
                <span className={retrievalPermissionDiff.status === "isolated" ? "badge" : "badge review"}>
                  {retrievalPermissionDiff.status === "isolated" ? "격리 정상" : "검토 필요"}
                </span>
              ) : null}
            </div>
            <button
              className="secondaryButton"
              disabled={loading === "retrieval-permission-diff"}
              onClick={runRetrievalPermissionDiff}
              type="button"
            >
              {loading === "retrieval-permission-diff" ? "비교 중..." : "권한별 검색 비교"}
            </button>
            {retrievalPermissionDiff ? (
              <>
                <div className="permissionDiffStats">
                  <Metric label="페르소나" value={String(retrievalPermissionDiff.summary.personaCount)} />
                  <Metric label="1순위 변화" value={String(retrievalPermissionDiff.summary.topSourceChangedCount)} />
                  <Metric label="최대 차단" value={String(retrievalPermissionDiff.summary.maxDeniedCandidateCount)} />
                  <Metric label="관리자 제한 후보" value={String(retrievalPermissionDiff.summary.privilegedRestrictedCandidateCount)} />
                </div>
                <div className="permissionDiffChecks">
                  {retrievalPermissionDiff.checks.map((check) => (
                    <article className={check.status === "pass" ? "permissionDiffCheck pass" : "permissionDiffCheck review"} key={check.id}>
                      <span>{formatGateStatus(check.status)}</span>
                      <strong>{check.label}</strong>
                      <p>{check.message}</p>
                    </article>
                  ))}
                </div>
                <div className="permissionPersonaGrid">
                  {retrievalPermissionDiff.personas.map((persona) => (
                    <article className="permissionPersonaCard" key={persona.id}>
                      <div>
                        <span>{persona.label}</span>
                        <strong>{persona.topSourcePath ?? "출처 없음"}</strong>
                        <code>
                          {persona.topSourceVisibility ? formatVisibility(persona.topSourceVisibility) : "출처 없음"} · 차단{" "}
                          {persona.deniedCandidateCount}개
                        </code>
                      </div>
                      <p>
                        역할 {persona.roles.join("|") || "없음"} · 팀 {persona.teamSlugs.join("|") || "없음"}
                      </p>
                      <div className="permissionCandidateList">
                        {persona.candidates.slice(0, 3).map((candidate) => (
                          <span className={candidate.visibility === "restricted" ? "restricted" : ""} key={`${persona.id}-${candidate.rank}-${candidate.path}`}>
                            #{candidate.rank} {candidate.visibility}:{candidate.path}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="permissionComparisonList">
                  {retrievalPermissionDiff.comparisons.map((comparison) => (
                    <article key={`${comparison.from}-${comparison.to}`}>
                      <strong>
                        {comparison.from} → {comparison.to}
                      </strong>
                      <code>
                        {comparison.topSourceChanged ? "1순위 변경" : "1순위 유지"} · 차단 {comparison.deniedCandidateDelta >= 0 ? "+" : ""}
                        {comparison.deniedCandidateDelta}
                      </code>
                      <p>
                        새로 보임: {comparison.newlyVisiblePaths.length > 0 ? comparison.newlyVisiblePaths.join(", ") : "없음"}
                      </p>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="empty">
                같은 질문을 공개 사용자, 지원 담당자, 결제 온콜, 운영 관리자 권한으로 실행해 권한별 출처 차이와 제한 문서 격리를 확인합니다.
              </p>
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

          <section className="retrievalProfilePanel" aria-label="검색 운영 프로파일">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">프로파일</p>
                <h2>검색 운영 프로파일</h2>
              </div>
              {retrievalProfile ? (
                <span className={retrievalProfile.status === "optimized" ? "badge" : "badge review"}>
                  {formatRetrievalProfileStatus(retrievalProfile.status)}
                </span>
              ) : null}
            </div>
            {retrievalProfile ? (
              <>
                <div className="retrievalProfileStats">
                  <Metric label="전체 지연" value={formatDuration(retrievalProfile.summary.endToEndMs)} />
                  <Metric label="검색" value={formatDuration(retrievalProfile.summary.searchMs)} />
                  <Metric label="후보 창" value={String(retrievalProfile.summary.candidateWindow)} />
                  <Metric label="차단 후보" value={String(retrievalProfile.summary.deniedCandidateCount)} />
                  <Metric label="예산 사용" value={formatPercent(retrievalProfile.summary.contextTokenUseRatio)} />
                  <Metric label="프로파일 해시" value={shortHash(retrievalProfile.profileHash)} />
                </div>
                <div className="retrievalProfileIntegrity">
                  <span>{formatRetrievalMode(retrievalProfile.summary.mode)}</span>
                  <code>{retrievalProfile.integrity.canonicalization}</code>
                  <code>{retrievalProfile.integrity.includedFields.join(", ")}</code>
                </div>
                <div className="retrievalProfileStages">
                  {retrievalProfile.stages.map((stage, index) => (
                    <article className={`retrievalProfileStage ${stage.status}`} key={stage.id}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{stage.label}</strong>
                        <p>{stage.evidence}</p>
                      </div>
                      <code>
                        {formatDuration(stage.durationMs)} / {formatDuration(stage.budgetMs)}
                      </code>
                    </article>
                  ))}
                </div>
                <div className="retrievalProfileBottlenecks">
                  {retrievalProfile.bottlenecks.slice(0, 4).map((item) => (
                    <article className={`retrievalProfileBottleneck ${item.severity}`} key={item.id}>
                      <strong>{item.label}</strong>
                      <p>{item.message}</p>
                      <code>{item.action}</code>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="empty">검색 프로파일을 실행하면 단계별 latency budget, 권한 차단 후보, 컨텍스트 예산, 결과 해시를 운영 관점으로 확인합니다.</p>
            )}
          </section>

          <section className="retrievalVerificationPanel" aria-label="미리보기-답변 검증">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">실행 검증</p>
                <h2>미리보기-답변 검증</h2>
              </div>
              {retrievalVerification ? (
                <span className={retrievalVerification.topSourceMatches ? "badge" : "badge review"}>
                  {retrievalVerification.topSourceMatches ? "1순위 일치" : "출처 비교 필요"}
                </span>
              ) : null}
              <button
                className="smallButton"
                disabled={loading === "retrieval-verification"}
                onClick={verifyRetrievalAgainstAnswer}
                type="button"
              >
                {loading === "retrieval-verification" ? "검증 중..." : "실제 답변까지 검증"}
              </button>
            </div>
            {retrievalVerification ? (
              <>
                <div className="retrievalVerificationStats">
                  <Metric label="출처 겹침" value={formatPercent(retrievalVerification.sourceOverlapRatio)} />
                  <Metric label="문서 일치율" value={formatPercent(retrievalVerification.documentAgreement)} />
                  <Metric label="답변 신뢰도" value={formatPercent(retrievalVerification.confidence)} />
                  <Metric label="사람 검토" value={retrievalVerification.needsHumanReview ? "필요" : "불필요"} />
                </div>
                <div className="retrievalVerificationRoute">
                  <article>
                    <span>검색 1순위</span>
                    <strong>{retrievalVerification.topCandidatePath ?? "후보 없음"}</strong>
                    <p>미리보기 후보 {retrievalVerification.previewCandidateCount}개 기준</p>
                  </article>
                  <article>
                    <span>답변 1순위</span>
                    <strong>{retrievalVerification.topAnswerSourcePath ?? "출처 없음"}</strong>
                    <p>실제 답변 출처 {retrievalVerification.answerSourceCount}개 기준</p>
                  </article>
                </div>
                <div className="retrievalVerificationAudit">
                  <div>
                    <span>도구 호출</span>
                    <code>{retrievalVerification.toolCalls.join(", ") || "없음"}</code>
                  </div>
                  <div>
                    <span>검토 사유</span>
                    <code>{retrievalVerification.reviewReasons.join(", ") || "없음"}</code>
                  </div>
                  <div>
                    <span>답변 ID</span>
                    <code>{shortId(retrievalVerification.answerId)} · {formatShortDate(retrievalVerification.generatedAt)}</code>
                  </div>
                </div>
              </>
            ) : (
              <p className="empty">
                검색 미리보기 결과로 실제 답변을 생성해 1순위 출처, 출처 겹침, 문서 일치율, 도구 호출 감사가 서로 맞는지 확인합니다.
              </p>
            )}
          </section>

          <section className="retrievalRobustnessPanel" aria-label="검색 강건성 리포트">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">회귀 진단</p>
                <h2>검색 강건성 리포트</h2>
              </div>
              {retrievalRobustness ? (
                <span className={retrievalRobustness.status === "stable" ? "badge" : "badge review"}>
                  {formatRobustnessStatus(retrievalRobustness.status)}
                </span>
              ) : null}
            </div>
            <button
              className="secondaryButton"
              disabled={loading === "retrieval-robustness"}
              onClick={runRetrievalRobustness}
              type="button"
            >
              {loading === "retrieval-robustness" ? "강건성 진단 중..." : "질문 변형 안정성 진단"}
            </button>
            {retrievalRobustness ? (
              <>
                <div className="diagnosticStats">
                  <Metric label="1순위 안정성" value={formatPercent(retrievalRobustness.summary.topSourceStability)} />
                  <Metric label="출처 겹침" value={formatPercent(retrievalRobustness.summary.averageSourceOverlap)} />
                  <Metric label="평균 신뢰도" value={formatPercent(retrievalRobustness.summary.averageConfidenceEstimate)} />
                  <Metric label="점수 흔들림" value={formatScore(retrievalRobustness.summary.maxScoreDelta)} />
                </div>
                <div className="diagnosticBanner">
                  <span>{formatRobustnessAction(retrievalRobustness.recommendedAction)}</span>
                  <code>
                    변형 {retrievalRobustness.summary.variantCount}개 · 권한 차단 {retrievalRobustness.summary.permissionDeniedTotal}개
                  </code>
                </div>
                <div className="diagnosticChecks">
                  {retrievalRobustness.checks.map((check) => (
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
                <div className="robustnessRuns">
                  <article>
                    <span>기준 질문</span>
                    <strong>{retrievalRobustness.baseline.topSourcePath ?? "출처 없음"}</strong>
                    <p>{retrievalRobustness.baseline.query}</p>
                  </article>
                  {retrievalRobustness.variants.map((variant) => (
                    <article key={`${variant.rank}-${variant.query}`}>
                      <span>{variant.topSourceMatchesBaseline ? "일치" : "불일치"}</span>
                      <strong>{variant.topSourcePath ?? "출처 없음"}</strong>
                      <p>{variant.query}</p>
                      <code>겹침 {formatPercent(variant.sourceOverlapWithBaseline)} · 신뢰 {formatPercent(variant.confidenceEstimate)}</code>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="empty">질문 변형을 자동 생성해 1순위 출처 안정성, 출처 겹침, 권한 경계, 점수 흔들림을 확인합니다.</p>
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
                            <code>의미 기반만 사용</code>
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
                {portfolioReadiness ? (
                  <section className={`portfolioReadinessPanel portfolioReadinessPanel--${portfolioReadiness.status}`} aria-label="제품 검증 상태">
                    <div className="portfolioReadinessHero">
                      <div>
                        <p className="eyebrow">제품 검증</p>
                        <h2>OpsPilot 상태 보드</h2>
                        <p>{portfolioReadiness.headline}</p>
                      </div>
                      <div className="readinessScore">
                        <span>{formatReleaseStatus(portfolioReadiness.status)}</span>
                        <strong>{formatPercent(portfolioReadiness.score)}</strong>
                        <small>서버 집계 점수</small>
                      </div>
                    </div>
                    <div className="readinessSnapshot">
                      <Metric label="통과" value={`${portfolioReadiness.summary.pass}/${portfolioReadiness.pillars.length}`} />
                      <Metric label="주의" value={String(portfolioReadiness.summary.warn)} />
                      <Metric label="차단" value={String(portfolioReadiness.summary.fail)} />
                      <Metric label="검증 증거" value={`${portfolioReadiness.summary.evidenceCount}개`} />
                      <Metric label="문서 일치율" value={formatPercent(portfolioReadiness.summary.averageDocumentAgreement)} />
                      <Metric label="API 성공률" value={formatPercent(portfolioReadiness.summary.apiSuccessRate)} />
                    </div>
                    <div className="readinessPillars">
                      {portfolioReadiness.pillars.map((pillar) => (
                        <article className="readinessPillar" key={pillar.id}>
                          <div className="readinessPillarHead">
                            <span className={pillar.status === "pass" ? "badge" : "badge review"}>{formatGateStatus(pillar.status)}</span>
                            <strong>{pillar.label}</strong>
                            <code>{formatPercent(pillar.score)}</code>
                          </div>
                          <p>{pillar.evidence}</p>
                          <small>{pillar.whyItMatters}</small>
                          <div className="readinessScript">
                            <span>확인 포인트</span>
                            <p>{pillar.demoScript}</p>
                          </div>
                          <div className="readinessCommands">
                            {pillar.verification.slice(0, 3).map((command) => (
                              <code key={command}>{command}</code>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="readinessDemoPath">
                      <div className="evalHistoryHead">
                        <span>권장 확인 흐름</span>
                        <code>{formatActionPlanRecommendation(portfolioReadiness.summary.releaseRecommendation)}</code>
                      </div>
                      {portfolioReadiness.demoPath.map((step) => (
                        <article className="readinessDemoStep" key={step.step}>
                          <span>{step.step}</span>
                          <div>
                            <strong>{step.screen}</strong>
                            <p>{step.action}</p>
                            <small>{step.proof}</small>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
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
	                          <code>{formatReleaseGateOwner(check.owner)}</code>
	                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
                {actionPlan ? (
                  <section className="actionPlanPanel" aria-label="운영 액션 플랜">
                    <div className="releaseGateHeader">
                      <div>
                        <span>운영 액션 플랜</span>
                        <strong>{formatActionPlanRecommendation(actionPlan.summary.releaseRecommendation)}</strong>
                      </div>
                      <code>
                        액션 {actionPlan.summary.actionCount}개 · P0 {actionPlan.summary.p0} · P1 {actionPlan.summary.p1} · 담당{" "}
                        {actionPlan.summary.owners.map(formatReleaseGateOwner).join(", ") || "없음"}
                      </code>
                    </div>
                    <div className="actionPlanList">
                      {actionPlan.actions.slice(0, 5).map((action) => (
                        <article className="actionPlanItem" key={action.id}>
                          <div className="actionPlanHead">
                            <span className={action.priority === "p0" ? "badge review" : "badge"}>{action.priority.toUpperCase()}</span>
                            <strong>{action.title}</strong>
                            <code>{formatReleaseGateOwner(action.owner)}</code>
                          </div>
                          <p>{formatOperationalReason(action.reason)}</p>
                          <small>{action.impact}</small>
                          <div className="actionPlanSteps">
                            {action.actionItems.slice(0, 2).map((item) => (
                              <span key={item}>{item}</span>
                            ))}
                          </div>
                          <div className="actionPlanVerify">
                            {action.verification.slice(0, 3).map((command) => (
                              <code key={command}>{command}</code>
                            ))}
                          </div>
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
                  <code>{formatToolCountMap(observability.toolCalls.byName)}</code>
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
                {errorBudget ? (
                  <section className={`errorBudgetPanel errorBudgetPanel--${errorBudget.status}`} aria-label="오류 예산 소모율">
                    <div className="evalHistoryHead">
                      <span>오류 예산 소모율</span>
                      <code>{formatErrorBudgetStatus(errorBudget.status)} · {errorBudget.summary.worstBurnRate}x</code>
                    </div>
                    <div className="errorBudgetHero">
                      <div>
                        <span>배포 권고</span>
                        <strong>{formatErrorBudgetRecommendation(errorBudget.summary.releaseRecommendation)}</strong>
                        <p>
                          가용성 {formatPercent(errorBudget.summary.availability)} · 오류 예산{" "}
                          {formatPercent(errorBudget.summary.errorBudgetRemaining)}
                        </p>
                      </div>
                      <div>
                        <span>목표</span>
                        <strong>{formatPercent(errorBudget.objective.availabilityTarget)}</strong>
                        <p>
                          허용 오류율 {formatPercent(errorBudget.objective.allowedErrorRate)} · 최소 표본{" "}
                          {errorBudget.objective.minimumRequestVolume}건
                        </p>
                      </div>
                    </div>
                    <div className="errorBudgetWindows">
                      {errorBudget.windows.map((window) => (
                        <article className="errorBudgetWindow" key={window.id}>
                          <div>
                            <span>{window.label}</span>
                            <strong>{window.burnRate}x</strong>
                          </div>
                          <p>
                            요청 {window.requestCount}건 · 5xx {window.errorCount}건 · 예산{" "}
                            {formatPercent(window.errorBudgetRemaining)}
                          </p>
                          <code>{formatErrorBudgetStatus(window.status)}</code>
                        </article>
                      ))}
                    </div>
                    {errorBudget.topOffenders.length > 0 ? (
                      <div className="errorBudgetOffenders">
                        {errorBudget.topOffenders.slice(0, 3).map((endpoint) => (
                          <article key={`${endpoint.method}-${endpoint.route}`}>
                            <div>
                              <strong>
                                {endpoint.method} {endpoint.route}
                              </strong>
                              <p>
                                5xx {endpoint.errorCount}/{endpoint.requestCount} · 오류율 {formatPercent(endpoint.errorRate)}
                              </p>
                            </div>
                            <code>p95 {formatDuration(endpoint.p95DurationMs)}</code>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="empty">최근 24시간 동안 5xx가 집중된 엔드포인트가 없습니다.</p>
                    )}
                    {errorBudget.actions.length > 0 ? (
                      <div className="errorBudgetActions">
                        {errorBudget.actions.slice(0, 2).map((action) => (
                          <article key={`${action.priority}-${action.title}`}>
                            <span className={action.priority === "p0" ? "badge review" : "badge"}>{action.priority.toUpperCase()}</span>
                            <div>
                              <strong>{action.title}</strong>
                              <p>{action.reason}</p>
                            </div>
                            <code>{action.verification[0]}</code>
                          </article>
                        ))}
                      </div>
                    ) : null}
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
                              {formatPercent(objective.actual)} {formatSloOperator(objective.operator)} {formatPercent(objective.target)}
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
                {evaluationRegression ? (
                  <section className={`evalRegression evalRegression--${evaluationRegression.status}`} aria-label="평가 회귀 릴리즈 리포트">
                    <div className="evalHistoryHead">
                      <div>
                        <span>회귀 릴리즈 리포트</span>
                        <p>
                          {evaluationRegression.releaseDecision.reason} · 현재 {shortId(evaluationRegression.current.runId)}
                          {evaluationRegression.previous ? ` · 직전 ${shortId(evaluationRegression.previous.runId)}` : " · 직전 실행 없음"}
                        </p>
                      </div>
                      <span className={evaluationRegression.status === "promote" ? "badge" : "badge review"}>
                        {formatEvaluationRegressionStatus(evaluationRegression.status)}
                      </span>
                    </div>
                    <div className="evalRegressionSummary">
                      <Metric label="실패 게이트" value={`${evaluationRegression.summary.failedGateCount}개`} />
                      <Metric label="하락 메트릭" value={`${evaluationRegression.summary.degradedMetricCount}개`} />
                      <Metric label="고위험 케이스" value={`${evaluationRegression.summary.highRiskCaseCount}개`} />
                      <Metric label="최저 일치율" value={formatPercent(evaluationRegression.summary.lowestDocumentAgreement)} />
                      <Metric label="리포트 해시" value={shortHash(evaluationRegression.integrity.reportHash)} />
                    </div>
                    <div className="evalRegressionDecision">
                      <strong>{evaluationRegression.releaseDecision.label}</strong>
                      <p>{evaluationRegression.releaseDecision.requiredAction}</p>
                    </div>
                    <div className="evalRegressionDeltas">
                      {evaluationRegression.metricDeltas.map((delta) => (
                        <article className={`evalRegressionDelta evalRegressionDelta--${delta.status}`} key={delta.metric}>
                          <span>{formatEvaluationMetricName(delta.metric)}</span>
                          <strong>{formatPercent(delta.current)}</strong>
                          <p>
                            Δ {formatDeltaPercent(delta.delta)} · 기준 {formatPercent(delta.threshold)} ·{" "}
                            {formatEvaluationRegressionDelta(delta.status)}
                          </p>
                        </article>
                      ))}
                    </div>
                    <div className="evalRegressionActions">
                      {evaluationRegression.actionItems.slice(0, 4).map((item) => (
                        <article className="evalRegressionAction" key={item.id}>
                          <div>
                            <strong>
                              {item.priority} · {item.title}
                            </strong>
                            <p>{item.evidence}</p>
                          </div>
                          <code>{item.command}</code>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
                {evaluationCoverage ? (
                  <section className={`evalCoverage evalCoverage--${evaluationCoverage.status}`} aria-label="평가 문서 커버리지 리포트">
                    <div className="evalHistoryHead">
                      <div>
                        <span>평가 문서 커버리지</span>
                        <p>
                          최신 평가가 문서 {evaluationCoverage.summary.coveredDocuments}/{evaluationCoverage.summary.totalDocuments}개를 기대 또는 실제 출처로 검증했습니다.
                        </p>
                      </div>
                      <span className={evaluationCoverage.status === "healthy" ? "badge" : "badge review"}>
                        {formatEvaluationCoverageStatus(evaluationCoverage.status)}
                      </span>
                    </div>
                    <div className="evalCoverageSummary">
                      <Metric label="전체 커버리지" value={formatPercent(evaluationCoverage.summary.coverageRatio)} />
                      <Metric label="제한 문서" value={formatPercent(evaluationCoverage.summary.restrictedCoverageRatio)} />
                      <Metric label="팀 문서" value={formatPercent(evaluationCoverage.summary.teamCoverageRatio)} />
                      <Metric label="미검증 문서" value={`${evaluationCoverage.summary.uncoveredDocuments}개`} />
                      <Metric label="평가 케이스" value={`${evaluationCoverage.summary.evalCaseCount}개`} />
                      <Metric label="리포트 해시" value={shortHash(evaluationCoverage.integrity.reportHash)} />
                    </div>
                    <div className="evalCoverageGrid">
                      {evaluationCoverage.documents.slice(0, 6).map((document) => (
                        <article className={`evalCoverageDocument evalCoverageDocument--${document.riskLevel}`} key={document.path}>
                          <div>
                            <span>{formatCoverageSource(document.coveredBy)}</span>
                            <strong>{document.title}</strong>
                            <p>{document.path}</p>
                          </div>
                          <code>
                            기대 {document.expectedCaseCount} · 실제 {document.actualHitCount} · 1순위 {document.topSourceCount}
                          </code>
                        </article>
                      ))}
                    </div>
                    <div className="evalCoverageBlindSpots">
                      {evaluationCoverage.blindSpots.slice(0, 3).map((item) => (
                        <article className="evalCoverageBlindSpot" key={item.path}>
                          <div>
                            <strong>
                              {formatCoverageRisk(item.riskLevel)} · {item.title}
                            </strong>
                            <p>{item.reason}</p>
                          </div>
                          <code>{item.suggestedQuestion}</code>
                        </article>
                      ))}
                    </div>
                    <div className="evalRegressionActions">
                      {evaluationCoverage.actionItems.slice(0, 3).map((item) => (
                        <article className="evalRegressionAction" key={item.id}>
                          <div>
                            <strong>
                              {item.priority} · {item.title}
                            </strong>
                            <p>{item.evidence}</p>
                          </div>
                          <code>{item.command}</code>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
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
                {evaluationCases ? (
                  <section className="evalCaseReport" aria-label="평가 케이스 상세 리포트">
                    <div className="evalHistoryHead">
                      <span>케이스 상세 리포트</span>
                      <code>고위험 {evaluationCases.summary.highRisk}개 · 최저 일치 {formatPercent(evaluationCases.summary.lowestAgreement)}</code>
                    </div>
                    <div className="evalCaseSummary">
                      <Metric label="통과" value={String(evaluationCases.summary.passed)} />
                      <Metric label="주의" value={String(evaluationCases.summary.warning)} />
                      <Metric label="실패" value={String(evaluationCases.summary.failed)} />
                      <Metric label="인용 누락" value={String(evaluationCases.summary.missingCitation)} />
                    </div>
                    <div className="evalCaseDetailList">
                      {evaluationCases.cases.map((item) => (
                        <article className="evalCaseDetail" key={item.id}>
                          <div className="evalCaseHead">
                            <div>
                              <strong>{item.id}</strong>
                              <p>
                                위험도 {formatRiskLevel(item.riskLevel)} · 1순위 {item.topSource ?? "없음"}
                              </p>
                            </div>
                            <span className={item.status === "pass" ? "badge" : "badge review"}>{formatGateStatus(item.status)}</span>
                          </div>
                          <div className="evalCaseChecks">
                            {item.checks.map((check) => (
                              <div className="evalCaseCheck" key={`${item.id}-${check.id}`}>
                                <span className={check.status === "pass" ? "badge" : "badge review"}>{formatGateStatus(check.status)}</span>
                                <div>
                                  <strong>{formatEvaluationCheckLabel(check.id, check.label)}</strong>
                                  <p>{check.evidence}</p>
                                </div>
                                <code>{check.metric === undefined ? "-" : `${formatPercent(check.metric)} / ${formatPercent(check.threshold ?? 0)}`}</code>
                              </div>
                            ))}
                          </div>
                          <div className="evalRecommendations">
                            {item.recommendations.length > 0 ? (
                              item.recommendations.map((recommendation) => <p key={`${item.id}-${recommendation}`}>{recommendation}</p>)
                            ) : (
                              <p>추가 조치가 필요하지 않습니다.</p>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
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
            <section className="auditLedgerPanel" aria-label="감사 원장">
              <div className="sectionHeader compact">
                <div>
                  <p className="eyebrow">무결성</p>
                  <h2>감사 원장 해시 체인</h2>
                </div>
                {auditLedger ? (
                  <span className={auditLedger.verified ? "badge" : "badge review"}>{auditLedger.verified ? "검증됨" : "검토 필요"}</span>
                ) : null}
                <button className="smallButton" disabled={loading === "ledger"} onClick={loadAuditLedger} type="button">
                  {loading === "ledger" ? "검증 중..." : "원장 검증"}
                </button>
              </div>
              {auditLedger ? (
                <>
                  <div className="auditLedgerSummary">
                    <Metric label="이벤트" value={`${auditLedger.window.eventCount}/${auditLedger.window.limit}`} />
                    <Metric label="질문 연결" value={String(auditLedger.summary.questionLinkedEvents)} />
                    <Metric label="체인" value={auditLedger.summary.tamperEvident ? "정상" : "검토"} />
                    <Metric label="해시" value={shortId(auditLedger.rootHash)} />
                  </div>
                  <div className="auditLedgerRoot">
                    <span>루트 해시</span>
                    <code>{auditLedger.rootHash}</code>
                  </div>
                  <div className="auditLedgerCounts">
                    <span>타입</span>
                    <code>{formatLedgerTypeCounts(auditLedger.summary.byType)}</code>
                    <span>상태</span>
                    <code>{formatStatusCountMap(auditLedger.summary.byStatus)}</code>
                  </div>
                  <div className="auditLedgerEvents">
                    {auditLedger.events.slice(-6).reverse().map((event) => (
                      <article className="auditLedgerEvent" key={`${event.sequence}-${event.id}`}>
                        <span>{event.sequence}</span>
                        <div>
                          <strong>{formatLedgerEventType(event.type)}</strong>
                          <p>
                            {formatShortDate(event.createdAt)} · {formatRuntimeStatus(event.status)} · {event.questionId ? shortId(event.questionId) : "질문 없음"}
                          </p>
                        </div>
                        <code>{shortId(event.chainHash)}</code>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <p className="empty">원장을 검증하면 최근 질문, 답변, 도구 호출, 승인, 피드백 이벤트가 SHA-256 해시 체인으로 묶여 표시됩니다.</p>
              )}
            </section>
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
                    <code>{slackTrace.trace.toolCalls.map((tool) => `${formatToolName(tool.toolName)}:${formatRuntimeStatus(tool.status)}`).join(" ") || "없음"}</code>
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
                      <strong>{formatToolName(tool.toolName)}</strong>
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
          <section className="docStartPanel" aria-label={locale === "ko" ? "문서 빠른 시작" : "Document quick start"}>
            <div className="docStartHeader">
              <div>
                <p className="eyebrow">{locale === "ko" ? "빠른 시작" : "Quick Start"}</p>
                <h2>{locale === "ko" ? "문서 넣고 바로 질문하기" : "Add a document, then ask it"}</h2>
                <p>
                  {locale === "ko"
                    ? "URL, md, txt, PDF, Word를 넣으면 텍스트를 추출해 저장하고 기존 RAG 색인으로 연결합니다."
                    : "Add a URL, md, txt, PDF, or Word file. OpsPilot extracts text, stores it, indexes it, and answers from it."}
                </p>
              </div>
              <div className="docStartActions">
                <button className="smallButton" disabled={loading === "seed-documents"} onClick={() => clearDocuments(true)} type="button">
                  {loading === "seed-documents" ? (locale === "ko" ? "복구 중..." : "Loading...") : locale === "ko" ? "Seed 다시 넣기" : "Reload Seed"}
                </button>
                <button className="dangerButton" disabled={loading === "reset-documents"} onClick={() => clearDocuments(false)} type="button">
                  {loading === "reset-documents" ? (locale === "ko" ? "초기화 중..." : "Resetting...") : locale === "ko" ? "문서 초기화" : "Reset Docs"}
                </button>
              </div>
            </div>

            <div className="docFlow">
              <article>
                <span>1</span>
                <strong>{locale === "ko" ? "문서 소스 선택" : "Choose source"}</strong>
                <p>{locale === "ko" ? "직접 입력하거나 파일을 선택하세요." : "Paste content or choose a file."}</p>
              </article>
              <article>
                <span>2</span>
                <strong>{locale === "ko" ? "저장 + 색인" : "Store + index"}</strong>
                <p>{locale === "ko" ? "청킹, 임베딩, 출처 저장을 실행합니다." : "Runs chunking, embeddings, and source storage."}</p>
              </article>
              <article>
                <span>3</span>
                <strong>{locale === "ko" ? "질문으로 검증" : "Verify by asking"}</strong>
                <p>{locale === "ko" ? "문서에 없으면 모른다고 답합니다." : "If evidence is missing, it says it does not know."}</p>
              </article>
            </div>

            <form className="sourceIngestForm" onSubmit={submitDocumentSource}>
              <div className="formGrid">
                <label>
                  {locale === "ko" ? "소스 타입" : "Source type"}
                  <select value={sourceType} onChange={(event) => setSourceType(event.target.value as DocumentSourceType)}>
                    <option value="text">txt / paste</option>
                    <option value="markdown">Markdown</option>
                    <option value="url">URL</option>
                    <option value="pdf">PDF</option>
                    <option value="docx">Word docx</option>
                  </select>
                </label>
                <label>
                  {locale === "ko" ? "문서 제목" : "Title"}
                  <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} />
                </label>
                <label>
                  {locale === "ko" ? "저장 경로" : "Storage path"}
                  <input value={sourcePath} onChange={(event) => setSourcePath(event.target.value)} placeholder="public/uploads/my-doc.md" />
                </label>
                <label>
                  {locale === "ko" ? "권한" : "Visibility"}
                  <select value={sourceVisibility} onChange={(event) => setSourceVisibility(event.target.value as "public" | "team" | "restricted")}>
                    <option value="public">{locale === "ko" ? "공개" : "Public"}</option>
                    <option value="team">{locale === "ko" ? "팀" : "Team"}</option>
                    <option value="restricted">{locale === "ko" ? "제한" : "Restricted"}</option>
                  </select>
                </label>
                {sourceVisibility === "team" ? (
                  <label>
                    {locale === "ko" ? "팀 슬러그" : "Team slug"}
                    <input value={sourceTeamSlug} onChange={(event) => setSourceTeamSlug(event.target.value)} />
                  </label>
                ) : null}
              </div>

              <label className="fileDrop">
                <span>{locale === "ko" ? "파일 선택" : "Choose file"}</span>
                <input accept=".md,.markdown,.txt,.pdf,.docx" onChange={handleSourceFileChange} type="file" />
                <small>
                  {sourceFileName
                    ? `${sourceFileName} · ${sourceType}`
                    : locale === "ko"
                      ? "파일을 선택하면 타입과 경로를 자동으로 맞춥니다."
                      : "Choosing a file auto-fills type and path."}
                </small>
              </label>

              {sourceType === "url" ? (
                <label>
                  URL
                  <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://example.com/docs/runbook" />
                </label>
              ) : sourceType === "pdf" || sourceType === "docx" ? (
                <p className="sourceHint">
                  {locale === "ko"
                    ? "PDF/Word는 파일 선택 후 등록하세요. 서버에서 텍스트를 추출한 뒤 색인합니다."
                    : "Choose a PDF/Word file first. The API extracts text and indexes it."}
                </p>
              ) : (
                <label>
                  {locale === "ko" ? "문서 내용" : "Document content"}
                  <textarea
                    value={sourceFileText || (sourceType === "markdown" ? markdown : sourceText)}
                    onChange={(event) => {
                      setSourceFileText("");
                      if (sourceType === "markdown") {
                        setMarkdown(event.target.value);
                      } else {
                        setSourceText(event.target.value);
                      }
                    }}
                    rows={6}
                  />
                </label>
              )}

              <label>
                {locale === "ko" ? "테스트 질문" : "Test question"}
                <input value={sourceQuestion} onChange={(event) => setSourceQuestion(event.target.value)} />
              </label>

              <div className="sourceFormFooter">
                <button className="primaryButton" disabled={loading === "source-ingest"} type="submit">
                  {loading === "source-ingest" ? (locale === "ko" ? "등록/검증 중..." : "Indexing...") : locale === "ko" ? "문서 등록하고 질문 테스트" : "Index and Test"}
                </button>
                <span>
                  {locale === "ko"
                    ? "답변은 저장된 문서 근거가 있을 때만 생성합니다."
                    : "Answers are generated only when stored evidence supports them."}
                </span>
              </div>
            </form>

            {sourceIngest ? (
              <>
                <div className="sourceResult">
                  <Metric label={locale === "ko" ? "등록 문서" : "Document"} value={sourceIngest.title} />
                  <Metric label={locale === "ko" ? "파서" : "Parser"} value={sourceIngest.parser} />
                  <Metric label={locale === "ko" ? "청크" : "Chunks"} value={`${sourceIngest.chunks}`} />
                  <Metric label={locale === "ko" ? "추출 문자" : "Extracted"} value={`${sourceIngest.extractedCharacters}`} />
                </div>
                <div className="sourceProvenanceCard" aria-label={locale === "ko" ? "문서 수집 추적 정보" : "Source ingestion provenance"}>
                  <div>
                    <span>{locale === "ko" ? "원본" : "Source"}</span>
                    <strong>{formatSourceReceived(sourceIngest)}</strong>
                    <p>{sourceIngest.provenance.extraction.contentType}</p>
                  </div>
                  <div>
                    <span>{locale === "ko" ? "저장" : "Storage"}</span>
                    <strong>{sourceIngest.provenance.storage.path}</strong>
                    <p>
                      {locale === "ko"
                        ? `${sourceIngest.provenance.storage.chunkCount}개 청크 · ${sourceIngest.provenance.storage.changed ? "새 버전" : "변경 없음"}`
                        : `${sourceIngest.provenance.storage.chunkCount} chunks · ${
                            sourceIngest.provenance.storage.changed ? "new version" : "unchanged"
                          }`}
                    </p>
                  </div>
                  <div>
                    <span>{locale === "ko" ? "해시" : "Hash"}</span>
                    <strong>{shortHash(sourceIngest.provenance.storage.contentHash)}</strong>
                    <p>
                      {locale === "ko"
                        ? `추출 ${shortHash(sourceIngest.provenance.extraction.extractedHash)}`
                        : `extracted ${shortHash(sourceIngest.provenance.extraction.extractedHash)}`}
                    </p>
                  </div>
                  <div>
                    <span>{locale === "ko" ? "보안" : "Safety"}</span>
                    <strong>{formatSourceUrlGuard(sourceIngest)}</strong>
                    <p>{sourceIngest.provenance.extraction.finalUrl ?? sourceIngest.provenance.received.url ?? sourceIngest.provenance.received.fileName ?? "-"}</p>
                  </div>
                </div>
                <div className={`sourceQuality sourceQuality--${sourceIngest.quality.status}`}>
                  <div>
                    <span>{locale === "ko" ? "수집 품질" : "Ingestion quality"}</span>
                    <strong>
                      {formatSourceQualityStatus(sourceIngest.quality.status)} · {formatPercent(sourceIngest.quality.score)}
                    </strong>
                    <p>
                      {locale === "ko"
                        ? `검색 힌트 ${sourceIngest.quality.summary.retrievalHintCount}개 · 평균 청크 ${Math.round(sourceIngest.quality.summary.avgChunkLength)}자`
                        : `${sourceIngest.quality.summary.retrievalHintCount} retrieval hints · ${Math.round(sourceIngest.quality.summary.avgChunkLength)} avg chars`}
                    </p>
                    <code>{sourceIngest.quality.searchTestQuery}</code>
                  </div>
                  {sourceIngest.quality.suggestedQuestions.length > 0 ? (
                    <div className="suggestedQuestions">
                      <span>{locale === "ko" ? "추천 테스트 질문" : "Suggested test questions"}</span>
                      {sourceIngest.quality.suggestedQuestions.map((item) => (
                        <button key={item.question} onClick={() => setSourceQuestion(item.question)} title={item.reason} type="button">
                          {item.question}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="sourceQualityChecks">
                    {sourceIngest.quality.checks.map((check) => (
                      <span className={check.status === "pass" ? "allow" : "deny"} key={check.id} title={check.evidence}>
                        {check.label}
                      </span>
                    ))}
                  </div>
                  <ul>
                    {sourceIngest.quality.recommendations.slice(0, 3).map((recommendation) => (
                      <li key={recommendation}>{recommendation}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}

            {resetResult ? (
              <div className="resetResult">
                {locale === "ko"
                  ? `초기화 완료: 문서 ${resetResult.deleted.documents}개, 청크 ${resetResult.deleted.chunks}개 삭제${
                      resetResult.reloadedSeed ? `, seed ${resetResult.seed?.documents.length ?? 0}개 복구` : ""
                    }`
                  : `Reset complete: deleted ${resetResult.deleted.documents} docs and ${resetResult.deleted.chunks} chunks${
                      resetResult.reloadedSeed ? `, reloaded ${resetResult.seed?.documents.length ?? 0} seed docs` : ""
                    }`}
              </div>
            ) : null}

            {deleteResult ? (
              <div className="deleteResultPanel" aria-label="문서 삭제 결과">
                <strong>{deleteResult.document.title} 삭제 완료</strong>
                <span>
                  청크 {deleteResult.removed.chunks}개 · 버전 {deleteResult.removed.versions}개 · 답변 출처{" "}
                  {deleteResult.removed.answerSources}개 제거
                </span>
                <span>
                  영향 답변 {deleteResult.impact.affectedAnswers}개 · 1순위 근거 {deleteResult.impact.topSourceAnswers}개
                </span>
                <p>{deleteResult.recommendations[0]}</p>
              </div>
            ) : null}
          </section>

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

            <section className="indexSnapshotPanel" aria-label="색인 스냅샷">
              <div className="qualityHead">
                <div>
                  <p className="eyebrow">스냅샷</p>
                  <h2>지식 베이스 스냅샷</h2>
                </div>
                {indexSnapshot ? (
                  <span className={indexSnapshot.status === "ready" ? "badge" : "badge review"}>
                    {formatIndexSnapshotStatus(indexSnapshot.status)}
                  </span>
                ) : null}
                <button className="smallButton" disabled={loading === "index-snapshot"} onClick={loadIndexSnapshot} type="button">
                  {loading === "index-snapshot" ? "생성 중..." : "스냅샷 생성"}
                </button>
              </div>

              {indexSnapshot ? (
                <>
                  <div className="indexSnapshotSummary">
                    <Metric label="스냅샷 해시" value={shortHash(indexSnapshot.snapshotHash)} />
                    <Metric label="임베딩" value={formatPercent(indexSnapshot.summary.embeddingCoverageRatio)} />
                    <Metric label="버전 문서" value={`${indexSnapshot.summary.versionedDocuments}/${indexSnapshot.summary.totalDocuments}`} />
                    <Metric label="품질 점수" value={formatPercent(indexSnapshot.summary.qualityScore)} />
                    <Metric
                      label="최근 갱신"
                      value={indexSnapshot.summary.latestDocumentUpdatedAt ? formatShortDate(indexSnapshot.summary.latestDocumentUpdatedAt) : "없음"}
                    />
                    <Metric label="청크" value={`${indexSnapshot.summary.totalChunks}개`} />
                  </div>
                  <div className="indexSnapshotMeta">
                    <span>
                      <strong>청크 매니페스트</strong>
                      <code>{indexSnapshot.pipeline.snapshot}</code>
                    </span>
                    <span>
                      <strong>정규화</strong>
                      <code>{indexSnapshot.integrity.canonicalization}</code>
                    </span>
                    <span>
                      <strong>검증 필드</strong>
                      <code>{indexSnapshot.integrity.includedFields.join(", ")}</code>
                    </span>
                  </div>
                  <div className="indexSnapshotDocuments">
                    {[...indexSnapshot.documents]
                      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() || left.path.localeCompare(right.path))
                      .slice(0, 4)
                      .map((document) => (
                        <article className="indexSnapshotDocument" key={document.id}>
                          <div>
                            <strong>{document.title}</strong>
                            <p>{document.path}</p>
                          </div>
                          <code>chunk {document.chunkCount} · v{document.latestVersion}</code>
                          <small>
                            문서 {shortHash(document.contentHash)} · 청크 {shortHash(document.chunkSetHash)}
                          </small>
                        </article>
                      ))}
                  </div>
                  <div className="indexSnapshotRecommendations">
                    {indexSnapshot.recommendations.map((recommendation) => (
                      <p key={recommendation}>{recommendation}</p>
                    ))}
                  </div>
                </>
              ) : (
                <p className="empty">스냅샷을 생성하면 문서, 청크, 버전, 임베딩 커버리지, 보안 메타데이터가 하나의 해시로 증명됩니다.</p>
              )}
            </section>

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

            <section className="revalidationQueuePanel" aria-label="문서 재검증 큐">
              <div className="qualityHead">
                <div>
                  <p className="eyebrow">변경 영향</p>
                  <h2>문서 재검증 큐</h2>
                </div>
                {documentRevalidationQueue ? (
                  <span className={documentRevalidationQueue.status === "empty" || documentRevalidationQueue.status === "ready" ? "badge" : "badge review"}>
                    {formatRevalidationQueueStatus(documentRevalidationQueue.status)}
                  </span>
                ) : null}
                <button className="smallButton" disabled={loading === "revalidation"} onClick={loadDocumentRevalidationQueue} type="button">
                  {loading === "revalidation" ? "계산 중..." : "재검증 큐"}
                </button>
                <button className="smallButton" disabled={loading === "revalidation-history"} onClick={loadDocumentRevalidationRuns} type="button">
                  {loading === "revalidation-history" ? "불러오는 중..." : "실행 이력"}
                </button>
              </div>
              {documentRevalidationQueue ? (
                <>
                  <div className="revalidationSummary">
                    <Metric label="큐 항목" value={`${documentRevalidationQueue.summary.queueItemCount}개`} />
                    <Metric label="영향 문서" value={`${documentRevalidationQueue.summary.affectedDocumentCount}개`} />
                    <Metric label="고위험" value={`${documentRevalidationQueue.summary.highRiskItemCount}개`} />
                    <Metric label="1순위 근거" value={`${documentRevalidationQueue.summary.topSourceItemCount}개`} />
                    <Metric label="사람 검토" value={`${documentRevalidationQueue.summary.humanReviewItemCount}개`} />
                    <Metric label="제한 문서" value={`${documentRevalidationQueue.summary.restrictedItemCount}개`} />
                  </div>
                  <div className="revalidationRecommendations">
                    {documentRevalidationQueue.recommendations.map((recommendation) => (
                      <p key={recommendation}>{recommendation}</p>
                    ))}
                  </div>
                  <div className="revalidationList">
                    {documentRevalidationQueue.items.length > 0 ? (
                      visibleRevalidationItems.map((item) => (
                        <article className={`revalidationItem revalidationItem--${item.priority.toLowerCase()}`} key={item.id}>
                          <div className="revalidationItemHead">
                            <span>{item.priority}</span>
                            <div>
                              <strong>{item.answer.question}</strong>
                              <p>
                                {item.document.path} · 근거 #{item.source.rank} · {formatRevalidationRisk(item.riskLevel)}
                              </p>
                            </div>
                            <code>{shortId(item.answer.id)}</code>
                          </div>
                          <p>{item.reason}</p>
                          <div className="revalidationActions">
                            <span>{item.actions[0]}</span>
                            <code>replay</code>
                            <code>lineage</code>
                            <code>quality-gate</code>
                            <button
                              className="smallButton"
                              disabled={loading === "revalidation-run"}
                              onClick={() => executeDocumentRevalidation(item)}
                              type="button"
                            >
                              {loading === "revalidation-run" ? "실행 중..." : "재검증 실행"}
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="empty">문서 변경 이후 오래된 답변이 없습니다.</p>
                    )}
                  </div>
                  {documentRevalidationRun ? (
                    <div className={`revalidationRun revalidationRun--${documentRevalidationRun.status}`}>
                      <div className="revalidationRunHead">
                        <div>
                          <p className="eyebrow">실행 결과</p>
                          <h3>{documentRevalidationRun.decision.label}</h3>
                          <p>{documentRevalidationRun.queueItem.answer.question}</p>
                        </div>
                        <span className={documentRevalidationRun.status === "cleared" ? "badge" : "badge review"}>
                          {formatRevalidationRunStatus(documentRevalidationRun.status)}
                        </span>
                      </div>
                      <div className="revalidationRunSummary">
                        <Metric label="재실행" value={formatReplayStatus(documentRevalidationRun.summary.replayStatus)} />
                        <Metric label="품질 게이트" value={formatQualityGateStatus(documentRevalidationRun.summary.qualityGateStatus)} />
                        <Metric label="출처 겹침" value={`${Math.round(documentRevalidationRun.summary.sourceOverlapRatio * 100)}%`} />
                        <Metric label="현재 일치율" value={`${Math.round(documentRevalidationRun.summary.currentDocumentAgreement * 100)}%`} />
                        <Metric label="차단 후보" value={`${documentRevalidationRun.summary.permissionDeniedCandidates}개`} />
                        <Metric label="계보 해시" value={shortHash(documentRevalidationRun.summary.lineageIntegrityHash)} />
                        <Metric label="실행 ID" value={shortId(documentRevalidationRun.runId)} />
                        <Metric label="리포트 해시" value={shortHash(documentRevalidationRun.persistence.reportHash)} />
                      </div>
                      <div className="revalidationRecommendations">
                        <p>
                          {formatDateTime(documentRevalidationRun.persistence.createdAt)}에 저장됨 · replay{" "}
                          {shortHash(documentRevalidationRun.artifactHashes.replay)} · 품질 게이트{" "}
                          {shortHash(documentRevalidationRun.artifactHashes.qualityGate)} · 계보{" "}
                          {shortHash(documentRevalidationRun.artifactHashes.lineage)}
                        </p>
                      </div>
                      <div className="revalidationRunChecks">
                        {documentRevalidationRun.checks.map((check) => (
                          <article className={`revalidationRunCheck revalidationRunCheck--${check.status}`} key={check.id}>
                            <strong>{check.label}</strong>
                            <span>{formatCheckStatus(check.status)}</span>
                            <p>{check.evidence}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {documentRevalidationRuns ? (
                    <div className="revalidationRunHistory" aria-label="최근 재검증 실행 이력">
                      <div className="sectionHeader compact">
                        <div>
                          <p className="eyebrow">감사 이력</p>
                          <h3>최근 재검증 실행</h3>
                        </div>
                        <span className="badge">{documentRevalidationRuns.summary.runCount}건</span>
                      </div>
                      <div className="revalidationSummary">
                        <Metric label="종료" value={`${documentRevalidationRuns.summary.clearedCount}건`} />
                        <Metric label="재검토" value={`${documentRevalidationRuns.summary.needsReviewCount}건`} />
                        <Metric label="차단" value={`${documentRevalidationRuns.summary.blockedCount}건`} />
                        <Metric
                          label="최근 실행"
                          value={documentRevalidationRuns.summary.latestRunAt ? formatShortDate(documentRevalidationRuns.summary.latestRunAt) : "없음"}
                        />
                      </div>
                      <div className="revalidationList">
                        {documentRevalidationRuns.runs.length > 0 ? (
                          documentRevalidationRuns.runs.slice(0, 5).map((run) => (
                            <article className={`revalidationItem revalidationRun--${run.status}`} key={run.id}>
                              <div className="revalidationItemHead">
                                <span>{formatRevalidationRunStatus(run.status)}</span>
                                <div>
                                  <strong>{run.answer.question ?? "질문 없음"}</strong>
                                  <p>
                                    {run.document.path} · {formatDateTime(run.createdAt)} · {run.decision.label}
                                  </p>
                                </div>
                                <code>{shortHash(run.reportHash)}</code>
                              </div>
                              <p>
                                현재 일치율 {Math.round(run.summary.currentDocumentAgreement * 100)}% · 출처 겹침{" "}
                                {Math.round(run.summary.sourceOverlapRatio * 100)}% · 계보 {shortHash(run.summary.lineageIntegrityHash)}
                              </p>
                            </article>
                          ))
                        ) : (
                          <p className="empty">아직 저장된 재검증 실행 이력이 없습니다.</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="empty">재검증 큐를 계산하면 문서 변경 이후 오래된 답변, 위험도, replay/lineage/quality gate 경로가 표시됩니다.</p>
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
                        setDocumentIndexExplain(null);
                        setDocumentImpact(null);
                      }}
                      type="button"
                    >
                      <span>
                        <span className="documentRowTitle">
                          <strong>{document.title}</strong>
                          <em>{formatDocumentSourceType(document)}</em>
                        </span>
                        <small>{document.path}</small>
                        {hasDocumentSourceProvenance(document) ? <small>{formatDocumentSourceOrigin(document)}</small> : null}
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
                        <div className="headerActions">
                          <button className="smallButton" disabled={loading === "versions"} onClick={() => loadDocumentVersions()} type="button">
	                            {loading === "versions" ? "불러오는 중..." : `v${selectedDocument.latestVersion} 이력`}
                          </button>
                          <button className="smallButton" disabled={loading === "index-explain"} onClick={() => loadDocumentIndexExplain()} type="button">
                            {loading === "index-explain" ? "분석 중..." : "색인 설명"}
                          </button>
                          <button className="smallButton" disabled={loading === "impact"} onClick={() => loadDocumentImpact()} type="button">
                            {loading === "impact" ? "분석 중..." : "영향 분석"}
                          </button>
                          <button className="smallButton dangerTextButton" disabled={loading === "delete-document"} onClick={removeSelectedDocument} type="button">
                            {loading === "delete-document" ? "삭제 중..." : "삭제"}
                          </button>
                        </div>
                      </div>
                      <div className="securityLine">
                        <span>팀: {selectedDocument.teamSlug ?? "전체 공개"}</span>
                        <span>마스킹: {getRedactionCount(selectedDocument)}</span>
                        <span className={hasPromptInjectionRisk(selectedDocument) ? "securityWarn" : ""}>
                          프롬프트 주입: {formatPromptInjectionRisk(selectedDocument)}
                        </span>
                        <span>해시: {selectedDocument.contentHash.slice(0, 10)}</span>
                      </div>
                      <div className="sourceProvenanceLine">
                        <span>원본: {formatDocumentSourceType(selectedDocument)}</span>
                        <span>{formatDocumentSourceOrigin(selectedDocument)}</span>
                        <span>태그: {formatDocumentTags(selectedDocument)}</span>
                      </div>
                      {hasPersistedSourceProvenance(selectedDocument) ? (
                        <div className="sourceProvenanceLine sourceProvenanceLine--details">
                          <span>파서: {formatDocumentSourceParser(selectedDocument)}</span>
                          <span>타입: {formatDocumentSourceContentType(selectedDocument)}</span>
                          <span>추출 해시: {formatDocumentSourceExtractedHash(selectedDocument)}</span>
                          <span>URL 가드: {formatDocumentSourceGuard(selectedDocument)}</span>
                        </div>
                      ) : null}
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
                      {documentIndexExplain?.document.id === selectedDocument.id ? (
                        <section className="indexExplainPanel" aria-label="문서 색인 설명">
                          <div className="indexExplainSummary">
                            <div>
                              <span>색인 준비</span>
                              <strong>{documentIndexExplain.summary.searchReady ? "검색 가능" : "재색인 필요"}</strong>
                            </div>
                            <div>
                              <span>임베딩</span>
                              <strong>{formatPercent(documentIndexExplain.summary.embeddingCoverageRatio)}</strong>
                            </div>
                            <div>
                              <span>헤딩 신호</span>
                              <strong>{formatPercent(documentIndexExplain.summary.headingCoverageRatio)}</strong>
                            </div>
                            <code>{documentIndexExplain.pipeline.chunking}</code>
                          </div>
                          <div className="indexExplainPipeline">
                            {Object.entries(documentIndexExplain.pipeline).map(([key, value]) => (
                              <span key={key}>
                                <strong>{formatPipelineKey(key)}</strong>
                                <code>{value}</code>
                              </span>
                            ))}
                          </div>
                          <div className="indexExplainChecks">
                            {documentIndexExplain.checks.map((check) => (
                              <article className={check.status === "pass" ? "indexExplainCheck pass" : "indexExplainCheck review"} key={check.id}>
                                <span>{formatGateStatus(check.status)}</span>
                                <strong>{check.label}</strong>
                                <p>{check.evidence}</p>
                              </article>
                            ))}
                          </div>
                          <div className="indexExplainOutline">
                            <strong>헤딩 아웃라인</strong>
                            <div>
                              {documentIndexExplain.headingOutline.slice(0, 6).map((heading) => (
                                <span key={heading.heading}>
                                  {heading.heading} · #{heading.chunkIndexes.join(", #")}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="indexExplainChunks">
                            {documentIndexExplain.chunks.slice(0, 4).map((chunk) => (
                              <article className="indexExplainChunk" key={chunk.id}>
                                <div>
                                  <strong>#{chunk.chunkIndex} {chunk.heading ?? "문서 본문"}</strong>
                                  <code>
                                    {chunk.contentLength}자 · 토큰 약 {chunk.tokenEstimate} · {chunk.embeddingDimensions}d
                                  </code>
                                </div>
                                <p>{chunk.preview}</p>
                                <div>
                                  {chunk.retrievalHints.map((hint) => (
                                    <span key={hint}>{hint}</span>
                                  ))}
                                </div>
                              </article>
                            ))}
                          </div>
                          <div className="indexExplainRecommendations">
                            {documentIndexExplain.recommendations.map((recommendation) => (
                              <p key={recommendation}>{recommendation}</p>
                            ))}
                          </div>
                        </section>
                      ) : null}
                      {documentImpact?.document.id === selectedDocument.id ? (
                        <section className="impactPanel" aria-label="문서 변경 영향 분석">
                          <div className="impactSummary">
                            <div>
                              <span>영향 분석</span>
                              <strong>{formatImpactRisk(documentImpact.summary.riskLevel)}</strong>
                            </div>
                            <div>
                              <span>영향 답변</span>
                              <strong>{documentImpact.summary.affectedAnswerCount}개</strong>
                            </div>
                            <div>
                              <span>재검증 필요</span>
                              <strong>{documentImpact.summary.staleAnswerCount}개</strong>
                            </div>
                            <code>v{documentImpact.document.latestVersion} · {shortHash(documentImpact.document.contentHash)}</code>
                          </div>
                          <div className="impactMetrics">
                            <Metric label="질문" value={`${documentImpact.summary.affectedQuestionCount}개`} />
                            <Metric label="1순위 근거" value={`${documentImpact.summary.topSourceAnswerCount}개`} />
                            <Metric label="사람 검토" value={`${documentImpact.summary.humanReviewAnswerCount}개`} />
                            <Metric label="최근 답변" value={documentImpact.summary.latestAnswerAt ? formatShortDate(documentImpact.summary.latestAnswerAt) : "없음"} />
                          </div>
                          <div className="impactRecommendations">
                            {documentImpact.recommendations.map((recommendation) => (
                              <p key={recommendation}>{recommendation}</p>
                            ))}
                          </div>
                          <div className="impactAnswerList">
                            {documentImpact.affectedAnswers.length > 0 ? (
                              documentImpact.affectedAnswers.slice(0, 4).map((item) => (
                                <article className="impactAnswerItem" key={item.answerId}>
                                  <div>
                                    <strong>{item.question}</strong>
                                    <p>{item.answerPreview}</p>
                                  </div>
                                  <div className="impactAnswerMeta">
                                    <span className={item.staleAfterDocumentUpdate ? "badge review" : "badge"}>
                                      {item.staleAfterDocumentUpdate ? "재검증" : "최신"}
                                    </span>
                                    <code>근거 #{item.sourceRank} · {formatScore(item.sourceScore)}</code>
                                    <code>{shortId(item.answerId)}</code>
                                  </div>
                                </article>
                              ))
                            ) : (
                              <p className="empty">이 문서를 출처로 사용한 저장 답변이 아직 없습니다.</p>
                            )}
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
	                  <span className={indexProof.verdict === "pass" ? "badge" : "badge review"}>
                      {indexProof.verdict === "pass" ? "검증 통과" : "검토 필요"}
                    </span>
                </div>
                <div className="proofGrid">
	                  <Metric label="청크" value={String(indexProof.chunkCount)} />
	                  <Metric label="최고 점수" value={indexProof.topScore === null ? "해당 없음" : formatScore(indexProof.topScore)} />
	                  <Metric label="답변 일치율" value={formatPercent(indexProof.documentAgreement)} />
	                  <Metric label="신뢰도" value={formatPercent(indexProof.confidence)} />
                </div>
                <div className="proofVerdict">
                  <strong>{indexProof.sourceHit ? "출처 적중" : "출처 검토 필요"}</strong>
                  <p>{indexProof.verdictReason}</p>
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
                <div className="proofAnswerPreview">
                  <span>답변 미리보기</span>
                  <p>{indexProof.answerPreview}</p>
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
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

function calculateSourceOverlap(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) {
    return 0;
  }

  return [...leftSet].filter((path) => rightSet.has(path)).length / union.size;
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

function formatToolCountMap(values: Record<string, number>): string {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return "없음";
  }
  return entries.map(([key, value]) => `${formatToolName(key)}:${value}`).join(" ");
}

function formatToolName(name: string): string {
  const labels: Record<string, string> = {
    search_documents: "문서 검색",
    list_documents: "문서 목록",
    create_runbook_checklist: "런북 체크리스트 생성",
    create_incident_response_plan: "장애 대응 플랜 생성",
    request_human_approval: "사람 승인 요청",
    save_feedback: "피드백 저장"
  };
  return labels[name] ? `${labels[name]} (${name})` : name;
}

function formatLedgerTypeCounts(values: Record<string, number>): string {
  const entries = Object.entries(values).filter(([, value]) => value > 0);
  if (entries.length === 0) {
    return "없음";
  }
  return entries.map(([key, value]) => `${formatLedgerEventType(key)}:${value}`).join(" ");
}

function formatLedgerEventType(type: string): string {
  const labels: Record<string, string> = {
    question: "질문",
    answer: "답변",
    tool_call: "도구 호출",
    approval: "승인",
    feedback: "피드백",
    revalidation_run: "재검증 실행"
  };
  return labels[type] ?? type;
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

function formatRiskLevel(level: string): string {
  const labels: Record<string, string> = {
    low: "낮음",
    medium: "중간",
    high: "높음",
    critical: "긴급"
  };
  return labels[level] ?? level;
}

function formatImpactRisk(level: string): string {
  const labels: Record<string, string> = {
    low: "낮은 영향",
    medium: "검토 필요",
    high: "우선 재검증",
    critical: "즉시 재검증"
  };
  return labels[level] ?? level;
}

function formatRevalidationQueueStatus(status: DocumentRevalidationQueueReport["status"]): string {
  const labels: Record<DocumentRevalidationQueueReport["status"], string> = {
    empty: "비어 있음",
    ready: "정상 대기",
    attention: "재검증 필요",
    critical: "즉시 대응"
  };
  return labels[status];
}

function formatRevalidationRisk(riskLevel: DocumentRevalidationQueueReport["items"][number]["riskLevel"]): string {
  const labels: Record<DocumentRevalidationQueueReport["items"][number]["riskLevel"], string> = {
    low: "낮은 위험",
    medium: "중간 위험",
    high: "높은 위험",
    critical: "긴급 위험"
  };
  return labels[riskLevel];
}

function formatRevalidationRunStatus(status: DocumentRevalidationRunReport["status"]): string {
  const labels: Record<DocumentRevalidationRunReport["status"], string> = {
    cleared: "종료 가능",
    needs_review: "재검토 필요",
    blocked: "차단 필요"
  };
  return labels[status];
}

function formatCheckStatus(status: "pass" | "warn" | "fail"): string {
  const labels: Record<"pass" | "warn" | "fail", string> = {
    pass: "통과",
    warn: "주의",
    fail: "실패"
  };
  return labels[status];
}

function formatEvaluationCheckLabel(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    source_hit: "기대 출처 적중",
    top_source: "1순위 출처",
    human_review: "사람 검토 경계",
    document_agreement: "문서 일치율",
    citation: "출처 인용"
  };
  return labels[id] ?? fallback;
}

function formatEvaluationMetricName(metric: keyof EvaluationReport["metrics"]): string {
  const labels: Record<keyof EvaluationReport["metrics"], string> = {
    sourceHitRate: "출처 적중",
    topSourceAccuracy: "1순위 출처",
    humanReviewAccuracy: "사람 검토",
    documentAgreementScore: "문서 일치율",
    citationAccuracy: "출처 인용"
  };
  return labels[metric];
}

function formatEvaluationRegressionStatus(status: EvaluationRegressionReport["status"]): string {
  const labels: Record<EvaluationRegressionReport["status"], string> = {
    promote: "배포 가능",
    watch: "관찰 필요",
    block: "배포 차단"
  };
  return labels[status];
}

function formatEvaluationRegressionDelta(status: EvaluationRegressionReport["metricDeltas"][number]["status"]): string {
  const labels: Record<EvaluationRegressionReport["metricDeltas"][number]["status"], string> = {
    improved: "개선",
    stable: "유지",
    degraded: "하락",
    new: "신규 기준선"
  };
  return labels[status];
}

function formatEvaluationCoverageStatus(status: EvaluationCoverageReport["status"]): string {
  const labels: Record<EvaluationCoverageReport["status"], string> = {
    healthy: "충분",
    gaps: "사각지대 있음",
    missing_eval: "평가 필요"
  };
  return labels[status];
}

function formatCoverageSource(coveredBy: EvaluationCoverageReport["documents"][number]["coveredBy"]): string {
  const labels: Record<EvaluationCoverageReport["documents"][number]["coveredBy"], string> = {
    both: "기대+실제",
    expected: "기대 출처",
    actual: "실제 출처",
    none: "미검증"
  };
  return labels[coveredBy];
}

function formatCoverageRisk(riskLevel: EvaluationCoverageReport["documents"][number]["riskLevel"]): string {
  const labels: Record<EvaluationCoverageReport["documents"][number]["riskLevel"], string> = {
    low: "낮음",
    medium: "주의",
    high: "높음"
  };
  return labels[riskLevel];
}

function formatIndexQualityStatus(status: string): string {
  const labels: Record<string, string> = {
    healthy: "정상",
    warning: "주의",
    critical: "위험"
  };
  return labels[status] ?? status;
}

function formatSourceQualityStatus(status: SourceIngestResponse["quality"]["status"]): string {
  const labels: Record<SourceIngestResponse["quality"]["status"], string> = {
    ready: "검색 준비 완료",
    attention: "검토 필요",
    blocked: "색인 차단"
  };
  return labels[status];
}

function formatIndexSnapshotStatus(status: DocumentIndexSnapshotReport["status"]): string {
  const labels: Record<DocumentIndexSnapshotReport["status"], string> = {
    ready: "재현 가능",
    degraded: "검토 필요",
    empty: "비어 있음"
  };
  return labels[status];
}

function formatPipelineKey(key: string): string {
  const labels: Record<string, string> = {
    source: "소스",
    parser: "파서",
    redaction: "마스킹",
    chunking: "청킹",
    embedding: "임베딩",
    vectorStore: "벡터 저장소",
    lexicalMirror: "검색 미러",
    snapshot: "스냅샷"
  };
  return labels[key] ?? key;
}

function formatIncidentPlanStatus(status: string): string {
  const labels: Record<string, string> = {
    ready: "즉시 실행 가능",
    needs_review: "검토 필요",
    blocked: "근거 부족"
  };
  return labels[status] ?? status;
}

function formatIncidentSeverity(severity: string): string {
  const labels: Record<string, string> = {
    sev1: "SEV1",
    sev2: "SEV2",
    sev3: "SEV3"
  };
  return labels[severity] ?? severity;
}

function formatIncidentPhase(phase: string): string {
  const labels: Record<string, string> = {
    triage: "1",
    mitigation: "2",
    communication: "3",
    recovery: "4"
  };
  return labels[phase] ?? phase;
}

function formatApprovalPolicy(policy: string): string {
  const labels: Record<string, string> = {
    human_required: "사람 승인 필요"
  };
  return labels[policy] ?? policy;
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

function formatReleaseGateOwner(owner: string): string {
  const labels: Record<string, string> = {
    platform: "플랫폼",
    rag: "RAG",
    ops: "운영",
    quality: "품질"
  };
  return labels[owner] ?? owner;
}

function formatSloOperator(operator: string): string {
  const labels: Record<string, string> = {
    gte: "이상",
    lte: "이하"
  };
  return labels[operator] ?? operator;
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

function formatQualityGateStatus(status: string): string {
  const labels: Record<string, string> = {
    pass: "통과",
    review: "검토 필요",
    block: "차단"
  };
  return labels[status] ?? status;
}

function formatQualityGateAction(action: string): string {
  const labels: Record<string, string> = {
    share: "공유 가능",
    review_before_share: "검토 후 공유",
    block_and_rework: "차단 후 재작성"
  };
  return labels[action] ?? action;
}

function formatClaimSupportStatus(status: AnswerClaimSupport["status"]): string {
  const labels: Record<AnswerClaimSupport["status"], string> = {
    supported: "문서 근거 충분",
    review_required: "일부 검토 필요",
    unsupported: "근거 보강 필요"
  };
  return labels[status];
}

function formatClaimStatus(status: AnswerClaimSupport["claims"][number]["status"]): string {
  const labels: Record<AnswerClaimSupport["claims"][number]["status"], string> = {
    supported: "지원됨",
    partial: "부분 지원",
    unsupported: "근거 부족"
  };
  return labels[status];
}

function formatClaimAction(action: AnswerClaimSupport["claims"][number]["recommendedAction"]): string {
  const labels: Record<AnswerClaimSupport["claims"][number]["recommendedAction"], string> = {
    share: "공유 가능",
    review_claim: "문장 검토",
    rewrite_with_sources: "근거 보강"
  };
  return labels[action];
}

function formatApprovalGateStatus(status: string): string {
  const labels: Record<string, string> = {
    not_required: "불필요",
    approved: "승인됨",
    pending: "대기 중",
    rejected: "반려됨",
    missing: "누락"
  };
  return labels[status] ?? status;
}

function formatQualityGateCheckLabel(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    proof_verified: "증명 패킷",
    replay_stable: "재실행 안정성",
    approval_resolved: "승인 경계",
    feedback_signal: "피드백 신호",
    confidence_floor: "신뢰도 하한",
    document_agreement: "문서 일치율",
    grounding_coverage: "근거 커버리지",
    source_overlap: "출처 겹침",
    permission_boundary: "권한 경계"
  };
  return labels[id] ?? fallback;
}

function formatQualityGateEvidence(evidence: string): string {
  const labels: Record<string, string> = {
    verified: "검증됨",
    review_required: "검토 필요",
    insufficient_evidence: "근거 부족",
    stable: "안정",
    needs_review: "검토 필요",
    drifted: "변경 감지"
  };
  return evidence.replace(
    /\b(verified|review_required|insufficient_evidence|stable|needs_review|drifted)\b/g,
    (value) => labels[value] ?? value
  );
}

function formatQuestionAuditStatus(status: string): string {
  const labels: Record<string, string> = {
    verified: "검증됨",
    review_required: "검토 필요",
    policy_violation: "정책 위반",
    insufficient_evidence: "근거 부족"
  };
  return labels[status] ?? status;
}

function formatQuestionAuditKind(kind: string): string {
  const labels: Record<string, string> = {
    question: "질문",
    answer: "답변",
    source: "출처",
    tool: "도구",
    approval: "승인",
    feedback: "피드백",
    policy: "정책"
  };
  return labels[kind] ?? kind;
}

function formatLineageStatus(status: AnswerLineageGraph["status"]): string {
  const labels: Record<AnswerLineageGraph["status"], string> = {
    verified: "검증됨",
    review_required: "검토 필요",
    incomplete: "계보 부족"
  };
  return labels[status];
}

function formatLineageKind(kind: AnswerLineageGraph["nodes"][number]["kind"]): string {
  const labels: Record<AnswerLineageGraph["nodes"][number]["kind"], string> = {
    question: "질문",
    answer: "답변",
    source: "출처",
    tool: "도구",
    approval: "승인",
    feedback: "피드백",
    gate: "게이트"
  };
  return labels[kind];
}

function formatLineageEdgeKind(kind: AnswerLineageGraph["edges"][number]["kind"]): string {
  const labels: Record<AnswerLineageGraph["edges"][number]["kind"], string> = {
    created: "생성",
    grounded_by: "근거",
    called: "호출",
    requires: "승인",
    rated: "평가",
    checks: "검사"
  };
  return labels[kind];
}

function formatLineageNodeStatus(node: AnswerLineageGraph["nodes"][number]): string {
  if (node.kind === "source") {
    return formatVisibility(node.status);
  }
  if (node.kind === "tool" || node.kind === "approval") {
    return formatRuntimeStatus(node.status);
  }
  if (node.kind === "feedback") {
    return node.status === "positive" ? "긍정" : "부정";
  }
  if (node.kind === "gate") {
    return formatLineageStatus(node.status as AnswerLineageGraph["status"]);
  }
  return node.status;
}

function summarizeLineageNode(node: AnswerLineageGraph["nodes"][number]): string {
  if (node.kind === "question" && typeof node.detail.question === "string") {
    return node.detail.question;
  }
  if (node.kind === "answer") {
    const confidence = typeof node.detail.confidence === "number" ? formatPercent(node.detail.confidence) : "해당 없음";
    const agreement =
      typeof node.detail.documentAgreementScore === "number" ? formatPercent(node.detail.documentAgreementScore) : "해당 없음";
    return `신뢰도 ${confidence} · 일치율 ${agreement}`;
  }
  if (node.kind === "source") {
    const path = typeof node.detail.path === "string" ? node.detail.path : "경로 없음";
    const rank = typeof node.detail.rank === "number" ? `#${node.detail.rank}` : "#?";
    return `${rank} ${path}`;
  }
  if (node.kind === "tool") {
    return typeof node.detail.outputSummary === "string" ? node.detail.outputSummary : "도구 출력 요약 없음";
  }
  if (node.kind === "approval") {
    return typeof node.detail.action === "string" ? node.detail.action : "승인 요청";
  }
  if (node.kind === "feedback") {
    return typeof node.detail.comment === "string" && node.detail.comment ? node.detail.comment : "피드백 의견 없음";
  }
  if (node.kind === "gate") {
    const pending = typeof node.detail.pendingApprovalCount === "number" ? node.detail.pendingApprovalCount : 0;
    const toolCount = typeof node.detail.toolCallCount === "number" ? node.detail.toolCallCount : 0;
    return `대기 승인 ${pending}개 · 도구 호출 ${toolCount}개`;
  }
  return "계보 노드";
}

function shortLineageId(id: string): string {
  const [kind, raw] = id.split(":");
  const knownKinds: Record<string, AnswerLineageGraph["nodes"][number]["kind"]> = {
    question: "question",
    answer: "answer",
    source: "source",
    tool: "tool",
    approval: "approval",
    feedback: "feedback",
    gate: "gate"
  };
  const label = knownKinds[kind] ? formatLineageKind(knownKinds[kind]) : kind;
  return `${label}:${shortId(raw ?? id)}`;
}

function formatRuntimeStatus(status: string): string {
  const labels: Record<string, string> = {
    allowed: "허용",
    needs_approval: "승인 필요",
    needs_human_review: "사람 검토",
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
    ready: "준비",
    web: "웹",
    slack: "Slack",
    incident_plan: "장애 플랜",
    "audit-ledger-smoke": "원장 검증",
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

function formatDocumentVisibility(visibility: string): string {
  return formatVisibility(visibility);
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

function formatRetrievalProfileStatus(status: RetrievalProfileReport["status"]): string {
  const labels: Record<RetrievalProfileReport["status"], string> = {
    optimized: "운영 가능",
    watch: "관찰 필요",
    risk: "개선 필요"
  };
  return labels[status];
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

function formatRobustnessStatus(status: string): string {
  const labels: Record<string, string> = {
    stable: "안정",
    review: "검토 필요",
    unstable: "불안정"
  };
  return labels[status] ?? status;
}

function formatRobustnessAction(action: string): string {
  const labels: Record<string, string> = {
    answer: "질문 표현이 바뀌어도 같은 근거로 답변 가능",
    review_top_sources: "상위 출처를 확인한 뒤 답변 권고",
    rewrite_query_or_add_docs: "질문 보강 또는 문서 별칭 추가 필요"
  };
  return labels[action] ?? action;
}

function formatDiagnosticMetric(check: { metric?: number; threshold?: number }): string {
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
    approval: "승인",
    incident: "장애 대응"
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
    api_error_budget: "API 오류 예산",
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
  if (id === "api_error_budget") {
    const match = fallback.match(/24시간 가용성 (\d+)%, 최악 (?:burn rate|소모율) ([^,]+), 권고 ([^.]+)\./);
    return match
      ? `24시간 가용성 ${match[1]}%, 최악 소모율 ${match[2]}, 권고 ${formatErrorBudgetRecommendation(match[3])}.`
      : fallback;
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

function formatActionPlanRecommendation(recommendation: string): string {
  const labels: Record<string, string> = {
    ship: "배포 가능",
    ship_after_review: "검토 후 배포",
    hold: "배포 보류"
  };
  return labels[recommendation] ?? recommendation;
}

function formatOperationalReason(reason: string): string {
  return reason
    .replace("Latest seed-ops-wiki evaluation passed.", "최신 seed-ops-wiki 평가가 통과했습니다.")
    .replace("Latest seed-ops-wiki evaluation is missing or failing.", "최신 seed-ops-wiki 평가가 없거나 실패했습니다.")
    .replace("No feedback has been captured yet.", "아직 저장된 피드백이 없습니다.")
    .replace("Release gate is pass.", "릴리즈 게이트가 통과 상태입니다.")
    .replace("Release gate is review.", "릴리즈 게이트가 검토 상태입니다.")
    .replace("Release gate is block.", "릴리즈 게이트가 차단 상태입니다.");
}

function formatSloLabel(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    answer_grounding: "답변 근거성",
    review_load: "검토 부하",
    tool_audit_coverage: "도구 감사 커버리지",
    eval_gate: "평가 게이트",
    api_success_rate: "API 성공률",
    api_error_budget: "API 오류 예산"
  };
  return labels[id] ?? fallback;
}

function formatSloDescription(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    answer_grounding: "평균 답변/문서 일치율이 목표치 이상이어야 합니다.",
    review_load: "사람 검토 비율이 운영자가 처리 가능한 기준 안에 있어야 합니다.",
    tool_audit_coverage: "질문은 저장된 search_documents 도구 호출로 추적돼야 합니다.",
    eval_gate: "최신 seed 평가가 설정된 품질 게이트를 통과해야 합니다.",
    api_success_rate: "최근 24시간 HTTP 요청에서 5xx 응답이 목표치 이하로 유지돼야 합니다.",
    api_error_budget: "최근 API 실패가 허용 오류 예산 안에서 소모돼야 합니다."
  };
  return labels[id] ?? fallback;
}

function formatErrorBudgetStatus(status: string): string {
  const labels: Record<string, string> = {
    healthy: "정상",
    watch: "관찰",
    page: "호출 필요",
    freeze: "배포 동결"
  };
  return labels[status] ?? status;
}

function formatErrorBudgetRecommendation(recommendation: string): string {
  const labels: Record<string, string> = {
    ship: "배포 가능",
    watch: "관찰 후 배포",
    freeze: "배포 동결"
  };
  return labels[recommendation] ?? recommendation;
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

function formatSourceReceived(source: SourceIngestResponse): string {
  if (source.provenance.received.url) {
    return source.provenance.received.url;
  }
  if (source.provenance.received.fileName) {
    return `파일: ${source.provenance.received.fileName}`;
  }
  return source.sourceType === "markdown" ? "Markdown 입력" : "텍스트 입력";
}

function formatSourceUrlGuard(source: SourceIngestResponse): string {
  if (source.provenance.safety.urlGuard === "not_applicable") {
    return "파일/텍스트";
  }
  return source.provenance.safety.privateUrlAllowed ? "내부 URL 허용" : "내부망 차단";
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

function formatDocumentSourceType(document: DocumentInventoryItem): string {
  const sourceType = document.metadata.sourceType;
  if (sourceType === "url") {
    return "URL";
  }
  if (sourceType === "pdf") {
    return "PDF";
  }
  if (sourceType === "docx") {
    return "Word";
  }
  if (sourceType === "text") {
    return "TXT";
  }
  return "Markdown";
}

function hasDocumentSourceProvenance(document: DocumentInventoryItem): boolean {
  return Boolean(document.metadata.sourceUrl || document.metadata.fileName);
}

function hasPersistedSourceProvenance(document: DocumentInventoryItem): boolean {
  return Boolean(document.metadata.sourceParser || document.metadata.sourceContentType || document.metadata.sourceExtractedHash);
}

function formatDocumentSourceOrigin(document: DocumentInventoryItem): string {
  if (document.metadata.sourceFinalUrl) {
    return document.metadata.sourceFinalUrl;
  }
  if (document.metadata.sourceUrl) {
    return document.metadata.sourceUrl;
  }
  if (document.metadata.fileName) {
    return `파일: ${document.metadata.fileName}`;
  }
  return `저장 경로: ${document.path}`;
}

function formatDocumentSourceParser(document: DocumentInventoryItem): string {
  return String(document.metadata.sourceParser ?? "frontmatter_markdown_v1");
}

function formatDocumentSourceContentType(document: DocumentInventoryItem): string {
  return String(document.metadata.sourceContentType ?? "text/markdown");
}

function formatDocumentSourceExtractedHash(document: DocumentInventoryItem): string {
  const hash = document.metadata.sourceExtractedHash;
  return typeof hash === "string" ? shortHash(hash) : "없음";
}

function formatDocumentSourceGuard(document: DocumentInventoryItem): string {
  if (document.metadata.sourceUrlGuard === "ssrf_private_network_block_v1") {
    return "내부망 차단";
  }
  return document.metadata.sourceUrlGuard === "not_applicable" ? "파일/텍스트" : "기본";
}

function formatDocumentTags(document: DocumentInventoryItem): string {
  const tags = document.metadata.tags ?? [];
  if (tags.length === 0) {
    return "없음";
  }
  return tags.slice(0, 4).join(", ");
}

function inferSourceType(fileName: string): DocumentSourceType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return "markdown";
  }
  if (lower.endsWith(".pdf")) {
    return "pdf";
  }
  if (lower.endsWith(".docx")) {
    return "docx";
  }
  return "text";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function safeUploadStem(fileName: string): string {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, "");
  return (
    stem
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56) || `document-${Date.now()}`
  );
}
