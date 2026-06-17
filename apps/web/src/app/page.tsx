"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Approval,
  AnswerTrace,
  askOpsPilot,
  AskResponse,
  createFeedback,
  DocumentInventoryItem,
  DocumentVersionHistory,
  EvaluationReport,
  getAnswerTrace,
  getDocumentVersionHistory,
  getLatestEvaluation,
  getObservabilitySummary,
  getPermissionBoundaryMatrix,
  GithubSyncResponse,
  IngestResponse,
  AgentToolDefinition,
  listDocuments,
  listAgentTools,
  listRecentToolCalls,
  listApprovals,
  ObservabilitySummary,
  PermissionBoundaryMatrix,
  previewRetrieval,
  RetrievalPreviewResponse,
  syncGithubDocuments,
  ToolCallAuditItem,
  updateApproval,
  upsertMarkdown
} from "../lib/api";

const sampleMarkdown = `---
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

const quickQuestions = [
  "E102 에러가 발생하면 어떻게 대응해야 해?",
  "정산 배치가 30분 이상 지연되면 체크리스트가 뭐야?",
  "장애 공지는 몇 분 안에 올려야 해?",
  "운영 DB에서 고객 정보를 바로 수정해도 돼?"
];

type ConsoleScreen = "ask" | "retrieval" | "documents" | "quality" | "review" | "audit";

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
    label: "Ask",
    title: "Ask operational docs",
    description: "Ask questions, inspect grounded answers, sources, traces, review reasons, and feedback."
  },
  {
    id: "retrieval",
    label: "Retrieval",
    title: "Retrieval lab",
    description: "Preview candidate chunks, score breakdown, and permission filtering before answer generation."
  },
  {
    id: "documents",
    label: "Documents",
    title: "Manage knowledge base",
    description: "Upsert Markdown, sync GitHub docs, and verify how new knowledge enters the RAG index."
  },
  {
    id: "quality",
    label: "Quality",
    title: "Quality and telemetry",
    description: "Review eval gates, document match, indexed knowledge size, tool usage, approvals, and feedback."
  },
  {
    id: "review",
    label: "Review",
    title: "Human approval queue",
    description: "Resolve sensitive operations that the agent separated from automatic execution."
  },
  {
    id: "audit",
    label: "Audit",
    title: "Tool call audit",
    description: "Inspect persisted agent tool calls, permission audit summaries, and approval handoffs."
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
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationReport | null>(null);
  const [observability, setObservability] = useState<ObservabilitySummary | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallAuditItem[]>([]);
  const [agentTools, setAgentTools] = useState<AgentToolDefinition[]>([]);
  const [retrievalPreview, setRetrievalPreview] = useState<RetrievalPreviewResponse | null>(null);
  const [retrievalLimit, setRetrievalLimit] = useState(5);
  const [ingest, setIngest] = useState<IngestResponse | null>(null);
  const [githubSync, setGithubSync] = useState<GithubSyncResponse | null>(null);
  const [indexProof, setIndexProof] = useState<IndexProof | null>(null);
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
    | "github"
    | "documents"
    | "versions"
    | "matrix"
    | "approval"
    | "audit"
    | "evaluation"
    | "observability"
    | "feedback"
    | "trace"
    | "tools"
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
      redactions: documents.reduce((sum, document) => sum + getRedactionCount(document), 0)
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
      setAnswer(nextAnswer);
      setTrace(await getAnswerTrace({ answerId: nextAnswer.answerId, teamSlugs, roles }));
      setApprovals(await listApprovals());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ask request failed");
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
      setError(requestError instanceof Error ? requestError.message : "Retrieval preview request failed");
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
      setFeedbackStatus(`Feedback saved (${feedback.rating > 0 ? "helpful" : "needs work"})`);
      setFeedbackComment("");
      setTrace(await getAnswerTrace({ answerId: answer.answerId, teamSlugs, roles }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Feedback request failed");
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
        reviewerNote: status === "approved" ? "Approved from OpsPilot web console." : "Rejected from OpsPilot web console."
      });
      setApprovals(await listApprovals());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Approval request failed");
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
      const indexedDocument = nextDocuments.find((document) => document.path === nextIngest.path) ?? nextDocuments[0] ?? null;
      setSelectedDocumentId(indexedDocument?.id ?? null);
      if (indexedDocument) {
        await loadDocumentVersions(indexedDocument.id);
      }
      await verifyIndexedDocument(nextIngest, verificationQuery);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Indexing request failed");
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
      setError(requestError instanceof Error ? requestError.message : "Index verification request failed");
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
      setQuestion("OpsPilot의 permission boundary는 어디에서 적용돼?");
      const nextDocuments = await listDocuments();
      setDocuments(nextDocuments);
      setSelectedDocumentId(
        nextDocuments.find((document) => document.path.startsWith(result.source))?.id ?? nextDocuments[0]?.id ?? null
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "GitHub sync request failed");
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
      setSelectedDocumentId((currentId) =>
        currentId && nextDocuments.some((document) => document.id === currentId) ? currentId : nextDocuments[0]?.id ?? null
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Document inventory request failed");
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
      setError(requestError instanceof Error ? requestError.message : "Document version request failed");
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
      setError(requestError instanceof Error ? requestError.message : "Permission matrix request failed");
    } finally {
      setLoading(null);
    }
  }

  async function loadEvaluation() {
    setError(null);
    setLoading("evaluation");
    try {
      setEvaluation(await getLatestEvaluation());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Evaluation request failed");
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
      setError(requestError instanceof Error ? requestError.message : "Tool call audit request failed");
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
      setError(requestError instanceof Error ? requestError.message : "Tool registry request failed");
    } finally {
      setLoading(null);
    }
  }

  async function loadObservability() {
    setError(null);
    setLoading("observability");
    try {
      setObservability(await getObservabilitySummary());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Observability request failed");
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
      setTrace(await getAnswerTrace({ answerId, teamSlugs, roles }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Answer trace request failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="appShell">
      <aside className="appRail" aria-label="OpsPilot workspace navigation">
        <div className="railBrand">
          <span className="brandMark">OP</span>
          <div>
            <strong>OpsPilot</strong>
            <p>Agent Ops</p>
          </div>
        </div>
        <nav className="railNav" aria-label="console sections">
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
          <span>Boundary</span>
          <strong>pre-ranking filter</strong>
          <p>Restricted chunks are removed before prompt context is built.</p>
        </div>
      </aside>

      <section className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">OpsPilot Console</p>
          <h1>{currentScreen.title}</h1>
          <p className="headerLead">{currentScreen.description}</p>
        </div>
        <div className="statusGroup" aria-label="system status">
          <span className="statusDot" />
          <span>API target: localhost:3000</span>
        </div>
      </header>

      <section className="metrics" aria-label="retrieval highlights">
        <Metric label="Retrieval" value="pgvector + hybrid" />
        <Metric label="Boundary" value="permission filtered" />
        <Metric label="Review" value="human approval" />
        <Metric label="Evidence" value="source citations" />
      </section>

      {error ? <div className="errorPanel">{error}</div> : null}

      <div className={`workspace ${activeScreen}`}>
        {activeScreen === "ask" ? (
        <section className="queryPanel" id="ask">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Ask</p>
              <h2>Grounded operations answer</h2>
            </div>
            {answer ? <span className={answer.needsHumanReview ? "badge review" : "badge"}>{answer.needsHumanReview ? "Review" : "Auto"}</span> : null}
          </div>

          <form onSubmit={submitQuestion} className="stack">
            <label>
              Question
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
                Team slugs
                <input value={teamSlugs} onChange={(event) => setTeamSlugs(event.target.value)} placeholder="payments" />
              </label>
              <label>
                Roles
                <input value={roles} onChange={(event) => setRoles(event.target.value)} placeholder="ops_admin, oncall" />
              </label>
            </div>

            <button className="primaryButton" disabled={loading === "ask"} type="submit">
              {loading === "ask" ? "Asking..." : "Ask OpsPilot"}
            </button>
          </form>

          <div className="answerPanel">
            <div className="answerMeta">
              <span>
                Confidence {confidencePercent}% · Match {documentAgreementPercent}%
              </span>
              <span>{answer?.toolCalls.map((tool) => `${tool.toolName}: ${tool.status}`).join(", ") ?? "No tool call yet"}</span>
            </div>
            <pre>{answer?.answer ?? "Run a question to see the grounded answer, confidence, tool calls, and sources."}</pre>
            {answer ? (
              <div className="boundaryAudit">
                <span>{answer.permissionAudit.enforcement}</span>
                <strong>{answer.permissionAudit.deniedCandidateCount} denied candidates</strong>
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
                    <span>Trace</span>
                    <strong>{trace.summary.sourceCount} sources</strong>
                  </div>
                  <div>
                    <span>Match</span>
                    <strong>{formatPercent(trace.summary.documentAgreementScore)}</strong>
                  </div>
                  <div>
                    <span>Coverage</span>
                    <strong>{formatPercent(trace.grounding.coverageRatio)}</strong>
                  </div>
                  <div>
                    <span>Context</span>
                    <strong>
                      {trace.contextPackage.estimatedTokenCount}/{trace.contextPackage.tokenBudget}
                    </strong>
                  </div>
                  <div>
                    <span>Tools</span>
                    <strong>{trace.summary.toolCallCount}</strong>
                  </div>
                  <div>
                    <span>Approvals</span>
                    <strong>{trace.summary.approvalCount}</strong>
                  </div>
                  <div>
                    <span>Duration</span>
                    <strong>{formatDuration(trace.summary.durationMs)}</strong>
                  </div>
                  <button disabled={loading === "trace"} onClick={() => loadTrace()} type="button">
                    {loading === "trace" ? "Refreshing..." : "Refresh trace"}
                  </button>
                </div>
                <div className="groundingPanel" aria-label="source grounding coverage">
                  <div className="groundingHeader">
                    <div>
                      <span>Grounding coverage</span>
                      <strong>
                        {trace.grounding.coveredAnswerTokenCount}/{trace.grounding.answerTokenCount} answer tokens
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
                        <code>{source.matchedTokens.length > 0 ? source.matchedTokens.join(" ") : "no overlap"}</code>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="contextPanel" aria-label="answer context package">
                  <div className="contextHeader">
                    <div>
                      <span>Context budget</span>
                      <strong>
                        {trace.contextPackage.includedChunkCount} included · {trace.contextPackage.omittedChunkCount} omitted
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
                        <code>{chunk.included ? "included" : chunk.reason}</code>
                        <small>{chunk.estimatedTokens}t</small>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="traceTimeline" aria-label="answer trace timeline">
                  {trace.timeline.map((event) => (
                    <article className="timelineItem" key={`${event.order}-${event.kind}-${event.title}-${event.at}`}>
                      <span>{event.kind}</span>
                      <div>
                        <strong>{event.title}</strong>
                        <p>{summarizeTraceEvent(event)}</p>
                      </div>
                      <code>{event.status}</code>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="feedbackBar">
              <input
                aria-label="feedback comment"
                disabled={!answer || loading === "feedback"}
                onChange={(event) => setFeedbackComment(event.target.value)}
                placeholder="Optional feedback comment"
                value={feedbackComment}
              />
              <button disabled={!answer || loading === "feedback"} onClick={() => submitFeedback(1)} type="button">
                Helpful
              </button>
              <button disabled={!answer || loading === "feedback"} onClick={() => submitFeedback(-1)} type="button">
                Needs work
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
              <p className="eyebrow">Sources</p>
              <h2 id="sources">Retrieved evidence</h2>
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
              <p className="empty">Sources appear here after a question.</p>
            )}
          </div>
          </>
          ) : null}

          {activeScreen === "retrieval" ? (
          <>
          <form onSubmit={submitRetrievalPreview} className="retrievalPanel">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Preview</p>
                <h2>Candidate ranking</h2>
              </div>
              {retrievalPreview ? <span className="badge">{retrievalPreview.candidates.length} candidates</span> : null}
            </div>

            <label>
              Query
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} />
            </label>
            <div className="fieldGrid">
              <label>
                Team slugs
                <input value={teamSlugs} onChange={(event) => setTeamSlugs(event.target.value)} placeholder="payments" />
              </label>
              <label>
                Roles
                <input value={roles} onChange={(event) => setRoles(event.target.value)} placeholder="ops_admin, oncall" />
              </label>
            </div>
            <label>
              Candidate limit
              <input
                max={10}
                min={1}
                onChange={(event) => setRetrievalLimit(Number(event.target.value))}
                type="number"
                value={retrievalLimit}
              />
            </label>
            <button className="secondaryButton" disabled={loading === "retrieval"} type="submit">
              {loading === "retrieval" ? "Previewing..." : "Preview retrieval"}
            </button>
          </form>

          <section className="retrievalPanel">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Boundary</p>
                <h2>Permission audit</h2>
              </div>
              {retrievalPreview ? <span className="badge">{retrievalPreview.permissionAudit.enforcement}</span> : null}
            </div>
            {retrievalPreview ? (
              <>
                <div className="retrievalStats">
                  <Metric label="Allowed" value={String(retrievalPreview.permissionAudit.allowedCandidateCount)} />
                  <Metric label="Denied" value={String(retrievalPreview.permissionAudit.deniedCandidateCount)} />
                  <Metric label="Window" value={String(retrievalPreview.permissionAudit.candidateWindow)} />
                  <Metric label="Top score" value={topRetrievalCandidate ? formatScore(topRetrievalCandidate.score) : "0.000"} />
                </div>
                <div className="opsBreakdown">
                  <span>Actor</span>
                  <code>
                    roles:{retrievalPreview.permissionAudit.actor.roles.join("|") || "none"} teams:
                    {retrievalPreview.permissionAudit.actor.teamSlugs.join("|") || "none"}
                  </code>
                  <span>Denied</span>
                  <code>{formatDeniedVisibility(retrievalPreview.permissionAudit.deniedByVisibility)}</code>
                </div>
              </>
            ) : (
              <p className="empty">Preview retrieval to verify allowed candidates, denied visibility, and enforcement mode before generating an answer.</p>
            )}
          </section>

          <section className="retrievalResults">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Evidence</p>
                <h2>Ranked chunks</h2>
              </div>
              {retrievalPreview ? <span className="badge">{retrievalPreview.limit} limit</span> : null}
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
                      <span className="badge">{candidate.visibility}</span>
                    </div>
                    <div className="scoreBars">
                      <ScoreBar label="score" value={candidate.score} />
                      <ScoreBar label="vector" value={candidate.retrieval.vectorScore ?? 0} />
                      <ScoreBar label="lexical" value={candidate.retrieval.lexicalScore ?? 0} />
                    </div>
                    <div className="candidateMeta">
                      <code>{candidate.retrieval.mode}</code>
                      <code>{candidate.heading ?? "body"}</code>
                      <code>{candidate.teamSlug ?? "public"}</code>
                    </div>
                    <p>{candidate.contentPreview}</p>
                  </article>
                ))
              ) : (
                <p className="empty">Candidate chunks appear here after a retrieval preview.</p>
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
                <p className="eyebrow">Operations</p>
                <h2>Telemetry summary</h2>
              </div>
              {observability ? <span className="badge">{observability.toolCalls.total} tools</span> : null}
              <button className="smallButton" disabled={loading === "observability"} onClick={loadObservability} type="button">
                {loading === "observability" ? "Loading..." : "Load ops"}
              </button>
            </div>
            {observability ? (
              <>
                <div className="opsGrid">
                  <Metric label="Questions" value={String(observability.questions.total)} />
                  <Metric label="Human review rate" value={formatPercent(observability.answers.humanReviewRate)} />
                  <Metric label="Avg confidence" value={formatPercent(observability.answers.averageConfidence)} />
                  <Metric label="Avg match" value={formatPercent(observability.answers.averageDocumentAgreement)} />
                  <Metric label="Approvals" value={String(observability.approvals.total)} />
                  <Metric label="Feedback" value={String(observability.feedback.total)} />
                </div>
                <div className="opsBreakdown">
                  <span>Tools</span>
                  <code>{formatCountMap(observability.toolCalls.byName)}</code>
                  <span>Status</span>
                  <code>{formatCountMap(observability.toolCalls.byStatus)}</code>
                  <span>Index</span>
                  <code>
                    {observability.documents.total} docs / {observability.documents.chunks} chunks
                  </code>
                </div>
              </>
            ) : (
              <p className="empty">Load persisted telemetry for answer quality, review boundaries, tool calls, approvals, and feedback.</p>
            )}
          </section>

          <section className="evalPanel" id="quality">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Evaluation</p>
                <h2>Quality gates</h2>
              </div>
              {evaluation ? <span className={evaluation.passed ? "badge" : "badge review"}>{evaluation.passed ? "Passed" : "Failed"}</span> : null}
              <button className="smallButton" disabled={loading === "evaluation"} onClick={loadEvaluation} type="button">
                {loading === "evaluation" ? "Loading..." : "Load eval"}
              </button>
            </div>
            {evaluation ? (
              <>
                <div className="evalGrid">
                  <Metric label="Source hit" value={formatPercent(evaluation.metrics.sourceHitRate)} />
                  <Metric label="Top source" value={formatPercent(evaluation.metrics.topSourceAccuracy)} />
                  <Metric label="Human review" value={formatPercent(evaluation.metrics.humanReviewAccuracy)} />
                  <Metric label="Document match" value={formatPercent(evaluation.metrics.documentAgreementScore)} />
                  <Metric label="Citation" value={formatPercent(evaluation.metrics.citationAccuracy)} />
                </div>
                <p className="ingestResult">
                  {evaluation.suiteName} · {evaluation.total} cases · {evaluation.rows.filter((row) => row.hit).length} hits ·{" "}
                  {formatPercent(evaluation.metrics.documentAgreementScore)} match · {formatPercent(evaluation.metrics.citationAccuracy)} citations
                </p>
                <div className="evalCaseExplorer" aria-label="evaluation case explorer">
                  {evaluation.rows.map((row) => (
                    <article className="evalCaseItem" key={row.id}>
                      <div className="evalCaseHead">
                        <div>
                          <strong>{row.id}</strong>
                          <p>
                            {row.expectedSources.join(", ")} → {row.actualSources[0] ?? "no source"}
                          </p>
                        </div>
                        <span className={row.hit ? "badge" : "badge review"}>{row.hit ? "Hit" : "Miss"}</span>
                      </div>
                      <div className="evalCaseMetrics">
                        <Metric label="Confidence" value={formatPercent(row.confidence)} />
                        <Metric label="Match" value={formatPercent(row.documentAgreement)} />
                        <Metric label="Human review" value={row.needsHumanReview ? "Yes" : "No"} />
                        <Metric label="Citation" value={row.citationPresent ? "Present" : "Missing"} />
                      </div>
                      <div className="evalSourceCompare">
                        <span>Expected</span>
                        <code>{row.expectedSources.join(" | ")}</code>
                        <span>Actual</span>
                        <code>{row.actualSources.join(" | ") || "none"}</code>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="empty">Run `pnpm eval`, then load the latest quality report.</p>
            )}
          </section>
          </>
          ) : null}

          {activeScreen === "review" ? (
          <section className="approvalPanel" id="review">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Review</p>
                <h2>Approval queue</h2>
              </div>
              <span className="badge review">Pending</span>
            </div>
            <div className="approvalList">
              {visibleApprovals.length > 0 ? (
                visibleApprovals.map((approval) => (
                  <div className="approvalItem" key={approval.id}>
                    <strong>{approval.action}</strong>
                    <p>{approval.question ?? "No linked question"}</p>
                    <div className="approvalActions">
                      <button disabled={loading === "approval"} onClick={() => resolveApproval(approval.id, "approved")} type="button">
                        Approve
                      </button>
                      <button disabled={loading === "approval"} onClick={() => resolveApproval(approval.id, "rejected")} type="button">
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty">Sensitive requests appear here after human review is required.</p>
              )}
            </div>
          </section>
          ) : null}

          {activeScreen === "audit" ? (
          <section className="auditPanel" id="audit">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Audit</p>
                <h2>Tool calls</h2>
              </div>
              <button className="smallButton" disabled={loading === "audit"} onClick={loadToolCalls} type="button">
                {loading === "audit" ? "Loading..." : "Load tools"}
              </button>
            </div>
            <section className="toolRegistry">
              <div className="sectionHeader compact">
                <div>
                  <p className="eyebrow">Registry</p>
                  <h2>Agent tool contract</h2>
                </div>
                {agentTools.length > 0 ? <span className="badge">{agentTools.length} tools</span> : null}
                <button className="smallButton" disabled={loading === "tools"} onClick={loadAgentTools} type="button">
                  {loading === "tools" ? "Loading..." : "Load registry"}
                </button>
              </div>
              {agentTools.length > 0 ? (
                <div className="toolRegistryList" aria-label="agent tool registry">
                  {agentTools.map((tool) => (
                    <article className="toolRegistryItem" key={tool.name}>
                      <div>
                        <strong>{tool.name}</strong>
                        <p>{tool.description}</p>
                      </div>
                      <span className={tool.approvalPolicy === "human_required" ? "badge review" : "badge"}>
                        {tool.approvalPolicy === "human_required" ? "Human required" : "Auto allowed"}
                      </span>
                      <div className="toolRegistryMeta">
                        <code>{tool.category}</code>
                        <code>{tool.sideEffect}</code>
                        <code>{tool.statusWhenCalled}</code>
                      </div>
                      <div className="toolSchemaGrid">
                        <span>Input</span>
                        <code>{formatSchemaMap(tool.inputSchema)}</code>
                        <span>Output</span>
                        <code>{formatSchemaMap(tool.outputSchema)}</code>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty">Load the registry to inspect tool contracts, side effects, and approval policy.</p>
              )}
            </section>
            <div className="auditList">
              {toolCalls.length > 0 ? (
                toolCalls.map((tool) => (
                  <div className="auditItem" key={tool.id}>
                    <div>
                      <strong>{tool.toolName}</strong>
                      <p>{tool.question ?? "No linked question"}</p>
                    </div>
                    <span className={tool.status === "needs_approval" ? "badge review" : "badge"}>{tool.status}</span>
                    <code>{summarizeToolOutput(tool.output)}</code>
                  </div>
                ))
              ) : (
                <p className="empty">Recent Agent tool calls appear here after a question.</p>
              )}
            </div>
          </section>
          ) : null}

          {activeScreen === "documents" ? (
          <>
          <section className="knowledgePanel">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Knowledge Base</p>
                <h2>Index inventory and chunks</h2>
              </div>
              <button className="smallButton" disabled={loading === "documents"} onClick={loadDocuments} type="button">
                {loading === "documents" ? "Loading..." : "Refresh index"}
              </button>
            </div>

            <div className="inventoryStats">
              <Metric label="Documents" value={String(documentStats.total)} />
              <Metric label="Chunks" value={String(documentStats.chunks)} />
              <Metric label="Restricted" value={String(documentStats.restricted)} />
              <Metric label="Redactions" value={String(documentStats.redactions)} />
            </div>

            {documents.length > 0 ? (
              <div className="inventoryGrid">
                <div className="documentList" aria-label="indexed documents">
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
                      <code>{document.chunkCount} chunks</code>
                    </button>
                  ))}
                </div>

                <div className="chunkInspector">
                  {selectedDocument ? (
                    <>
                      <div className="chunkHeader">
                        <div>
                          <span>{selectedDocument.visibility}</span>
                          <strong>{selectedDocument.title}</strong>
                          <p>{selectedDocument.path}</p>
                        </div>
                        <button className="smallButton" disabled={loading === "versions"} onClick={() => loadDocumentVersions()} type="button">
                          {loading === "versions" ? "Loading..." : `v${selectedDocument.latestVersion} history`}
                        </button>
                      </div>
                      <div className="securityLine">
                        <span>team: {selectedDocument.teamSlug ?? "public"}</span>
                        <span>redacted: {getRedactionCount(selectedDocument)}</span>
                        <span>hash: {selectedDocument.contentHash.slice(0, 10)}</span>
                      </div>
                      {documentVersionHistory?.document.id === selectedDocument.id ? (
                        <section className="versionPanel" aria-label="document version history">
                          <div className="versionSummary">
                            <div>
                              <span>Version history</span>
                              <strong>{documentVersionHistory.versions.length} versions</strong>
                            </div>
                            <div>
                              <span>Latest diff</span>
                              <strong>
                                {documentVersionHistory.latestDiff
                                  ? `+${documentVersionHistory.latestDiff.addedLineCount} -${documentVersionHistory.latestDiff.removedLineCount}`
                                  : "initial"}
                              </strong>
                            </div>
                            <code>{documentVersionHistory.latestDiff?.method ?? "no_previous_version"}</code>
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
                                    {version.diffFromPrevious.addedPreview[0] ?? "metadata-only change"}
                                  </small>
                                ) : (
                                  <small>Initial indexed version</small>
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
                              <span>{chunk.heading ?? "Document body"}</span>
                              <code>{chunk.contentLength} chars</code>
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
              <p className="empty">Refresh the index or upsert a Markdown document to inspect chunking output.</p>
            )}
          </section>

          <section className="permissionMatrixPanel">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Boundary Matrix</p>
                <h2>Document access simulator</h2>
              </div>
              {permissionMatrix ? <span className="badge">{permissionMatrix.documents.length} docs</span> : null}
              <button className="smallButton" disabled={loading === "matrix"} onClick={loadPermissionMatrix} type="button">
                {loading === "matrix" ? "Loading..." : "Load matrix"}
              </button>
            </div>

            {permissionMatrix ? (
              <>
                <div className="matrixSummary">
                  {permissionMatrix.summary.map((summary) => (
                    <Metric
                      key={summary.persona}
                      label={formatPersonaLabel(permissionMatrix, summary.persona)}
                      value={`${summary.allowed}/${summary.allowed + summary.denied} allowed`}
                    />
                  ))}
                </div>
                <div className="matrixTable" aria-label="permission boundary matrix">
                  <div className="matrixHeader">
                    <span>Document</span>
                    {permissionMatrix.policy.personas.map((persona) => (
                      <span key={persona.id}>{persona.label}</span>
                    ))}
                  </div>
                  {permissionMatrix.documents.slice(0, 8).map((document) => (
                    <article className="matrixRow" key={document.id}>
                      <div>
                        <strong>{document.title}</strong>
                        <p>
                          {document.path} · {document.visibility}
                          {document.teamSlug ? `:${document.teamSlug}` : ""}
                        </p>
                      </div>
                      {permissionMatrix.policy.personas.map((persona) => {
                        const decision = document.decisions.find((item) => item.persona === persona.id);
                        return (
                          <span className={decision?.allowed ? "allow" : "deny"} key={`${document.id}-${persona.id}`} title={decision?.reason}>
                            {decision?.allowed ? "Allow" : "Deny"}
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
              <p className="empty">Load the matrix to verify public, team, and restricted document access across demo personas.</p>
            )}
          </section>

          <form onSubmit={submitMarkdown} className="indexPanel" id="index">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Index</p>
                <h2>Markdown upsert</h2>
              </div>
              {ingest ? <span className="badge">{ingest.changed ? "Changed" : "Indexed"}</span> : null}
            </div>

            <label>
              Path
              <input value={path} onChange={(event) => setPath(event.target.value)} />
            </label>
            <label>
              Markdown
              <textarea value={markdown} onChange={(event) => setMarkdown(event.target.value)} rows={10} />
            </label>
            <button className="secondaryButton" disabled={loading === "ingest"} type="submit">
              {loading === "ingest" ? "Indexing..." : "Upsert and verify RAG"}
            </button>
            <button className="smallButton" disabled={!ingest || loading === "verify"} onClick={() => verifyIndexedDocument()} type="button">
              {loading === "verify" ? "Verifying..." : "Verify indexed document"}
            </button>
            {ingest ? (
              <p className="ingestResult">
                {ingest.title} indexed as {ingest.chunks} chunks.
              </p>
            ) : null}
            {indexProof ? (
              <section className={indexProof.sourceHit ? "indexProof" : "indexProof warning"} aria-label="index verification proof">
                <div className="sectionHeader compact">
                  <div>
                    <p className="eyebrow">Proof</p>
                    <h2>{indexProof.sourceHit ? "Indexed doc is retrievable" : "Top source mismatch"}</h2>
                  </div>
                  <span className={indexProof.sourceHit ? "badge" : "badge review"}>{indexProof.sourceHit ? "Source hit" : "Review"}</span>
                </div>
                <div className="proofGrid">
                  <Metric label="Chunks" value={String(indexProof.chunkCount)} />
                  <Metric label="Top score" value={indexProof.topScore === null ? "n/a" : formatScore(indexProof.topScore)} />
                  <Metric label="Answer match" value={formatPercent(indexProof.documentAgreement)} />
                  <Metric label="Confidence" value={formatPercent(indexProof.confidence)} />
                </div>
                <div className="proofDetails">
                  <span>query</span>
                  <code>{indexProof.query}</code>
                  <span>expected</span>
                  <code>{indexProof.path}</code>
                  <span>top source</span>
                  <code>{indexProof.topSourcePath ?? "none"}</code>
                  <span>answer</span>
                  <code>{indexProof.answerId}</code>
                </div>
              </section>
            ) : null}
          </form>

          <form onSubmit={submitGithubSync} className="indexPanel">
            <div className="sectionHeader compact">
              <div>
                <p className="eyebrow">Sync</p>
                <h2>GitHub Markdown</h2>
              </div>
              {githubSync ? <span className="badge">{githubSync.documents.length} docs</span> : null}
            </div>

            <div className="fieldGrid compactFields">
              <label>
                Owner
                <input value={githubOwner} onChange={(event) => setGithubOwner(event.target.value)} />
              </label>
              <label>
                Repo
                <input value={githubRepo} onChange={(event) => setGithubRepo(event.target.value)} />
              </label>
            </div>
            <div className="fieldGrid compactFields">
              <label>
                Branch
                <input value={githubBranch} onChange={(event) => setGithubBranch(event.target.value)} />
              </label>
              <label>
                Root path
                <input value={githubRootPath} onChange={(event) => setGithubRootPath(event.target.value)} />
              </label>
            </div>
            <label>
              Source prefix
              <input value={githubSourcePrefix} onChange={(event) => setGithubSourcePrefix(event.target.value)} />
            </label>
            <button className="secondaryButton" disabled={loading === "github"} type="submit">
              {loading === "github" ? "Syncing..." : "Sync GitHub docs"}
            </button>
            {githubSync ? (
              <p className="ingestResult">
                Synced {githubSync.documents.length} Markdown docs from {githubSync.owner}/{githubSync.repo}.
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

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function summarizeToolOutput(output: Record<string, unknown>): string {
  if (typeof output.sourceCount === "number") {
    const permissionAudit = output.permissionAudit as { deniedCandidateCount?: unknown } | undefined;
    const denied =
      permissionAudit && typeof permissionAudit.deniedCandidateCount === "number"
        ? `, ${permissionAudit.deniedCandidateCount} denied`
        : "";
    return `${output.sourceCount} sources${denied}`;
  }
  if (typeof output.approvalStatus === "string") {
    return `approval ${output.approvalStatus}`;
  }
  if (typeof output.itemCount === "number") {
    return `${output.itemCount} checklist items`;
  }
  return "logged";
}

function summarizeTraceEvent(event: AnswerTrace["timeline"][number]): string {
  if (event.kind === "retrieval") {
    const sourceCount = typeof event.detail.sourceCount === "number" ? event.detail.sourceCount : 0;
    const topSource = typeof event.detail.topSource === "string" ? event.detail.topSource : "none";
    return `${sourceCount} sources · top ${topSource}`;
  }

  if (event.kind === "answer") {
    const confidence = typeof event.detail.confidence === "number" ? formatPercent(event.detail.confidence) : "n/a";
    const match = typeof event.detail.documentAgreementScore === "number" ? formatPercent(event.detail.documentAgreementScore) : "n/a";
    const duration = typeof event.detail.durationMs === "number" ? formatDuration(event.detail.durationMs) : "n/a";
    return `confidence ${confidence} · match ${match} · ${duration}`;
  }

  if (event.kind === "tool") {
    const output = event.detail.output && typeof event.detail.output === "object" ? (event.detail.output as Record<string, unknown>) : {};
    return summarizeToolOutput(output);
  }

  if (event.kind === "approval") {
    const reason = event.detail.reason && typeof event.detail.reason === "object" ? (event.detail.reason as Record<string, unknown>) : {};
    return typeof reason.policy === "string" ? reason.policy : "human approval boundary";
  }

  if (event.kind === "feedback") {
    return typeof event.detail.comment === "string" && event.detail.comment ? event.detail.comment : "rating recorded";
  }

  return typeof event.detail.question === "string" ? event.detail.question : "question received";
}

function formatDeniedVisibility(deniedByVisibility: Record<string, number>): string {
  const entries = Object.entries(deniedByVisibility);
  if (entries.length === 0) {
    return "no denied visibility";
  }

  return entries.map(([visibility, count]) => `${visibility}:${count}`).join(" ");
}

function formatPersonaLabel(matrix: PermissionBoundaryMatrix, personaId: string): string {
  return matrix.policy.personas.find((persona) => persona.id === personaId)?.label ?? personaId;
}

function formatCountMap(values: Record<string, number>): string {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([key, value]) => `${key}:${value}`).join(" ");
}

function formatSchemaMap(values: Record<string, string>): string {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([key, value]) => `${key}:${value}`).join(" ");
}

function formatReviewReasonCode(code: AskResponse["reviewReasons"][number]["code"]): string {
  return code.replace(/_/g, " ");
}

function getRedactionCount(document: DocumentInventoryItem): number {
  return typeof document.metadata.security?.redactionCount === "number" ? document.metadata.security.redactionCount : 0;
}
