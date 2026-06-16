# Portfolio Demo

`pnpm portfolio:demo` runs a compact end-to-end demo without requiring a browser or external LLM provider. It creates a Nest application context, ingests the seed wiki, upserts a new Markdown document, asks representative operations questions, and prints a JSON report.

## What It Proves

- A normal incident question returns grounded RAG sources.
- A newly added Markdown document is indexed and retrieved as the top source.
- A runbook question triggers the `create_runbook_checklist` tool call.
- A sensitive production operation triggers human review and `request_human_approval`.
- The answer trace can reconstruct sources, tool calls, approvals, and feedback.

## Run

```bash
docker compose up -d postgres redis
pnpm --filter @opspilot/api db:migrate
pnpm portfolio:demo
```

The command exits non-zero if any portfolio claim is not proven.

## Report Shape

The report is intentionally readable in terminal output and CI logs:

```json
{
  "ok": true,
  "demoClaims": [
    "RAG answer returns grounded sources",
    "New Markdown document is indexed and retrieved",
    "Runbook questions trigger structured tool calling",
    "Sensitive operations require human approval",
    "Answer trace reconstructs sources, tool calls, approvals, and feedback"
  ],
  "steps": [
    {
      "name": "Grounded incident answer",
      "sources": ["public/payment-error-codes.md"],
      "toolCalls": ["search_documents:allowed"]
    },
    {
      "name": "Sensitive operation approval boundary",
      "needsHumanReview": true,
      "reviewReasons": ["sensitive_action"],
      "toolCalls": ["search_documents:allowed", "request_human_approval:needs_approval"]
    }
  ]
}
```

This is the fastest command to show that OpsPilot is more than a prompt wrapper: it demonstrates indexing, retrieval, tool calling, approval boundaries, and audit reconstruction in one run.
