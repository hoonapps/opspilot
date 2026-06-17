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
- `GET /documents`
- `POST /documents/markdown`
- `POST /documents/github/sync`
- `POST /documents/indexing-jobs/markdown`
- `GET /documents/indexing-jobs/{id}`
- `GET /answers/{id}/trace`
- `GET /tool-calls/recent`
- `GET /approvals`
- `PATCH /approvals/{id}`
- `POST /feedback`
- `GET /evaluations/latest`
- `GET /observability/summary`
- `GET /health`
- `GET /health/ready`
- `POST /slack/events`

It also verifies request schemas for the main write paths and confirms the `x-opspilot-actor-token` API key security scheme is present.

## Why It Matters

This keeps the public API contract from silently drifting while the RAG agent grows. A reviewer can inspect `/docs` for manual testing, while CI proves that key operations and DTO schemas still exist.

`POST /retrieval/preview` is intentionally part of the public contract because the portfolio demo needs to prove retrieval behavior before answer generation. It returns ranked candidates, vector/lexical/fused score details, content previews, actor context, and aggregate permission audit while avoiding question persistence and raw embedding exposure.

`GET /documents` is intentionally part of the public contract because the portfolio demo needs to prove indexing state, not just final answers. It exposes document inventory and chunk previews for verification while keeping raw embeddings internal.
