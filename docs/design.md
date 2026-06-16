# Design Artifacts

OpsPilot keeps its product proof close to the code. The checked-in design artifacts are meant to show both the intended operator experience and the currently working browser implementation.

## Assets

- `docs/assets/opspilot-dashboard.svg`: editable SVG product board showing the target operating model for a permission-aware RAG agent console.
- `docs/assets/opspilot-web-console.png`: Playwright-generated screenshot from the real Next.js console.

The PNG is refreshed by `pnpm web:smoke` after the API and web console are running. This makes the README image a runtime artifact, not a static marketing mockup.

## Console Design Goals

- Show the answer, confidence, document match, tool calls, and sources in one scan.
- Make permission boundaries visible through denied candidate counts and review reasons.
- Keep sensitive actions separate from automatic answers through the approval queue.
- Expose evaluation metrics in the same surface used for demos.
- Keep document upsert and GitHub sync near the ask flow so re-indexing can be demonstrated live.

## Portfolio Demo Path

1. Run the local stack and ingest seed documents.
2. Load the latest evaluation report.
3. Upsert the sample status-page Markdown document from the console.
4. Ask the status-page SLA question and verify the new source appears.
5. Ask the production DB write question and verify human approval is required.
6. Load tool calls and inspect the persisted audit trail.
7. Save feedback and refresh the answer trace.

This is the same path covered by the Playwright web smoke test.

## Editable Source Workflow

When Pencil is available, keep the editable `.pen` source next to these exported assets and export the final board into `docs/assets/`. The repository currently treats the SVG board plus runtime screenshot as the source-controlled design proof, so reviewers can inspect visual intent without a separate design account.
