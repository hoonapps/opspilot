# Runbook 예시

질문:

```text
정산 배치가 30분 이상 지연되면 체크리스트가 뭐야?
```

`payments` 팀 사용자의 기대 동작:

1. `team/settlement-runbook.md`를 검색합니다.
2. runbook의 체크리스트를 답변합니다.
3. 출처 문서를 함께 반환합니다.
4. `search_documents` 도구 호출을 저장합니다.
5. checklist 구조가 있으면 `create_runbook_checklist` 도구 호출을 저장합니다.

`payments` 팀이 아닌 사용자의 기대 동작:

1. `team/settlement-runbook.md`를 source로 반환하지 않습니다.
2. confidence가 낮거나 담당자 확인이 필요하다고 안내합니다.
3. `no_sources` 또는 `low_confidence` review reason을 포함합니다.
4. 팀 문서 내용을 답변에 노출하지 않습니다.
