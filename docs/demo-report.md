# OpsPilot 포트폴리오 데모 리포트

생성 시각: 2026-06-17T17:50:05.980Z

전체 결과: 통과

## 증명한 항목

- RAG 답변이 문서 출처를 포함합니다.
- 새 Markdown 문서가 색인되고 검색됩니다.
- 런북 질문이 구조화된 도구 호출을 발생시킵니다.
- 민감 작업은 사람 승인으로 분리됩니다.
- 답변 추적이 출처, 도구 호출, 승인, 피드백을 복원합니다.

## 실행 증거

| 단계 | 출처 | 문서 일치율 | 도구 호출 | 사람 검토 | 검증 항목 |
| --- | --- | ---: | --- | --- | --- |
| 근거 기반 장애 답변 | public/secret-rotation-bridge.md<br>public/payment-error-codes.md<br>public/index-quality-proof.md<br>github/hoonapps/opspilot/permission-boundary.md<br>public/agreement-smoke-policy.md | 100% (1.000, 12/12 토큰) | search_documents:allowed | 필요 | 통과 결제 에러 문서가 출처에 포함<br>통과 출처 1개 이상 포함<br>통과 검색 도구 호출 저장 |
| 새 Markdown 색인 | public/status-page-policy.md<br>public/retrieval-robustness-proof.md<br>public/quality-gate-proof.md<br>public/agreement-smoke-policy.md<br>github/hoonapps/opspilot/deployment.md | 100% (1.000, 25/25 토큰) | search_documents:allowed | 불필요 | 통과 문서 등록 후 청크 생성<br>통과 새 문서가 1순위 출처<br>통과 답변에 15분 기준 포함 |
| 런북 체크리스트 도구 호출 | github/hoonapps/opspilot/runbook-example.md<br>github/hoonapps/opspilot/permission-boundary.md<br>team/settlement-runbook.md<br>team/settlement-runbook.md<br>github/hoonapps/opspilot/design.md | 94% (0.935, 43/46 토큰) | search_documents:allowed<br>create_runbook_checklist:allowed | 불필요 | 통과 정산 런북 사용<br>통과 체크리스트 도구 호출 저장<br>통과 복수 도구 호출 발생 |
| 민감 작업 승인 경계 | restricted/production-db-policy.md<br>github/hoonapps/opspilot/permission-boundary.md<br>restricted/production-db-policy.md<br>github/hoonapps/opspilot/demo.md<br>restricted/production-db-policy.md | 100% (1.000, 27/27 토큰) | search_documents:allowed<br>request_human_approval:needs_approval | 필요 | 통과 사람 검토 필요 판정<br>통과 민감 작업 검토 사유 포함<br>통과 승인 요청 도구 호출 저장<br>통과 승인 요청 생성<br>통과 추적에서 도구 호출 복원<br>통과 추적에서 피드백 복원 |

## 새 문서 색인 증거

- 경로: `public/status-page-policy.md`
- 제목: 상태 페이지 장애 공지 기준
- 색인 청크: 1
- 이번 실행에서 콘텐츠 해시 변경: 아니오
- 검색 검증: 한국어 SLA 질문을 던지고 이 문서가 1순위 출처로 반환되지 않으면 실패합니다.

## 감사 추적 증거

- 답변 ID: `39bcff5d-e2dd-405a-9755-b7a5c4aaadda`
- 출처 수: 5
- 도구 호출: search_documents:allowed, request_human_approval:needs_approval
- 승인: sensitive_operation:pending
- 피드백 수: 1

이 파일은 `pnpm portfolio:report`가 `pnpm portfolio:demo`와 같은 검증 항목을 실행한 뒤 생성합니다.
