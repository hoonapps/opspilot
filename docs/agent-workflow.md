# Agent Workflow

## Tools

- `search_documents`: retrieves accessible document chunks
- `request_human_approval`: records approval requests for sensitive actions
- `save_feedback`: planned for answer feedback
- `create_runbook_checklist`: planned for incident checklist generation

## Decision Flow

1. Classify the question and actor context.
2. Call `search_documents`.
3. Generate a grounded answer with citations.
4. Estimate confidence from retrieval score.
5. Detect sensitive operations such as production DB writes, deletes, forced refunds, and permission changes.
6. If confidence is low or the action is sensitive, mark `needsHumanReview`.
7. If sensitive, call `request_human_approval`.
8. Persist every question, answer, source, and tool call.

## Current Guardrail

The agent can explain runbooks and policies. It cannot execute production-changing operations. Sensitive operations create approval records instead.
