# System Design

OpsPilot is designed as an operational knowledge platform with an agentic RAG backend.

## Components

- API: NestJS HTTP API for document ingestion, asking questions, feedback, and approvals
- Database: PostgreSQL stores documents, chunks, embeddings, questions, answers, sources, approvals, and evaluation results
- Vector Search: pgvector performs permission-aware semantic retrieval
- Search Extension: Elasticsearch performs optional BM25 keyword retrieval and hybrid fusion
- Worker: indexing and Slack event processing move to BullMQ workers in later phases
- Slack Bot: receives mentions and replies in threads with answer, sources, confidence, tool calls, and review status

## Request Flow

1. User asks a question through API or Slack.
2. API builds actor context from auth headers or Slack identity.
3. Retrieval filter is built from actor roles and team memberships.
4. Search tool retrieves chunks only from accessible documents.
5. Agent generates an answer from retrieved chunks.
6. Sensitive actions are converted into approval requests.
7. Question, answer, sources, tool calls, and approval state are logged.
8. Slack requests are formatted into thread replies. Real posting is controlled by `SLACK_POST_REPLIES`.

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
