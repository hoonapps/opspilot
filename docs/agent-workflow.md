# Agent Workflow

## Tools

- `search_documents`: retrieves accessible document chunks
- `request_human_approval`: records approval requests for sensitive actions
- `save_feedback`: records answer quality feedback
- `create_runbook_checklist`: extracts numbered action items from retrieved runbooks

The callable agent tools are exposed through:

```txt
GET /tool-calls/registry
```

The registry returns each tool's category, side-effect profile, approval policy, expected call status, compact input/output schema, and persisted audit fields. The Audit screen renders this next to recent runtime calls so reviewers can compare the designed tool contract with actual execution evidence.

## Retrieval Preview

```txt
POST /retrieval/preview
```

The preview endpoint runs the same `SearchService.searchWithAudit` path used by `/ask`, but does not persist a question, create tool-call logs, generate an answer, or enqueue human approval. It returns ranked candidate chunks with vector/lexical/fused score details, content previews, actor roles/teams, and the aggregated permission audit. This gives the web console a safe RAG debugging surface for proving which chunks would enter prompt context and which inaccessible candidates were denied.

## Tool Audit

```txt
GET /tool-calls/recent
GET /tool-calls/recent?limit=20
GET /tool-calls/registry
GET /answers/:id/trace
```

Every tool call stores the linked question id, tool name, input, output, status, and timestamp in `tool_call_logs`. The web console reads the recent audit feed so demos can show which tools were allowed and which required approval.

For `search_documents`, the output includes an aggregated `permissionAudit` object: candidate window size, allowed candidate count, denied candidate count, denied buckets by visibility, and the actor roles/teams used for filtering. Denied titles and paths are deliberately omitted.

`GET /answers/:id/trace` reconstructs a persisted answer from the database. It returns a summary, ordered timeline, question, answer metadata, ranked sources with chunk previews, source-level grounding coverage, context budget package, tool calls, approval requests, and feedback for that answer. The endpoint applies the same document access check to every traced source before returning the artifact.

The trace timeline includes question persistence, source attachment, answer generation, tool calls, approval transitions, and feedback events. The grounding section shows answer-token coverage by source, including the matched tokens used for the deterministic overlap check. The context package shows which ranked chunks entered the prompt budget and which were omitted. This lets the web console show an answer-level execution story and document match evidence without exposing raw embeddings or bypassing document permissions.

## Decision Flow

1. Optionally preview retrieval through HTTP `/retrieval/preview` to inspect ranking and permission behavior without side effects.
2. Receive the question through HTTP `/ask`, Slack `app_mention`, or evaluation script.
3. Classify the question and actor context.
4. Call `search_documents`.
5. In `vector` mode, retrieve with pgvector and PostgreSQL lexical overlap. In `hybrid` mode, fuse pgvector and Elasticsearch BM25 results.
6. Store the aggregated permission audit for the search call.
7. Re-check accessible chunk ids in PostgreSQL before prompt construction.
8. Build a `ranked_context_budget_v1` context package from the ranked sources. It records token budget, estimated tokens, included/omitted chunks, and omission reasons.
9. If the user asks for a runbook/checklist and the retrieved source has a checklist section, call `create_runbook_checklist`.
10. Generate a grounded answer with citations.
11. Estimate confidence from retrieval score and compare it with `CONFIDENCE_THRESHOLD`.
12. Detect sensitive operations such as production DB writes, deletes, forced refunds, and permission changes.
13. Build structured `reviewReasons` for missing sources, low confidence, or sensitive actions.
14. If any review reason exists, mark `needsHumanReview`.
15. If sensitive, call `request_human_approval`.
16. Persist every question, answer, source, review reason, context package, and tool call.
17. Store optional feedback against the persisted answer id.
18. Expose answer trace through `GET /answers/:id/trace`.
19. Expose recent tool calls through the audit API.
20. Expose pending approval requests for human review.
21. For Slack, format the answer, confidence, review status, review reasons, sources, and tool calls as a thread reply.
22. For local Slack simulation, return a compact trace with actor mapping, persisted question and answer ids, source scores, tool calls, and reply post mode.

## Current Guardrail

The agent can explain runbooks and policies. It cannot execute production-changing operations. Sensitive operations create approval records instead.

## Review Reasons

`/ask` returns `reviewReasons` alongside `needsHumanReview`:

- `no_sources`: no permitted chunks were retrieved for the actor.
- `low_confidence`: retrieval confidence is below `CONFIDENCE_THRESHOLD`.
- `sensitive_action`: the question asks for a production-sensitive operation.

The same array is stored in answer metadata and rendered in the web console so the demo can show why an answer was routed to human review.

## AI Provider Modes

Local mode is deterministic and requires no API key.

OpenAI mode uses:

- chat completions for grounded answer generation
- embeddings with `OPENAI_EMBEDDING_DIMENSIONS=64` so pgvector schema remains stable

Anthropic mode uses the Messages API for grounded answer generation. Embeddings still use the local deterministic provider unless `AI_PROVIDER=openai` is selected with an OpenAI key.

If a provider request fails, the API falls back to local generation to keep demos reproducible.
