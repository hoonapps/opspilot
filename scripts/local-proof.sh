#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "== OpsPilot local product proof =="
echo "This runs the core evidence path without a public deployment URL."

docker compose up -d postgres redis
pnpm --filter @opspilot/api db:migrate

pnpm typecheck
pnpm source-ingestion:smoke
pnpm agentic-tool-use:smoke
pnpm permission:smoke
pnpm trace:smoke
pnpm agreement:smoke
pnpm quality-gate:smoke
pnpm product-readiness:smoke
pnpm product:report

echo "== OpsPilot local product proof passed =="
