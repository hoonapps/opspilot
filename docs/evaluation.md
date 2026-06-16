# Evaluation

OpsPilot evaluates RAG behavior with a seed question set.

## Metrics

- Source hit rate: whether the expected document appears in returned sources
- Top source accuracy: whether the first returned source is the expected document
- Human review accuracy: whether restricted or sensitive questions are routed to human review
- Confidence: retrieval-derived score stored with each answer

## Run

```bash
pnpm eval
```

The evaluation command ingests seed documents, asks each question, stores metric rows in `evaluation_results`, and prints a JSON report.

## Latest Report API

```txt
GET /evaluations/latest
GET /evaluations/latest?suiteName=seed-ops-wiki
```

The API returns the latest source hit rate, top source accuracy, human review accuracy, total case count, and per-question rows for the requested suite. The web console uses this endpoint for the quality gate panel.

## Planned Additions

- groundedness check per answer sentence
- citation accuracy review
- larger regression set for newly added documents

## New Document Regression

`pnpm indexing:smoke` upserts a new Markdown document, asks a Korean incident communication question, and fails unless the top returned source is the newly indexed document. This covers the core portfolio proof that new operational knowledge can be added and retrieved without manually resetting the system.

## Retrieval Comparison

Run vector-only:

```bash
RETRIEVAL_MODE=vector pnpm eval
```

Run hybrid:

```bash
docker compose --profile search up -d
ENABLE_ELASTICSEARCH=true RETRIEVAL_MODE=hybrid pnpm eval
```

Hybrid mode is expected to improve exact-match operational queries such as error codes, API paths, metric names, and log keys.
