# OpsPilot

[![CI](https://github.com/hoonapps/opspilot/actions/workflows/ci.yml/badge.svg)](https://github.com/hoonapps/opspilot/actions/workflows/ci.yml)

Permission-aware RAG agent for operational knowledge, runbooks, and Slack support workflows.

![OpsPilot dashboard preview](docs/assets/opspilot-dashboard.svg)

![OpsPilot web console](docs/assets/opspilot-web-console.png)

OpsPilot is a portfolio-grade AI agent project focused on operational support. It answers questions from Markdown wiki documents, returns grounded sources, applies document-level permission boundaries before retrieval results reach the LLM layer, logs tool calls, and marks sensitive work for human approval.

## Demo Proof

The screenshot above is generated from the working Next.js console by `pnpm web:smoke`. It exercises the core portfolio flow end to end:

- render an Open Design-inspired operations dashboard shell with workspace rail, screen list navigation, KPI strip, evidence panel, quality gates, approval queue, audit feed, and a dedicated document management screen
- load evaluation metrics, document match gates, and case-level expected-vs-actual source comparisons
- load operational telemetry for questions, human review rate, document match, tool calls, approvals, feedback, and indexed knowledge
- upsert and update a Markdown document, inspect index inventory, version diff, and chunk previews, then verify the indexed document through retrieval preview plus a grounded answer
- preview retrieval ranking before answer generation with vector/lexical scores and permission-denied candidate counts
- ask a sensitive operations question and force human approval
- show permission audit counts, role/team boundary matrix, review reasons, answer trace, source grounding coverage, tool calls, feedback, and approval queue state

Design and demo assets are tracked in [docs/design.md](docs/design.md).

## Why This Project Exists

Most RAG demos stop at document upload and answer generation. OpsPilot focuses on the production questions that matter for an AI operations agent:

- Can the agent answer with traceable document sources?
- Can restricted documents be excluded before prompt construction?
- Can role/team policy decisions be simulated per document without asking the LLM?
- Can sensitive operations be separated into human approval?
- Can tool calls be audited after the answer is generated?
- Can new or changed documents be re-indexed, retrieved as top evidence, and evaluated?
- Can document versions and diffs prove what changed before retrieval behavior changes?
- Can retrieval ranking be debugged before answer generation?
- Can retrieval quality be measured and debugged against expected source documents case by case?

## Stack

- Backend: NestJS, TypeScript
- ORM: MikroORM, not Prisma
- Database: PostgreSQL with pgvector on `localhost:25432`
- Queue/cache: Redis and BullMQ indexing worker
- Search target: Elasticsearch optional local profile for hybrid BM25 + vector search
- AI layer: local deterministic mode by default, OpenAI and Anthropic chat adapters, OpenAI embedding adapter
- Integration target: Slack Bot
- Web console: Next.js
- Infra: Docker Compose for local services and production demo containers

## Local Quick Start

```bash
pnpm install
cp .env.example apps/api/.env
docker compose up -d postgres redis
pnpm --filter @opspilot/api db:migrate
pnpm ingest
pnpm dev:api
```

Run the web console in another terminal:

```bash
pnpm dev:web
```

Ask a question:

```bash
curl -X POST http://localhost:3000/ask \
  -H "content-type: application/json" \
  -H "x-team-slugs: payments" \
  -d '{"question":"E102 에러가 발생하면 어떻게 대응해야 해?"}'
```

Simulate a Slack mention without Slack credentials:

```bash
pnpm slack:simulate
```

Run evaluation:

```bash
pnpm eval
```

`pnpm eval` is a real quality gate. It exits non-zero when source hit, top source, human review, or document agreement drops below the configured threshold.
Review workflow checks also assert that sensitive requests return structured `reviewReasons`, so the human approval boundary is explainable instead of being a bare boolean.

Run the compact portfolio demo report:

```bash
pnpm portfolio:demo
```

This single command proves grounded RAG, new document indexing, runbook tool calling, human approval separation, and answer trace reconstruction. Details: [docs/demo.md](docs/demo.md)

Generate a checked-in Markdown proof report with the same assertions:

```bash
pnpm portfolio:report
```

The latest generated report lives at [docs/demo-report.md](docs/demo-report.md).

Verify that a persisted answer can be reconstructed for audit from sources, source-level grounding coverage, tool calls, approvals, and feedback, while unauthorized trace reads are denied:

```bash
pnpm trace:smoke
```

Verify the operational telemetry summary for answers, document agreement, tool calls, approvals, feedback, and indexed knowledge:

```bash
pnpm observability:smoke
```

Verify the public OpenAPI contract:

```bash
pnpm openapi:smoke
```

Swagger UI is available at `/docs`, and OpenAPI JSON is available at `/docs-json`. Details: [docs/api.md](docs/api.md)

Verify that the quality gate fails on a deliberately bad expected source:

```bash
pnpm eval:gate-smoke
```

Prove that a newly added Markdown document is indexed and becomes the top source:

```bash
pnpm indexing:smoke
```

Verify that inaccessible RAG candidates are denied before they become prompt sources:

```bash
pnpm permission:smoke
```

Verify that signed actor tokens are required when `OPSPILOT_ACTOR_TOKEN_SECRET` is enabled:

```bash
pnpm authn:smoke
```

Verify that Markdown ingestion redacts secrets before storage, indexing, answers, and trace previews:

```bash
pnpm redaction:smoke
```

Verify production readiness checks for PostgreSQL, Redis, and optional Elasticsearch:

```bash
pnpm readiness:smoke
```

Verify that each answer exposes and persists a source document agreement score:

```bash
pnpm agreement:smoke
```

Verify that a runbook question triggers structured checklist tool calling:

```bash
pnpm checklist:smoke
```

Verify GitHub Markdown sync indexing with an offline fixture:

```bash
pnpm github:smoke
```

Verify that a BullMQ worker processes a queued Markdown indexing job:

```bash
pnpm queue:smoke
```

Run the long-lived indexing worker:

```bash
pnpm worker:indexing
```

With the API and web console running, verify the browser flow, GitHub sync UI, and refresh the README screenshot:

```bash
pnpm web:smoke
```

Verify the review workflow without a browser:

```bash
pnpm review:smoke
```

CI runs the same core gates on GitHub Actions:

```bash
pnpm typecheck
pnpm build
pnpm docker:build
pnpm docker:prod:smoke
pnpm eval
pnpm eval:gate-smoke
pnpm permission:smoke
pnpm authn:smoke
pnpm redaction:smoke
pnpm readiness:smoke
pnpm agreement:smoke
pnpm checklist:smoke
pnpm github:smoke
pnpm indexing:smoke
pnpm queue:smoke
pnpm review:smoke
pnpm trace:smoke
pnpm portfolio:demo
pnpm portfolio:report
pnpm observability:smoke
pnpm openapi:smoke
pnpm web:smoke
```

Expected seed result:

```json
{
  "sourceHitRate": 1,
  "topSourceAccuracy": 1,
  "humanReviewAccuracy": 1,
  "documentAgreementScore": 1,
  "citationAccuracy": 1,
  "passed": true
}
```

Default evaluation thresholds:

```txt
EVAL_MIN_SOURCE_HIT_RATE=1
EVAL_MIN_TOP_SOURCE_ACCURACY=1
EVAL_MIN_HUMAN_REVIEW_ACCURACY=1
EVAL_MIN_DOCUMENT_AGREEMENT_SCORE=0.8
EVAL_MIN_CITATION_ACCURACY=1
```

Optional Elasticsearch hybrid search demo:

```bash
docker compose --profile search up -d
ENABLE_ELASTICSEARCH=true RETRIEVAL_MODE=hybrid pnpm ingest
ENABLE_ELASTICSEARCH=true RETRIEVAL_MODE=hybrid pnpm dev:api
```

PostgreSQL is exposed on `localhost:25432`, Elasticsearch on `localhost:29200`, and Redis on `localhost:26379` to avoid common local development port conflicts.

Elasticsearch is intentionally optional. The core RAG path uses PostgreSQL + pgvector first, then hybrid mode adds BM25 lexical retrieval for error codes, API paths, log keys, and exact operational terms. Elasticsearch hits are never trusted directly for authorization; the API reloads returned chunk ids through PostgreSQL with the same permission filter before answer generation.

Production-style Docker demo:

```bash
pnpm docker:prod
```

This builds and runs API, web, worker, PostgreSQL, and Redis containers. Details: [docs/deployment.md](docs/deployment.md)

Verify the production compose profile on isolated demo ports:

```bash
pnpm docker:prod:smoke
```

The smoke script builds the production targets, starts API/web/worker/PostgreSQL/Redis on isolated default smoke ports, waits for `/health/ready`, checks the web console, sends a real `/ask` request, and then tears down containers and volumes.

Optional OpenAI mode:

```bash
AI_PROVIDER=openai \
OPENAI_API_KEY=... \
OPENAI_CHAT_MODEL=gpt-4.1-mini \
OPENAI_EMBEDDING_MODEL=text-embedding-3-small \
OPENAI_EMBEDDING_DIMENSIONS=64 \
pnpm ingest
```

Optional Anthropic chat mode:

```bash
AI_PROVIDER=anthropic \
ANTHROPIC_API_KEY=... \
ANTHROPIC_CHAT_MODEL=claude-3-5-haiku-latest \
pnpm dev:api
```

Without provider keys, OpsPilot uses deterministic local embeddings and a grounded local answer generator so the project remains fully reproducible.

## Current MVP

- Markdown seed document ingestion
- Chunking and deterministic local embedding
- pgvector similarity search
- `/ask` API
- Source citation response
- Runtime Markdown document upsert API
- Document version history and diff API
- GitHub Markdown sync API
- BullMQ queued Markdown indexing API and worker
- Optional signed actor token authentication boundary
- Markdown secret redaction before document version storage, chunk storage, embedding, and Elasticsearch indexing
- Liveness and readiness endpoints for PostgreSQL, Redis, and optional Elasticsearch
- Permission-aware retrieval filtering
- Permission boundary matrix API for simulating document access across anonymous, team, ops admin, and security admin personas
- Permission boundary audit counts for denied retrieval candidates
- Per-answer document agreement score
- Sensitive action detection
- Structured review reasons for low confidence, missing sources, and sensitive actions
- Tool call logs and recent audit API
- Permission-checked answer trace API for reconstructing a persisted answer's timeline, sources, source-level grounding coverage, tool calls, approvals, and feedback
- Operational observability summary API for questions, answers, document agreement, tool calls, approvals, feedback, and indexed knowledge size
- Runbook checklist tool calling
- Human approval request creation for sensitive work
- Approval queue API and feedback logging API
- Evaluation script with quality thresholds, expected source hit rate, document agreement score, citation accuracy, and negative gate smoke
- Latest evaluation API and web quality gate plus case explorer panel
- New document indexing smoke test
- Next.js web console with separate Ask, Retrieval, Documents, Quality, Review, and Audit screens for asking questions, previewing retrieval ranking, inspecting operational telemetry, syncing GitHub Markdown, upserting Markdown documents, reviewing version diffs, verifying indexed documents through retrieval and answer agreement, reviewing permission boundary matrix, index inventory, and chunk previews, saving feedback, and resolving approval requests
- Open Design-inspired console shell with design artifact documentation tying the product board and real browser screenshot to the demo path

## Implementation Status

Done:

- NestJS API monorepo scaffold
- MikroORM PostgreSQL entities and initial migration
- PostgreSQL + pgvector Docker setup
- Redis Docker setup for BullMQ queue work
- Multi-target Dockerfile for API, web, and worker production demo containers
- Production Docker Compose overlay for API, web, worker, PostgreSQL, and Redis
- Production compose smoke test covering API readiness, web availability, and a real grounded `/ask` request
- Optional Elasticsearch Docker profile for later hybrid search
- Markdown seed document ingestion
- Local deterministic embedding and pgvector retrieval
- Provider adapter package with local embedding, OpenAI chat/embedding, and Anthropic chat support
- Optional Elasticsearch BM25 indexing
- Hybrid retrieval with vector + lexical rank fusion
- `/ask` API with source citations
- Optional signed actor token authentication boundary
- `/health` liveness and `/health/ready` dependency readiness checks
- Permission-aware retrieval filtering
- Permission boundary matrix endpoint and web simulator for public/team/restricted policy decisions
- Permission boundary smoke test and web audit summary
- Signed actor token smoke test for missing, tampered, expired, and valid tokens
- Secret redaction smoke test proving raw tokens do not appear in stored chunks, document versions, answers, or answer trace previews
- Readiness smoke test for PostgreSQL, Redis, and optional Elasticsearch state
- Per-answer document agreement score in `/ask`, answer metadata, the web console, and CI smoke tests
- Configurable confidence threshold
- Sensitive action detection and approval request records
- Structured `reviewReasons` in `/ask`, answer metadata, Slack replies, and the web console
- Approval list/update API and feedback create API
- Tool call logging and recent audit API
- `GET /answers/:id/trace` answer trace API with timeline summary, source-level grounding coverage, and document access re-check
- `create_runbook_checklist` tool call for runbook questions
- Slack Events API endpoint and local app mention simulator
- Evaluation command with CI-failing quality thresholds, expected source hit rate, deterministic document agreement score, citation accuracy, and negative gate smoke
- Latest evaluation API and web console quality gate plus expected-vs-actual case explorer
- Runtime Markdown document upsert API and indexing smoke test
- Document version history endpoint and line-level diff summary for changed Markdown
- GitHub Markdown sync API and offline sync smoke test
- BullMQ indexing queue, worker CLI, job status API, and queue smoke test
- Review workflow smoke test
- Answer trace smoke test
- Portfolio demo report covering grounded RAG, new document indexing, runbook tool calling, human approval, and answer trace reconstruction
- Markdown portfolio proof report generated from the live demo assertions
- Observability smoke test proving operational telemetry aggregation
- OpenAPI contract smoke test for the public API surface and request schemas
- Next.js web console and Playwright smoke test with screen navigation, retrieval preview, score breakdown, denied candidate audit, document management, permission boundary matrix, index inventory, version diff, chunk preview, indexed-document proof, security summary, evaluation metrics, eval case explorer, operational telemetry, answer-level document match, source grounding coverage, permission audit, answer trace timeline, tool call audit, GitHub sync, feedback, and approval queue coverage
- GitHub Actions CI for build, Docker image build, production compose smoke, eval, permission boundary, signed actor token auth, secret redaction, readiness, answer agreement, checklist, GitHub sync, direct indexing, queue indexing, review, answer trace, and browser smoke gates
- README product preview image
- Design proof document with Open Design workflow notes, exported assets, and runtime screenshot workflow

## Slack Bot

OpsPilot exposes a Slack Events API endpoint:

```txt
POST /slack/events
```

Supported events:

- `url_verification`
- `event_callback` with `app_mention`

Local mode does not require Slack credentials. It builds the same thread reply payload without calling Slack:

```bash
pnpm slack:simulate
```

To post real thread replies, set:

```bash
SLACK_SIGNING_SECRET=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_BOT_USER_ID=U...
SLACK_POST_REPLIES=true
```

Slack user access is mapped through `SLACK_DEFAULT_TEAM_SLUGS` and `SLACK_DEFAULT_ROLES` for the current demo. A production implementation should resolve Slack users to application users and teams in the database.

Details: [docs/slack-bot.md](docs/slack-bot.md)

## Document Indexing

Runtime upsert endpoint:

```txt
POST /documents/markdown
```

This replaces chunks for the same document path, records a new document version when content changes, stores embeddings in pgvector, and optionally updates Elasticsearch for hybrid retrieval.

Retrieval preview endpoint:

```txt
POST /retrieval/preview
```

This returns ranked candidate chunks, vector/lexical/fused score details, content previews, actor context, and aggregated permission audit without persisting a question or generating an answer. The Retrieval screen uses it to debug why a chunk would enter prompt context and which inaccessible candidates were denied.

Index inventory endpoint:

```txt
GET /documents
```

This returns document path, title, visibility, team boundary, latest version, content hash, chunk count, redaction summary, and chunk previews so reviewers can verify that ingestion, chunking, and security handling actually ran.

Document version history endpoint:

```txt
GET /documents/:id/versions
```

This returns stored redacted versions for a document, content hashes, previews, and a line-level diff summary against the previous version. The Documents screen loads it after Markdown upsert so reviewers can see what changed before checking retrieval behavior.

Queued indexing endpoint:

```txt
POST /documents/indexing-jobs/markdown
GET /documents/indexing-jobs/:id
```

The queue path stores a BullMQ job in Redis. `pnpm worker:indexing` processes jobs and reuses the same document ingestion code path as the synchronous API.

The web console also exposes a GitHub Markdown sync form for syncing repository docs into the same RAG index.
The Documents screen's Markdown flow runs the same proof as the smoke test: upsert Markdown, refresh indexed chunks, call retrieval preview, call `/ask`, and show whether the new document became the top source with answer agreement and confidence.

Permission boundary matrix endpoint:

```txt
GET /permission-boundary/matrix
```

This returns the current document list evaluated against demo personas such as anonymous, team on-call, ops admin, and security admin. The Documents screen renders it as an allow/deny matrix so reviewers can inspect role/team policy decisions without relying on an LLM answer.

Details: [docs/indexing.md](docs/indexing.md)

## Portfolio Demo

`pnpm portfolio:demo` runs a compact terminal demo report that covers the highest-signal interview path without a browser. `pnpm portfolio:report` runs the same assertions and writes [docs/demo-report.md](docs/demo-report.md), including source paths, document agreement ratios, tool calls, human review state, and audit trace evidence. It verifies a grounded incident answer, newly indexed Markdown retrieval, runbook checklist tool calling, sensitive-operation human approval, feedback logging, and answer trace reconstruction.

Details: [docs/demo.md](docs/demo.md)

## Observability

`GET /observability/summary` aggregates persisted operating evidence: question volume, answer count, human review rate, average confidence, average document agreement, tool calls by name/status, approvals by status, feedback, and indexed document/chunk counts. The web console renders the same summary in the Operations panel, and `pnpm observability:smoke` creates representative agent activity and fails unless those metrics reflect the RAG, runbook, approval, and feedback workflow.

Details: [docs/observability.md](docs/observability.md)

## API Contract

Swagger UI is available at `/docs`, and the generated OpenAPI JSON is available at `/docs-json`. `pnpm openapi:smoke` verifies that the portfolio-critical paths and request schemas are present.

Details: [docs/api.md](docs/api.md)

## CI

GitHub Actions runs typecheck, build, Docker image build, production compose smoke, database migrations, RAG evaluation, permission boundary smoke, signed actor token smoke, secret redaction smoke, readiness smoke, answer agreement smoke, indexing smoke, queue indexing smoke, GitHub sync smoke, review smoke, answer trace smoke, portfolio demo, observability smoke, OpenAPI contract smoke, and browser smoke tests that exercise retrieval preview, score breakdown, denied candidate audit, the evaluation panel, eval case explorer, answer-level document match, permission audit, answer trace, tool call audit, and GitHub sync UI.

Details: [docs/ci.md](docs/ci.md)

## Demo Knowledge Base

The seed wiki uses a fictional payment operations service, AcmePay:

- payment error codes
- refund policy
- settlement batch runbook
- Redis incident runbook
- production database access policy

Documents include `public`, `team`, and `restricted` visibility so permission boundaries can be tested locally.

## Roadmap

- Additional eval cases for larger document sets
