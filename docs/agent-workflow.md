# Agent Workflow

## Tools

- `search_documents`: retrieves accessible document chunks
- `request_human_approval`: records approval requests for sensitive actions
- `save_feedback`: records answer quality feedback
- `create_runbook_checklist`: extracts numbered action items from retrieved runbooks

## Tool Audit

```txt
GET /tool-calls/recent
GET /tool-calls/recent?limit=20
```

Every tool call stores the linked question id, tool name, input, output, status, and timestamp in `tool_call_logs`. The web console reads the recent audit feed so demos can show which tools were allowed and which required approval.

For `search_documents`, the output includes an aggregated `permissionAudit` object: candidate window size, allowed candidate count, denied candidate count, denied buckets by visibility, and the actor roles/teams used for filtering. Denied titles and paths are deliberately omitted.

## Decision Flow

1. Receive the question through HTTP `/ask`, Slack `app_mention`, or evaluation script.
2. Classify the question and actor context.
3. Call `search_documents`.
4. In `vector` mode, retrieve with pgvector and PostgreSQL lexical overlap. In `hybrid` mode, fuse pgvector and Elasticsearch BM25 results.
5. Store the aggregated permission audit for the search call.
6. Re-check accessible chunk ids in PostgreSQL before prompt construction.
7. If the user asks for a runbook/checklist and the retrieved source has a checklist section, call `create_runbook_checklist`.
8. Generate a grounded answer with citations.
9. Estimate confidence from retrieval score and compare it with `CONFIDENCE_THRESHOLD`.
10. Detect sensitive operations such as production DB writes, deletes, forced refunds, and permission changes.
11. If confidence is low or the action is sensitive, mark `needsHumanReview`.
12. If sensitive, call `request_human_approval`.
13. Persist every question, answer, source, and tool call.
14. Store optional feedback against the persisted answer id.
15. Expose recent tool calls through the audit API.
16. Expose pending approval requests for human review.
17. For Slack, format the answer, confidence, review status, sources, and tool calls as a thread reply.

## Current Guardrail

The agent can explain runbooks and policies. It cannot execute production-changing operations. Sensitive operations create approval records instead.

## AI Provider Modes

Local mode is deterministic and requires no API key.

OpenAI mode uses:

- chat completions for grounded answer generation
- embeddings with `OPENAI_EMBEDDING_DIMENSIONS=64` so pgvector schema remains stable

If the OpenAI request fails, the API falls back to local generation to keep demos reproducible.
