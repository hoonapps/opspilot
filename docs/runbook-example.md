# Runbook Example

Question:

```text
정산 배치가 30분 이상 지연되면 체크리스트가 뭐야?
```

Expected behavior for a `payments` team user:

1. Retrieve `team/settlement-runbook.md`.
2. Return the checklist from the runbook.
3. Include the source document.
4. Store question, answer, source, and `search_documents` tool call.

Expected behavior for a user without the `payments` team:

1. Do not retrieve `team/settlement-runbook.md`.
2. Return low confidence or ask for 담당자 확인.
3. Do not expose restricted team content in the answer.
