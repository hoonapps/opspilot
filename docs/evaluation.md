# Evaluation

OpsPilot evaluates RAG behavior with a seed question set.

## Metrics

- Source hit rate: whether the expected document appears in returned sources
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
- pgvector-only vs Elasticsearch hybrid comparison
- regression test for newly added documents
