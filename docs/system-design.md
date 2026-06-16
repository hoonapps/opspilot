# System Design

OpsPilot is designed as an operational knowledge platform with an agentic RAG backend.

## Components

- API: NestJS HTTP API for document ingestion, asking questions, feedback, and approvals
- Database: PostgreSQL stores documents, chunks, embeddings, questions, answers, sources, approvals, and evaluation results
- Vector Search: pgvector performs permission-aware semantic retrieval
- Search Extension: Elasticsearch is planned for BM25 keyword retrieval and hybrid fusion
- Worker: indexing and Slack event processing move to BullMQ workers in later phases
- Slack Bot: receives mentions and replies in threads with answer, sources, and review status

## Request Flow

1. User asks a question through API or Slack.
2. API builds actor context from auth headers or Slack identity.
3. Retrieval filter is built from actor roles and team memberships.
4. Search tool retrieves chunks only from accessible documents.
5. Agent generates an answer from retrieved chunks.
6. Sensitive actions are converted into approval requests.
7. Question, answer, sources, tool calls, and approval state are logged.

## Permission Boundary

The key design rule is that inaccessible chunks are filtered at retrieval time. The LLM layer never receives restricted text for users who cannot access it.
