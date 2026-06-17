# OpsPilot 포트폴리오 데모 리포트

생성 시각: 2026-06-17T08:02:17.527Z

전체 결과: PASS

## 증명한 항목

- RAG 답변이 문서 출처를 포함합니다.
- 새 Markdown 문서가 색인되고 검색됩니다.
- Runbook 질문이 구조화된 도구 호출을 발생시킵니다.
- 민감 작업은 사람 승인으로 분리됩니다.
- Answer trace가 출처, 도구 호출, 승인, 피드백을 복원합니다.

## 실행 증거

| 단계 | 출처 | 문서 일치율 | 도구 호출 | 사람 검토 | Assertion |
| --- | --- | ---: | --- | --- | --- |
| 근거 기반 장애 답변 | public/payment-error-codes.md<br>github/hoonapps/opspilot/permission-boundary.md<br>github/hoonapps/opspilot/runbook-example.md<br>github/hoonapps/opspilot/design.md<br>github/hoonapps/opspilot/indexing.md | 100% (1.000, 14/14 토큰) | search_documents:allowed | 필요 | PASS topSourceIsPaymentErrors<br>PASS citesAtLeastOneSource<br>PASS searchToolLogged |
| 새 Markdown 색인 | public/status-page-policy.md<br>github/hoonapps/opspilot/deployment.md<br>public/agreement-smoke-policy.md<br>github/hoonapps/opspilot/api.md<br>github/hoonapps/opspilot/api.md | 100% (1.000, 21/21 토큰) | search_documents:allowed | 불필요 | PASS upsertCreatedChunks<br>PASS topSourceIsNewDocument<br>PASS answerMentionsFifteenMinutes |
| Runbook checklist 도구 호출 | github/hoonapps/opspilot/runbook-example.md<br>github/hoonapps/opspilot/permission-boundary.md<br>team/settlement-runbook.md<br>github/hoonapps/opspilot/design.md<br>public/replay-drift-proof.md | 94% (0.935, 43/46 토큰) | search_documents:allowed<br>create_runbook_checklist:allowed | 불필요 | PASS usesSettlementRunbook<br>PASS checklistToolLogged<br>PASS hasToolCalling |
| 민감 작업 승인 경계 | restricted/production-db-policy.md<br>github/hoonapps/opspilot/permission-boundary.md<br>public/refund-policy.md<br>github/hoonapps/opspilot/demo.md<br>public/refund-policy.md | 100% (1.000, 16/16 토큰) | search_documents:allowed<br>request_human_approval:needs_approval | 필요 | PASS requiresHumanReview<br>PASS includesSensitiveReason<br>PASS approvalToolLogged<br>PASS approvalCreated<br>PASS traceReconstructsToolCalls<br>PASS traceIncludesFeedback |

## 새 문서 색인 증거

- Path: `public/status-page-policy.md`
- 제목: Status Page Incident Communication
- 색인 chunk: 2
- 이번 실행에서 content hash 변경: 아니오
- 검색 검증: 한국어 SLA 질문을 던지고 이 문서가 top source로 반환되지 않으면 실패합니다.

## 감사 trace 증거

- Answer ID: `b33e38b4-09ea-4dc8-b4db-096ac52feb02`
- 출처 수: 5
- 도구 호출: search_documents:allowed, request_human_approval:needs_approval
- 승인: sensitive_operation:pending
- 피드백 수: 1

이 파일은 `pnpm portfolio:report`가 `pnpm portfolio:demo`와 같은 assertion을 실행한 뒤 생성합니다.
