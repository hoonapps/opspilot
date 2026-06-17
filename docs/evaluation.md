# Evaluation

OpsPilot evaluates RAG behavior with a seed question set.

## Metrics

- Source hit rate: whether the expected document appears in returned sources
- Top source accuracy: whether the first returned source is the expected document
- Human review accuracy: whether restricted or sensitive questions are routed to human review
- Document agreement score: how much of the answer's content-bearing tokens are supported by returned source chunks
- Citation accuracy: whether the answer cites at least one returned source title or path
- Confidence: retrieval-derived score stored with each answer

## Run

```bash
pnpm eval
```

The evaluation command ingests seed documents, asks each question, stores metric rows in `evaluation_results`, and prints a JSON report.

Document agreement is deterministic and does not call an LLM judge. It removes citation/review boilerplate, tokenizes the answer and returned source chunks, then calculates the percentage of answer tokens that also appear in the cited source context. This is not a full factuality proof, but it is a stable regression signal for whether answers stay grounded in retrieved documents.

The same calculation is returned by `/ask` as `documentAgreement`, stored in answer metadata, rendered in the web console as `Match`, and verified by `pnpm agreement:smoke`. This lets a portfolio demo show the final answer's source-document match ratio without running the full evaluation suite.

## Quality Gates

`pnpm eval` fails with a non-zero exit code when any metric falls below its threshold. Defaults:

```txt
EVAL_MIN_SOURCE_HIT_RATE=1
EVAL_MIN_TOP_SOURCE_ACCURACY=1
EVAL_MIN_HUMAN_REVIEW_ACCURACY=1
EVAL_MIN_DOCUMENT_AGREEMENT_SCORE=0.8
EVAL_MIN_CITATION_ACCURACY=1
```

The JSON report includes `passed`, `thresholds`, and per-metric `gates` so CI logs and the web console can show exactly which metric failed.

`pnpm eval:gate-smoke` runs a deliberate negative case with an impossible expected source. The command succeeds only when the evaluation report fails the source hit and top source gates. This proves the gate itself is being tested, not only the happy-path eval set.

## Latest Report API

```txt
GET /evaluations/latest
GET /evaluations/latest?suiteName=seed-ops-wiki
```

The API returns the latest source hit rate, top source accuracy, human review accuracy, document agreement score, citation accuracy, pass/fail state, thresholds, total case count, and per-question rows for the requested suite. The web console uses this endpoint for the quality gate panel and case explorer.

The case explorer renders each row with expected sources, actual ranked sources, source hit/miss, confidence, document agreement, citation state, and human review state. This makes eval failures debuggable from the browser instead of reducing quality to one aggregate score.

## Planned Additions

- larger regression set for newly added documents

## New Document Regression

`pnpm indexing:smoke` upserts a new Markdown document, asks a Korean incident communication question, and fails unless the top returned source is the newly indexed document. This covers the core portfolio proof that new operational knowledge can be added and retrieved without manually resetting the system.

## Permission Boundary Regression

`pnpm permission:smoke` asks a restricted production database question as an unprivileged actor. It fails unless restricted candidates are counted in the aggregated permission audit and no restricted source is returned to the answer.

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
