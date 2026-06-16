# Observability

OpsPilot exposes an operational summary endpoint for portfolio demos and smoke tests:

```txt
GET /observability/summary
```

The endpoint aggregates persisted runtime data from PostgreSQL:

- question volume and last-24-hour activity
- answer volume, human review count, human review rate, average confidence, and average document agreement
- tool call totals grouped by tool name and status
- approval queue totals grouped by status
- feedback totals, helpful count, needs-work count, and average rating
- indexed document and chunk counts

This is intentionally separate from `/health/ready`. Readiness proves dependencies are reachable. Observability proves the agent workflow leaves enough operational evidence to inspect quality, approval boundaries, and tool usage after questions are answered.

Run the smoke test:

```bash
pnpm observability:smoke
```

The smoke test ingests the seed wiki, asks a normal incident question, asks a runbook question, asks a sensitive production operation question, writes feedback, then fails unless the summary shows:

- at least three questions and answers
- at least one human-review answer
- positive average confidence and document agreement
- `search_documents`, `create_runbook_checklist`, and `request_human_approval` tool calls
- `allowed` and `needs_approval` tool statuses
- a pending approval request
- helpful feedback
- indexed documents and chunks

This gives reviewers one compact proof that OpsPilot is not only returning answers, but also producing the operational telemetry needed to run an AI support agent safely.
