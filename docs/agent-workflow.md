# Agent Workflow

## Tools

- `search_documents`: retrieves accessible document chunks
- `request_human_approval`: records approval requests for sensitive actions
- `save_feedback`: planned for answer feedback
- `create_runbook_checklist`: planned for incident checklist generation

## Decision Flow

1. Classify the question and actor context.
2. Call `search_documents`.
3. In `vector` mode, retrieve with pgvector. In `hybrid` mode, fuse pgvector and Elasticsearch BM25 results.
4. Re-check accessible chunk ids in PostgreSQL before prompt construction.
5. Generate a grounded answer with citations.
6. Estimate confidence from retrieval score and compare it with `CONFIDENCE_THRESHOLD`.
7. Detect sensitive operations such as production DB writes, deletes, forced refunds, and permission changes.
8. If confidence is low or the action is sensitive, mark `needsHumanReview`.
9. If sensitive, call `request_human_approval`.
10. Persist every question, answer, source, and tool call.

## Current Guardrail

The agent can explain runbooks and policies. It cannot execute production-changing operations. Sensitive operations create approval records instead.

## AI Provider Modes

Local mode is deterministic and requires no API key.

OpenAI mode uses:

- chat completions for grounded answer generation
- embeddings with `OPENAI_EMBEDDING_DIMENSIONS=64` so pgvector schema remains stable

If the OpenAI request fails, the API falls back to local generation to keep demos reproducible.
