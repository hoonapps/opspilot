# Agent Workflow

이 문서는 OpsPilot Agent가 질문을 받았을 때 어떤 판단 순서로 검색, 도구 호출, 승인 분리를 수행하는지 설명합니다.

## Agent 도구

- `search_documents`: actor가 접근 가능한 문서 chunk를 검색합니다.
- `create_runbook_checklist`: 검색된 runbook에서 번호형 체크리스트를 추출합니다.
- `request_human_approval`: 민감 작업 요청을 approval queue에 저장합니다.
- `save_feedback`: 답변 품질 피드백을 저장합니다.

도구 registry는 다음 API로 확인합니다.

```txt
GET /tool-calls/registry
```

registry는 도구의 category, side effect, approval policy, 입력/출력 schema, 감사 저장 필드를 보여줍니다. 웹 콘솔 `감사` 화면은 이 registry와 실제 도구 호출 로그를 나란히 보여줍니다.

## 판단 순서

1. `/retrieval/preview`가 호출되면 부작용 없이 검색 후보, 후보별 랭킹 설명, 권한 감사, 검색 실행 계획, 검색 품질 진단을 먼저 보여줍니다.
2. `/ask`, Slack mention, 평가 script에서 질문을 받습니다.
3. actor context를 구성합니다.
4. `x-idempotency-key`가 있으면 actor scope와 request hash를 확인합니다.
5. 같은 key와 같은 body의 완료된 요청이면 저장된 `/ask` 응답을 replay합니다.
6. 신규 요청이면 Redis rate limit을 확인합니다.
7. `search_documents`를 호출합니다.
8. vector 모드에서는 pgvector와 PostgreSQL lexical score를 사용합니다.
9. hybrid 모드에서는 pgvector 결과와 Elasticsearch BM25 결과를 fuse합니다.
10. Elasticsearch 결과도 PostgreSQL에서 다시 로드하며 권한 필터를 적용합니다.
11. context budget에 포함된 chunk와 제외된 chunk를 기록합니다.
12. runbook/checklist 질문이면 `create_runbook_checklist`를 호출합니다.
13. 출처 기반 답변을 생성합니다.
14. confidence와 문서 일치율을 계산합니다.
15. 출처 없음, 낮은 confidence, 민감 작업을 `reviewReasons`로 만듭니다.
16. 민감 작업이면 `request_human_approval`을 호출합니다.
17. 질문, 답변, 출처, context package, 도구 호출, review reason을 저장합니다.
18. feedback은 answer id에 연결해 저장합니다.
19. Slack 요청이면 같은 결과를 thread reply payload로 포맷합니다.

## 검색 미리보기

```txt
POST /retrieval/preview
```

검색 미리보기는 `/ask`와 같은 검색 경로를 타지만 질문 저장, 답변 생성, 도구 호출 저장, approval 생성을 하지 않습니다. 응답에는 후보 청크, 후보별 랭킹 설명, 권한 감사, 검색 실행 계획, 신뢰도 추정, 최고 점수, 점수 격차, 출처 다양성, 컨텍스트 예산, 리뷰 권고가 포함됩니다. 검색 실행 계획은 질문 정규화, 후보 생성, 권한 경계, 점수 결합, 컨텍스트 패키징, 리뷰 판단 단계를 pass/warn/fail 상태와 근거 문장으로 보여줍니다. 후보별 랭킹 설명은 매칭 검색어, 점수 기여도, 권한 통과 사유를 보여줍니다. 면접 데모에서는 이 화면으로 “어떤 chunk가 왜 선택됐는지”, “권한 때문에 어떤 후보가 차단됐는지”, “이 검색 결과로 바로 답변해도 되는지”를 먼저 보여주면 좋습니다.

## 답변 증거

- `GET /answers/:id/trace`: 저장된 답변의 timeline, source, grounding, 근거 스니펫, context budget, 도구 호출, approval, feedback을 복원합니다.
- `GET /answers/:id/proof`: trace를 운영자용 pass/warn/fail checklist로 요약합니다.
- `GET /answers/:id/replay`: 현재 문서 기준으로 이전 답변의 source drift를 확인합니다.
- `GET /answers/:id/evidence-bundle`: trace, proof, replay를 하나로 묶고 actor 권한 재검사와 SHA-256 무결성 해시를 함께 반환합니다.

면접 데모에서는 민감 작업 질문을 한 뒤 evidence bundle을 보여주면 좋습니다. 한 응답 안에서 “어떤 문서가 근거였는지”, “출처 문서의 어떤 문장이 답변 토큰을 지지하는지”, “어떤 tool이 호출됐는지”, “사람 승인이 왜 필요했는지”, “현재 문서와 여전히 일치하는지”, “호출자가 같은 출처를 볼 권한이 있는지”를 모두 설명할 수 있습니다.

## Guardrail

Agent는 운영 정책과 runbook을 설명할 수 있지만 운영 변경 작업을 직접 실행하지 않습니다. production DB write, 강제 환불, 권한 부여, 파괴적 cache/queue 조작은 approval record로 분리됩니다.
