# System Design

OpsPilot is designed as an operational knowledge platform with an agentic RAG backend.

## Components

- API: NestJS HTTP API for document ingestion, queued indexing jobs, GitHub Markdown sync, asking questions, feedback, and approvals
- Web Console: Next.js UI for asking questions, viewing sources/tool calls, and upserting Markdown documents
- Database: PostgreSQL stores documents, chunks, embeddings, questions, answers, sources, approvals, and evaluation results
- Vector Search: pgvector performs permission-aware semantic retrieval
- Search Extension: Elasticsearch performs optional BM25 keyword retrieval and hybrid fusion
- Worker: BullMQ indexing worker consumes Redis jobs and reuses the document ingestion service
- Slack Bot: receives mentions and replies in threads with answer, sources, confidence, tool calls, and review status

## Request Flow

1. User asks a question through the web console, API, or Slack.
2. API builds actor context from auth headers or Slack identity.
3. Retrieval filter is built from actor roles and team memberships.
4. Search tool retrieves chunks only from accessible documents.
5. Runbook questions can call `create_runbook_checklist` to structure action items from retrieved runbooks.
6. Agent generates an answer from retrieved chunks.
7. Sensitive actions are converted into approval requests.
8. Question, answer, sources, tool calls, and approval state are logged.
9. Web requests render the grounded answer, sources, confidence, and tool calls in the console.
10. Slack requests are formatted into thread replies. Real posting is controlled by `SLACK_POST_REPLIES`.

## Ingestion Flow

1. Seed ingestion reads local Markdown fixtures for reproducible demos and evaluation.
2. Runtime upsert accepts one Markdown document through `POST /documents/markdown`.
3. Async indexing accepts one Markdown document through `POST /documents/indexing-jobs/markdown` and stores a BullMQ job in Redis.
4. The indexing worker consumes `index-markdown` jobs and calls the same document ingestion service.
5. GitHub sync reads repository Markdown through `POST /documents/github/sync`.
6. Every ingestion path normalizes metadata, chunks content, stores embeddings in PostgreSQL, and optionally mirrors chunks into Elasticsearch.
7. Re-indexing the same path preserves chunk identity where possible and deletes obsolete chunks after the fresh version is written.

## Web Console Flow

1. Operator opens the Next.js console on `localhost:3001`.
2. The console calls `POST /documents/github/sync` to import repository Markdown docs.
3. The console calls `POST /documents/markdown` to upsert ad hoc Markdown knowledge.
4. The console calls `POST /ask` with team and role headers.
5. The answer panel renders the generated response, confidence, review state, and tool calls.
6. The source panel renders ranked source documents so retrieval quality can be inspected during a demo.
7. Operators can save answer feedback through `POST /feedback`.
8. Sensitive requests appear in the approval queue and can be approved or rejected through `PATCH /approvals/:id`.

## Permission Boundary

The key design rule is that inaccessible chunks are filtered at retrieval time. The LLM layer never receives restricted text for users who cannot access it.

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
