# Design Artifacts

OpsPilot keeps its product proof close to the code. The checked-in design artifacts are meant to show both the intended operator experience and the currently working browser implementation.

## Assets

- `docs/assets/opspilot-dashboard.svg`: editable SVG product board showing the target operating model for a permission-aware RAG agent console.
- `docs/assets/opspilot-web-console.png`: Playwright-generated screenshot from the real Next.js console. The current console shell follows the dashboard pattern from Open Design.app: persistent workspace rail, screen list navigation, top status bar, KPI strip, evidence panel, operations telemetry, quality gates, approval queue, audit feed, and a dedicated Documents screen for Markdown upsert and GitHub sync.

The PNG is refreshed by `pnpm web:smoke` after the API and web console are running. This makes the README image a runtime artifact, not a static marketing mockup.

## Open Design Workflow

The local `/Applications/Open Design.app` desktop app was launched during the design pass. Its bundled dashboard template guidance and design-system references were used to refine the OpsPilot web console into an operations dashboard layout. The app is a separate runtime from the Pencil MCP server, so the repository currently keeps the durable design proof as source-controlled SVG plus Playwright-generated runtime PNG instead of a `.pen` canvas export.

## Console Design Goals

- Show the answer, confidence, document match, tool calls, and sources in one scan.
- Keep primary workflows in a dashboard shell with stable screen navigation instead of crowding every workflow into one page.
- Split the console into Ask, Documents, Quality, Review, and Audit screens so document management is a first-class workflow.
- Surface operating telemetry next to evidence so reviewers can see question volume, review rate, average match, approvals, and feedback without leaving the demo.
- Make permission boundaries visible through denied candidate counts and review reasons.
- Keep sensitive actions separate from automatic answers through the approval queue.
- Expose evaluation metrics in the same surface used for demos.
- Keep document upsert and GitHub sync in a dedicated Documents screen so re-indexing can be demonstrated live without hiding the controls below the answer workflow.

## Portfolio Demo Path

1. Run the local stack and ingest seed documents.
2. Open the Quality screen and load the latest evaluation report.
3. Open the Documents screen and upsert the sample status-page Markdown document.
4. Open the Ask screen, ask the status-page SLA question, and verify the new source appears.
5. Ask the production DB write question and verify human approval is required.
6. Open the Review screen and inspect the approval queue.
7. Open the Audit screen and inspect the persisted tool-call trail.
8. Save feedback and refresh the answer trace.

This is the same path covered by the Playwright web smoke test.

## Editable Source Workflow

When Pencil is available, keep the editable `.pen` source next to these exported assets and export the final board into `docs/assets/`. The repository currently treats the SVG board plus runtime screenshot as the source-controlled design proof, so reviewers can inspect visual intent without a separate design account.
