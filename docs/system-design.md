# System Design

OpsPilot is designed as an operational knowledge platform with an agentic RAG backend.

## Components

- API: NestJS HTTP API for signed actor authentication, liveness/readiness checks, operational telemetry, SLO guardrails, document ingestion, queued indexing jobs, GitHub Markdown sync, asking questions, answer-level document agreement, answer trace/proof, review reasons, tool call audit, evaluation reports with document agreement and citation scoring, feedback, and approvals
- Web Console: Next.js UI for asking questions, viewing answer trace/proof, sources/tool calls, review reasons, permission audits, audit logs, evaluation metrics, and upserting Markdown documents
- Database: PostgreSQL stores documents, chunks, embeddings, questions, answers, sources, tool call logs, approvals, feedback, and evaluation results; observability summaries are derived from these persisted operational rows
- Vector Search: pgvector performs permission-aware semantic retrieval
- Search Extension: Elasticsearch performs optional BM25 keyword retrieval and hybrid fusion
- AI Adapter Package: `@opspilot/ai` provides local deterministic embedding, OpenAI chat/embedding, and Anthropic chat adapters
- Worker: BullMQ indexing worker consumes Redis jobs and reuses the document ingestion service
- Slack Bot: receives mentions and replies in threads with answer, sources, confidence, review reasons, tool calls, and review status
- Deployment Profile: multi-target Dockerfile builds API, web, and worker containers; `docker-compose.prod.yml` wires them to PostgreSQL and Redis for a production-style demo

## Request Flow

1. User asks a question through the web console, API, or Slack.
2. API builds actor context from a verified signed actor token, local demo headers, or Slack identity.
3. Retrieval filter is built from actor roles and team memberships.
4. Search tool retrieves chunks only from accessible documents and stores an aggregated permission audit.
5. Runbook questions can call `create_runbook_checklist` to structure action items from retrieved runbooks.
6. Agent generates an answer from retrieved chunks.
7. API calculates deterministic document agreement between the answer and returned source chunks.
8. Missing evidence, low confidence, and sensitive actions are converted into structured review reasons.
9. Sensitive actions are converted into approval requests.
10. Question, answer, sources, document agreement, review reasons, permission audit, tool calls, approval state, and feedback are logged.
11. `GET /answers/:id/trace` re-checks traced source access and reconstructs the answer audit artifact from persisted rows.
12. `GET /answers/:id/proof` summarizes the same persisted artifact into pass/warn/fail evidence checks for grounding, tool audit, approval boundary, context budget, and feedback capture.
13. `GET /observability/summary` aggregates the persisted rows into operating metrics for question volume, answer quality, review rate, tool calls, approvals, feedback, and indexed knowledge size.
14. `GET /observability/slo` turns quality and audit metrics into SLO guardrails with status and error budget remaining.
15. `GET /observability/release-gate` combines readiness, indexed knowledge, eval state, knowledge freshness, SLOs, audit trail, approval backlog, and feedback into a deploy-style `pass`, `review`, or `block`.
16. Web requests render the grounded answer, document match, sources, confidence, review reasons, permission audit, trace summary, proof packet, release gate, and tool calls in the console.
17. Slack requests are formatted into thread replies. Real posting is controlled by `SLACK_POST_REPLIES`.

## Ingestion Flow

1. Seed ingestion reads local Markdown fixtures for reproducible demos and evaluation.
2. Runtime upsert accepts one Markdown document through `POST /documents/markdown`.
3. Async indexing accepts one Markdown document through `POST /documents/indexing-jobs/markdown` and stores a BullMQ job in Redis.
4. The indexing worker consumes `index-markdown` jobs and calls the same document ingestion service.
5. GitHub sync reads repository Markdown through `POST /documents/github/sync`.
6. Every ingestion path redacts common secret patterns before writing document versions, chunk content, embeddings, or Elasticsearch mirrors.
7. Every ingestion path normalizes metadata, chunks redacted content, stores embeddings in PostgreSQL, and optionally mirrors redacted chunks into Elasticsearch.
8. Re-indexing the same path preserves chunk identity where possible and deletes obsolete chunks after the fresh version is written.

## Web Console Flow

1. Operator opens the Next.js console on `localhost:3001`.
2. The console calls `POST /documents/github/sync` to import repository Markdown docs.
3. The console calls `POST /documents/markdown` to upsert ad hoc Markdown knowledge.
4. The console calls `POST /ask` with team and role headers.
5. The answer panel renders the generated response, confidence, review state, review reasons, permission audit, trace summary, and tool calls.
6. The source panel renders ranked source documents so retrieval quality can be inspected during a demo.
7. Operators can save answer feedback through `POST /feedback`.
8. Operators can load the latest source hit, top source, human review, document agreement, and citation metrics through `GET /evaluations/latest`.
9. Operators can refresh the answer trace through `GET /answers/:id/trace`.
10. Operators can inspect recent Agent tool calls through `GET /tool-calls/recent`.
11. Sensitive requests appear in the approval queue and can be approved or rejected through `PATCH /approvals/:id`.

## Permission Boundary

The key design rule is that inaccessible chunks are filtered at retrieval time. The LLM layer never receives restricted text for users who cannot access it. Search logs keep only aggregate denied counts by visibility, not denied document titles or paths.

Secret redaction happens before persistence and indexing, not only before answer generation. That means accidental credentials in Markdown documents are not stored in `document_versions`, `document_chunks`, embeddings, Elasticsearch mirrors, answer text, or trace previews.

When `OPSPILOT_ACTOR_TOKEN_SECRET` is configured, protected HTTP routes require `x-opspilot-actor-token`. The token is HMAC-signed and contains the actor id, roles, team slugs, and expiration. Local demos can leave the secret empty to use role/team headers directly, but the CI smoke test proves the stricter signed-token path.

## Retrieval Modes

`vector` mode uses pgvector plus a lightweight PostgreSQL lexical overlap score so local demos handle exact operational terms without Elasticsearch.

`hybrid` mode combines:

- pgvector semantic search
- Elasticsearch BM25 lexical search
- reciprocal-rank fusion
- PostgreSQL permission re-check for Elasticsearch chunk ids

The last step is intentional. Elasticsearch improves recall, but PostgreSQL remains the source of truth for access control.

## Slack Event Flow

1. Slack sends `POST /slack/events`.
2. OpsPilot verifies `x-slack-signature` when `SLACK_SIGNING_SECRET` is configured.
3. `app_mention` text is normalized into a question.
4. Slack user context is mapped to roles and teams.
5. The agent answers through the same RAG path as `/ask`.
6. A Slack thread reply payload is generated. If `SLACK_POST_REPLIES=true`, OpsPilot calls `chat.postMessage`.
