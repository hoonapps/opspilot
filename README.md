# OpsPilot

Permission-aware RAG agent for operational knowledge, runbooks, and Slack support workflows.

OpsPilot is a portfolio-grade AI agent project focused on operational support. It answers questions from Markdown wiki documents, returns grounded sources, applies document-level permission boundaries before retrieval results reach the LLM layer, logs tool calls, and marks sensitive work for human approval.

## Why This Project Exists

Most RAG demos stop at document upload and answer generation. OpsPilot focuses on the production questions that matter for an AI operations agent:

- Can the agent answer with traceable document sources?
- Can restricted documents be excluded before prompt construction?
- Can sensitive operations be separated into human approval?
- Can new or changed documents be re-indexed and evaluated?
- Can retrieval quality be measured against expected source documents?

## Stack

- Backend: NestJS, TypeScript
- ORM: MikroORM, not Prisma
- Database: PostgreSQL with pgvector
- Queue/cache target: Redis and BullMQ in later phases
- Search target: Elasticsearch optional local profile for hybrid BM25 + vector search
- AI layer: local deterministic embedding by default, OpenAI adapter planned
- Integration target: Slack Bot
- Infra: Docker Compose

## Local Quick Start

```bash
pnpm install
cp .env.example apps/api/.env
docker compose up -d postgres redis
pnpm --filter @opspilot/api db:migrate
pnpm ingest
pnpm dev:api
```

Ask a question:

```bash
curl -X POST http://localhost:3000/ask \
  -H "content-type: application/json" \
  -H "x-team-slugs: payments" \
  -d '{"question":"E102 에러가 발생하면 어떻게 대응해야 해?"}'
```

Run evaluation:

```bash
pnpm eval
```

Optional Elasticsearch local demo:

```bash
docker compose --profile search up -d
```

Elasticsearch is exposed on `localhost:29200` and Redis on `localhost:26379` to avoid common local development port conflicts.

Elasticsearch is intentionally optional in the first phase. The core RAG path uses PostgreSQL + pgvector first, then the project adds hybrid retrieval as a measurable improvement.

## Current MVP

- Markdown seed document ingestion
- Chunking and deterministic local embedding
- pgvector similarity search
- `/ask` API
- Source citation response
- Permission-aware retrieval filtering
- Sensitive action detection
- Tool call logs
- Human approval request creation for sensitive work
- Evaluation script with expected source hit rate

## Demo Knowledge Base

The seed wiki uses a fictional payment operations service, AcmePay:

- payment error codes
- refund policy
- settlement batch runbook
- Redis incident runbook
- production database access policy

Documents include `public`, `team`, and `restricted` visibility so permission boundaries can be tested locally.

## Roadmap

- Slack mention event handling and thread replies
- OpenAI and Anthropic provider adapters
- BullMQ indexing worker
- Elasticsearch BM25 index and hybrid fusion
- Feedback UI and admin review screen
- GitHub Markdown sync
