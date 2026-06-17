# Continuous Integration

OpsPilot runs a GitHub Actions pipeline on pushes and pull requests to `main`.

## Gates

- install with a frozen pnpm lockfile
- run PostgreSQL with pgvector and Redis service containers
- run database migrations
- typecheck every workspace package
- build the NestJS API, worker, packages, and Next.js console
- build the production Docker image target
- boot the production Docker Compose profile and verify API readiness, web availability, and a real grounded `/ask` request with `pnpm docker:prod:smoke`
- run Jest package tests
- run seed RAG evaluation as a hard quality gate, including source hit, top source, human review, document agreement, and citation thresholds
- verify the evaluation gate fails on a deliberate negative source case with `pnpm eval:gate-smoke`
- verify evaluation run history and previous-run deltas with `pnpm eval:history-smoke`
- verify permission boundary audit behavior with `pnpm permission:smoke`
- verify signed actor token authentication behavior with `pnpm authn:smoke`
- verify Markdown secret redaction before storage, retrieval, answers, and trace previews with `pnpm redaction:smoke`
- verify dependency readiness behavior with `pnpm readiness:smoke`
- verify answer-level document agreement scoring with `pnpm agreement:smoke`
- verify runbook checklist tool calling with `pnpm checklist:smoke`
- verify new Markdown indexing with `pnpm indexing:smoke`
- verify BullMQ queue indexing worker behavior with `pnpm queue:smoke`
- verify GitHub Markdown sync indexing with `pnpm github:smoke`
- verify sensitive-action review reasons, approval creation, and feedback with `pnpm review:smoke`
- verify persisted answer reconstruction, proof packet checks, and unauthorized trace denial with `pnpm trace:smoke`
- run the compact portfolio demo report with `pnpm portfolio:demo`
- generate the Markdown portfolio proof report with `pnpm portfolio:report`
- verify operational telemetry aggregation with `pnpm observability:smoke`
- verify SLO guardrails for grounding, review load, tool audit coverage, and latest eval state with `pnpm observability:slo-smoke`
- verify the generated OpenAPI contract with `pnpm openapi:smoke`
- start the API and web console, then run Playwright `pnpm web:smoke` against evaluation metrics, evaluation regression history, operational telemetry, SLO guardrails, answer-level document match, proof packet, permission audit, review reasons, answer trace, tool call audit, GitHub sync, answer, feedback, and approval flows

The CI workflow intentionally exercises the portfolio claims that matter most: grounded retrieval, citation accuracy, document agreement scoring, answer-level match visibility, answer proof packets, evaluation hard gates, evaluation history regression visibility, SLO guardrails, signed actor authentication, secret redaction before indexing, dependency readiness, permission boundary enforcement, structured review reasons, permission-checked answer trace, async queue indexing, GitHub document sync, runbook tool calling, auditable tool calls, human approval separation, feedback logging, operational telemetry aggregation, compact JSON and Markdown portfolio demo reports, OpenAPI contract stability, Docker-buildable and Docker-bootable deployment artifacts, and a working browser demo.
