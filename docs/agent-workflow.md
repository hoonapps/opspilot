# Agent Workflow

## Tools

- `search_documents`: retrieves accessible document chunks
- `request_human_approval`: records approval requests for sensitive actions
- `save_feedback`: records answer quality feedback
- `create_runbook_checklist`: planned for incident checklist generation

## Decision Flow

1. Receive the question through HTTP `/ask`, Slack `app_mention`, or evaluation script.
2. Classify the question and actor context.
3. Call `search_documents`.
4. In `vector` mode, retrieve with pgvector and PostgreSQL lexical overlap. In `hybrid` mode, fuse pgvector and Elasticsearch BM25 results.
5. Re-check accessible chunk ids in PostgreSQL before prompt construction.
6. Generate a grounded answer with citations.
7. Estimate confidence from retrieval score and compare it with `CONFIDENCE_THRESHOLD`.
8. Detect sensitive operations such as production DB writes, deletes, forced refunds, and permission changes.
9. If confidence is low or the action is sensitive, mark `needsHumanReview`.
10. If sensitive, call `request_human_approval`.
11. Persist every question, answer, source, and tool call.
12. Store optional feedback against the persisted answer id.
13. Expose pending approval requests for human review.
14. For Slack, format the answer, confidence, review status, sources, and tool calls as a thread reply.

## Current Guardrail

The agent can explain runbooks and policies. It cannot execute production-changing operations. Sensitive operations create approval records instead.

## AI Provider Modes

Local mode is deterministic and requires no API key.

OpenAI mode uses:

- chat completions for grounded answer generation
- embeddings with `OPENAI_EMBEDDING_DIMENSIONS=64` so pgvector schema remains stable

If the OpenAI request fails, the API falls back to local generation to keep demos reproducible.
