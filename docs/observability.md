# Observability

OpsPilot exposes an operational summary endpoint for portfolio demos and smoke tests:

```txt
GET /observability/summary
GET /observability/slo
GET /observability/release-gate
```

The endpoint aggregates persisted runtime data from PostgreSQL:

- question volume and last-24-hour activity
- answer volume, human review count, human review rate, average confidence, and average document agreement
- tool call totals grouped by tool name and status
- approval queue totals grouped by status
- feedback totals, helpful count, needs-work count, and average rating
- indexed document and chunk counts

This is intentionally separate from `/health/ready`. Readiness proves dependencies are reachable. Observability proves the agent workflow leaves enough operational evidence to inspect quality, approval boundaries, and tool usage after questions are answered.

`GET /observability/slo` turns the same persisted evidence into operator-facing guardrails:

- answer grounding: average document agreement must stay above the configured target
- review load: human review rate must stay within the configured capacity target
- tool audit coverage: questions should have persisted `search_documents` tool calls
- evaluation gate: the latest seed evaluation must pass

Each SLO objective returns actual value, target, operator, status, source table family, window, and remaining error budget. Defaults can be tuned with `SLO_MIN_DOCUMENT_AGREEMENT`, `SLO_MAX_HUMAN_REVIEW_RATE`, and `SLO_MIN_TOOL_AUDIT_COVERAGE`.

`GET /observability/release-gate` is the operator-level gate above raw telemetry and SLOs. It returns `pass`, `review`, or `block` by checking dependency readiness, indexed knowledge size, the latest seed evaluation, knowledge freshness, SLO status, agent audit trail, pending approval backlog, and feedback signal. Defaults can be tuned with `RELEASE_MIN_DOCUMENTS`, `RELEASE_MIN_CHUNKS`, and `RELEASE_MAX_PENDING_APPROVALS`.

The knowledge freshness check compares the latest `seed-ops-wiki` evaluation timestamp with the newest indexed document `updated_at`. If a document was added or changed after the latest evaluation, the release gate moves to review with `knowledge_freshness=warn` until the evaluation suite is rerun. This proves that a portfolio demo is not showing stale RAG quality after a wiki update.

Run the smoke test:

```bash
pnpm observability:smoke
pnpm observability:slo-smoke
pnpm freshness:smoke
pnpm release-gate:smoke
```

The Next.js console renders the same data in the Operations panel. `pnpm web:smoke` loads this panel during the browser demo and fails unless the page shows release gate checks, human review rate, average document match, SLO guardrails, `request_human_approval`, and `needs_approval` telemetry.

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

The SLO smoke test creates representative agent activity, runs the seed evaluation, then fails unless grounding, review load, tool audit coverage, and evaluation gate objectives are all `ok`. This turns RAG quality from a one-off report into a CI-protected operating contract.

The freshness smoke test ingests seed documents, runs evaluation, verifies `knowledge_freshness=pass`, inserts a new Markdown document, verifies `knowledge_freshness=warn`, reruns evaluation, then verifies the gate recovers to `pass`.

The release gate smoke test creates representative agent activity, captures feedback, runs the seed evaluation, then fails if dependency readiness, indexed knowledge, latest eval, knowledge freshness, SLO guardrails, or agent audit evidence would block a release.
