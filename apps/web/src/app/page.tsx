"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Approval,
  AnswerTrace,
  askOpsPilot,
  AskResponse,
  createFeedback,
  DocumentInventoryItem,
  EvaluationReport,
  getAnswerTrace,
  getLatestEvaluation,
  getObservabilitySummary,
  GithubSyncResponse,
  IngestResponse,
  listDocuments,
  listRecentToolCalls,
  listApprovals,
  ObservabilitySummary,
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

type ConsoleScreen = "ask" | "documents" | "quality" | "review" | "audit";

const screens: Array<{ id: ConsoleScreen; label: string; title: string; description: string }> = [
  {
    id: "ask",
    label: "Ask",
    title: "Ask operational docs",
    description: "Ask questions, inspect grounded answers, sources, traces, review reasons, and feedback."
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
  const [ingest, setIngest] = useState<IngestResponse | null>(null);
  const [githubSync, setGithubSync] = useState<GithubSyncResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentInventoryItem[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<
    | "ask"
    | "ingest"
    | "github"
    | "documents"
    | "approval"
    | "audit"
    | "evaluation"
    | "observability"
    | "feedback"
    | "trace"
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
      setQuestion("고객 공지 SLA와 15분 공지 기준은 무엇이야?");
      const nextDocuments = await listDocuments();
      setDocuments(nextDocuments);
      setSelectedDocumentId(nextDocuments.find((document) => document.path === nextIngest.path)?.id ?? nextDocuments[0]?.id ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Indexing request failed");
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
              <div className="tracePanel">
                <div>
                  <span>Trace</span>
                  <strong>{trace.sources.length} sources</strong>
                </div>
                <div>
                  <span>Match</span>
                  <strong>{documentAgreementPercent}%</strong>
                </div>
                <div>
                  <span>Tools</span>
                  <strong>{trace.toolCalls.length}</strong>
                </div>
                <div>
                  <span>Approvals</span>
                  <strong>{trace.approvals.length}</strong>
                </div>
                <div>
                  <span>Feedback</span>
                  <strong>{trace.feedback.length}</strong>
                </div>
                <button disabled={loading === "trace"} onClick={() => loadTrace()} type="button">
                  {loading === "trace" ? "Refreshing..." : "Refresh trace"}
                </button>
              </div>
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
                      onClick={() => setSelectedDocumentId(document.id)}
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
                        <code>v{selectedDocument.latestVersion}</code>
                      </div>
                      <div className="securityLine">
                        <span>team: {selectedDocument.teamSlug ?? "public"}</span>
                        <span>redacted: {getRedactionCount(selectedDocument)}</span>
                        <span>hash: {selectedDocument.contentHash.slice(0, 10)}</span>
                      </div>
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
              {loading === "ingest" ? "Indexing..." : "Upsert document"}
            </button>
            {ingest ? (
              <p className="ingestResult">
                {ingest.title} indexed as {ingest.chunks} chunks.
              </p>
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

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
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

function formatDeniedVisibility(deniedByVisibility: Record<string, number>): string {
  const entries = Object.entries(deniedByVisibility);
  if (entries.length === 0) {
    return "no denied visibility";
  }

  return entries.map(([visibility, count]) => `${visibility}:${count}`).join(" ");
}

function formatCountMap(values: Record<string, number>): string {
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
