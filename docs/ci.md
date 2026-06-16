# Continuous Integration

OpsPilot runs a GitHub Actions pipeline on pushes and pull requests to `main`.

## Gates

- install with a frozen pnpm lockfile
- run PostgreSQL with pgvector and Redis service containers
- run database migrations
- typecheck every workspace package
- build the NestJS API, worker, packages, and Next.js console
- run Jest package tests
- run seed RAG evaluation
- verify new Markdown indexing with `pnpm indexing:smoke`
- verify sensitive-action review and feedback with `pnpm review:smoke`
- start the API and web console, then run Playwright `pnpm web:smoke`

The CI workflow intentionally exercises the portfolio claims that matter most: grounded retrieval, permission boundaries, human approval separation, feedback logging, and a working browser demo.
