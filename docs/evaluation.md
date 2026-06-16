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

## Planned Additions

- groundedness check per answer sentence
- citation accuracy review
- regression test for newly added documents

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
