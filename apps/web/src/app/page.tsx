"use client";

import { FormEvent, useMemo, useState } from "react";
import { askOpsPilot, AskResponse, IngestResponse, upsertMarkdown } from "../lib/api";

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

export default function Home() {
  const [question, setQuestion] = useState(quickQuestions[0]);
  const [teamSlugs, setTeamSlugs] = useState("payments");
  const [roles, setRoles] = useState("");
  const [path, setPath] = useState("public/status-page-policy.md");
  const [markdown, setMarkdown] = useState(sampleMarkdown);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [ingest, setIngest] = useState<IngestResponse | null>(null);
  const [loading, setLoading] = useState<"ask" | "ingest" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confidencePercent = useMemo(() => Math.round((answer?.confidence ?? 0) * 100), [answer]);

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading("ask");
    try {
      setAnswer(await askOpsPilot({ question, teamSlugs, roles }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ask request failed");
    } finally {
      setLoading(null);
    }
  }

  async function submitMarkdown(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading("ingest");
    try {
      setIngest(await upsertMarkdown({ path, markdown }));
      setQuestion("장애 공지는 몇 분 안에 올려야 해?");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Indexing request failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">OpsPilot Console</p>
          <h1>Operational RAG agent control surface</h1>
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

      <div className="workspace">
        <section className="queryPanel">
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
                <input value={roles} onChange={(event) => setRoles(event.target.value)} placeholder="admin, oncall" />
              </label>
            </div>

            <button className="primaryButton" disabled={loading === "ask"} type="submit">
              {loading === "ask" ? "Asking..." : "Ask OpsPilot"}
            </button>
          </form>

          <div className="answerPanel">
            <div className="answerMeta">
              <span>Confidence {confidencePercent}%</span>
              <span>{answer?.toolCalls.map((tool) => `${tool.toolName}: ${tool.status}`).join(", ") ?? "No tool call yet"}</span>
            </div>
            <pre>{answer?.answer ?? "Run a question to see the grounded answer, confidence, tool calls, and sources."}</pre>
          </div>
        </section>

        <aside className="sidePanel">
          <div className="sectionHeader compact">
            <div>
              <p className="eyebrow">Sources</p>
              <h2>Retrieved evidence</h2>
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

          <form onSubmit={submitMarkdown} className="indexPanel">
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
        </aside>
      </div>
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
