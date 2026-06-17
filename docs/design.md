# Design Artifacts

OpsPilot keeps its product proof close to the code. The checked-in design artifacts are meant to show both the intended operator experience and the currently working browser implementation.

## Assets

- `docs/assets/opspilot-dashboard.svg`: editable SVG product board showing the target operating model for a permission-aware RAG agent console.
- `docs/assets/opspilot-web-console.png`: Playwright-generated screenshot from the real Next.js console. The current console shell follows the dashboard pattern from Open Design.app: persistent workspace rail, screen list navigation, top status bar, KPI strip, retrieval lab, evidence panel, operations telemetry, quality gates, approval queue, audit feed, and a dedicated Documents screen for Markdown upsert, GitHub sync, index inventory, and chunk inspection.

The PNG is refreshed by `pnpm web:smoke` after the API and web console are running. This makes the README image a runtime artifact, not a static marketing mockup.

## Open Design Workflow

The local `/Applications/Open Design.app` desktop app was launched during the design pass. Its bundled dashboard template guidance and design-system references were used to refine the OpsPilot web console into an operations dashboard layout. The app is a separate runtime from the Pencil MCP server, so the repository currently keeps the durable design proof as source-controlled SVG plus Playwright-generated runtime PNG instead of a `.pen` canvas export.

## Console Design Goals

- Show the answer, confidence, document match, context budget, grounding coverage, tool calls, and sources in one scan.
- Render answer trace as a compact timeline with context budget and source-level grounding coverage so persisted question, retrieval, answer, tool, approval, and feedback events can be audited from the same screen.
- Show the agent tool registry beside runtime tool logs so side effects and approval policy are visible before inspecting individual executions.
- Keep primary workflows in a dashboard shell with stable screen navigation instead of crowding every workflow into one page.
- Split the console into Ask, Retrieval, Documents, Quality, Review, and Audit screens so retrieval debugging and document management are first-class workflows.
- Surface operating telemetry next to evidence so reviewers can see question volume, review rate, average match, approvals, and feedback without leaving the demo.
- Make permission boundaries visible through denied candidate counts and review reasons.
- Show retrieval score breakdown before answer generation so vector, lexical, and permission behavior can be inspected without creating an answer record.
- Keep sensitive actions separate from automatic answers through the approval queue.
- Expose evaluation metrics and case-level expected-vs-actual source comparison in the same surface used for demos.
- Keep document upsert, GitHub sync, permission boundary matrix, version diff, index inventory, and chunk previews in a dedicated Documents screen so re-indexing, document changes, and access policy can be demonstrated live without hiding the controls below the answer workflow.

## Portfolio Demo Path

1. Run the local stack and ingest seed documents.
2. Open the Quality screen and load the latest evaluation report, then inspect the case explorer for expected and actual sources.
3. Open the Documents screen and upsert the sample status-page Markdown document.
4. Verify that the inventory count, selected document, content hash, version diff, redaction summary, and generated chunk previews update before asking a question.
5. Update the Markdown sample again and verify the version diff shows the added line.
6. Load the permission boundary matrix and verify public/team/restricted allow-deny behavior across personas.
7. Open the Retrieval screen and preview ranking for the status-page and production DB questions.
8. Verify vector/lexical score bars, ranked chunks, and denied restricted candidates.
9. Open the Ask screen, ask the status-page SLA question, and verify the new source appears.
10. Ask the production DB write question and verify human approval is required.
11. Open the Review screen and inspect the approval queue.
12. Open the Audit screen and inspect the tool registry plus persisted tool-call trail.
13. Save feedback and refresh the answer trace timeline and source grounding coverage.

This is the same path covered by the Playwright web smoke test.

## Editable Source Workflow

When Pencil is available, keep the editable `.pen` source next to these exported assets and export the final board into `docs/assets/`. The repository currently treats the SVG board plus runtime screenshot as the source-controlled design proof, so reviewers can inspect visual intent without a separate design account.
