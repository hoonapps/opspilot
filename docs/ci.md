# Continuous Integration

OpsPilot runs a GitHub Actions pipeline on pushes and pull requests to `main`.

## Gates

- install with a frozen pnpm lockfile
- run PostgreSQL with pgvector and Redis service containers
- run database migrations
- typecheck every workspace package
- build the NestJS API, worker, packages, and Next.js console
- run Jest package tests
- run seed RAG evaluation as a hard quality gate, including source hit, top source, human review, document agreement, and citation thresholds
- verify the evaluation gate fails on a deliberate negative source case with `pnpm eval:gate-smoke`
- verify permission boundary audit behavior with `pnpm permission:smoke`
- verify runbook checklist tool calling with `pnpm checklist:smoke`
- verify new Markdown indexing with `pnpm indexing:smoke`
- verify BullMQ queue indexing worker behavior with `pnpm queue:smoke`
- verify GitHub Markdown sync indexing with `pnpm github:smoke`
- verify sensitive-action review reasons, approval creation, and feedback with `pnpm review:smoke`
- verify persisted answer reconstruction and unauthorized trace denial with `pnpm trace:smoke`
- start the API and web console, then run Playwright `pnpm web:smoke` against evaluation metrics, permission audit, review reasons, answer trace, tool call audit, GitHub sync, answer, feedback, and approval flows

The CI workflow intentionally exercises the portfolio claims that matter most: grounded retrieval, citation accuracy, document agreement scoring, evaluation hard gates, permission boundary enforcement, structured review reasons, permission-checked answer trace, async queue indexing, GitHub document sync, runbook tool calling, auditable tool calls, human approval separation, feedback logging, and a working browser demo.
