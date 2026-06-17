# API Contract

OpsPilot exposes Swagger UI at:

```txt
GET /docs
```

The generated OpenAPI JSON is available at:

```txt
GET /docs-json
```

## Contract Gate

`pnpm openapi:smoke` generates the same OpenAPI document used by the running API and verifies the portfolio-critical API surface:

- `POST /ask`
- `POST /retrieval/preview`
- `GET /permission-boundary/matrix`
- `GET /documents`
- `GET /documents/{id}/versions`
- `POST /documents/markdown`
- `POST /documents/github/sync`
- `POST /documents/indexing-jobs/markdown`
- `GET /documents/indexing-jobs/{id}`
- `GET /answers/{id}/trace`
- `GET /answers/{id}/proof`
- `GET /answers/{id}/replay`
- `GET /tool-calls/registry`
- `GET /tool-calls/recent`
- `GET /approvals`
- `PATCH /approvals/{id}`
- `POST /feedback`
- `GET /evaluations/latest`
- `GET /evaluations/history`
- `GET /observability/summary`
- `GET /observability/slo`
- `GET /observability/release-gate`
- `GET /health`
- `GET /health/ready`
- `POST /slack/events`
- `POST /slack/simulate`

It also verifies request schemas for the main write paths and confirms the `x-opspilot-actor-token` API key security scheme is present.

## Why It Matters

This keeps the public API contract from silently drifting while the RAG agent grows. A reviewer can inspect `/docs` for manual testing, while CI proves that key operations and DTO schemas still exist.

`POST /retrieval/preview` is intentionally part of the public contract because the portfolio demo needs to prove retrieval behavior before answer generation. It returns ranked candidates, vector/lexical/fused score details, content previews, actor context, and aggregate permission audit while avoiding question persistence and raw embedding exposure.

`GET /permission-boundary/matrix` is intentionally part of the public contract because the portfolio demo needs to prove access policy independently from answer generation. It evaluates indexed documents against demo personas using the same authorization function as retrieval.

`GET /documents` is intentionally part of the public contract because the portfolio demo needs to prove indexing state, not just final answers. It exposes document inventory and chunk previews for verification while keeping raw embeddings internal.

`GET /documents/{id}/versions` is intentionally part of the public contract because changed operational docs need an audit trail. It exposes redacted version previews, hashes, and line-level diff summaries without exposing embeddings.

`GET /answers/{id}/proof` is intentionally part of the public contract because a grounded answer needs an operator-readable evidence packet, not only raw trace rows. It reuses the same source access re-check as answer trace and returns pass/warn/fail checks for source attachment, document agreement, grounding coverage, search tool audit, approval boundary, context budget, and feedback capture.

`GET /answers/{id}/replay` is intentionally part of the public contract because old AI answers become risky after the wiki changes. It reruns retrieval with the original question under the caller's current permissions and returns top-source drift, source overlap, current document agreement, current sources, and permission-denied candidate counts.

`GET /tool-calls/registry` is intentionally part of the public contract because the portfolio demo needs to prove tool-calling structure, not only log rows. It exposes tool side effects, approval policy, and compact input/output schemas.

`GET /evaluations/history` is intentionally part of the public contract because RAG quality needs regression visibility across runs. It exposes recent evaluation snapshots, pass/fail state, metric gates, and previous-run deltas without requiring a reviewer to inspect database rows.

`GET /observability/slo` is intentionally part of the public contract because AI operations quality should be inspectable as SLOs, not only raw counters. It exposes objective status, targets, actual values, error budget remaining, metric source, and evaluation gate health.

`GET /observability/release-gate` is intentionally part of the public contract because a reviewer needs one deploy-style readiness answer. It combines dependency readiness, indexed knowledge size, latest eval state, SLO guardrails, agent audit trail, approval backlog, and feedback signal into `pass`, `review`, or `block`.

`POST /slack/simulate` is intentionally part of the public contract because the portfolio demo needs a reproducible Slack flow without live Slack credentials. It runs the same app mention handling path as `POST /slack/events`, returns the thread reply payload, and exposes a trace with actor mapping, persisted question/answer ids, sources, tool calls, and reply post mode.
