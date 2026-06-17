# 런북 예시

질문:

```text
정산 배치가 30분 이상 지연되면 체크리스트가 뭐야?
```

`payments` 팀 사용자의 기대 동작:

1. `team/settlement-runbook.md`를 검색합니다.
2. 런북의 체크리스트를 답변합니다.
3. 출처 문서를 함께 반환합니다.
4. `search_documents` 도구 호출을 저장합니다.
5. checklist 구조가 있으면 `create_runbook_checklist` 도구 호출을 저장합니다.

장애 대응 플랜 질문:

```text
정산 배치가 30분 이상 지연되고 settlement.dlq.count가 120이면 어떻게 대응해야 해?
```

기대 동작:

1. `team/settlement-runbook.md`를 1순위 플랜 근거로 사용합니다.
2. SEV 심각도를 계산합니다.
3. 상황 파악, 완화 조치, 커뮤니케이션, 복구 검증 단계를 생성합니다.
4. `pause settlement retry jobs`처럼 운영 영향이 있는 작업은 승인 게이트로 분리합니다.
5. `create_incident_response_plan` 도구 호출을 감사 로그에 저장합니다.

`payments` 팀이 아닌 사용자의 기대 동작:

1. `team/settlement-runbook.md`를 출처로 반환하지 않습니다.
2. 신뢰도가 낮거나 담당자 확인이 필요하다고 안내합니다.
3. `no_sources` 또는 `low_confidence` 검토 사유를 포함합니다.
4. 팀 문서 내용을 답변에 노출하지 않습니다.
