# API 계약

Swagger UI 문서:

```txt
GET /docs
```

OpenAPI JSON 문서:

```txt
GET /docs-json
```

## 주요 API

- `POST /ask`: RAG 답변 생성
- `POST /retrieval/preview`: 답변 생성 전 검색 후보, 후보별 랭킹 설명, 권한 감사, 검색 실행 계획, 검색 품질 진단 확인
- `POST /incidents/plan`: 런북 기반 장애 대응 플랜, 심각도, 승인 경계, 커뮤니케이션, 복구 검증 생성
- `GET /documents`: 문서 목록, 청크 수, 보안 메타데이터 확인
- `GET /documents/index-quality`: 색인 품질 리포트, 게이트, 문서별 청크/버전/헤딩/보안 점검 결과 확인
- `POST /documents/markdown`: Markdown 문서 등록/재색인
- `GET /documents/{id}/versions`: redacted 문서 버전과 diff 확인
- `GET /documents/{id}/impact`: 해당 문서를 출처로 사용한 과거 답변, stale 여부, 위험도, 재검증 권고 확인
- `POST /documents/github/sync`: GitHub Markdown 동기화
- `GET /documents/indexing-jobs`: BullMQ 색인 큐 카운트, 최근 작업, 워커 상태 확인
- `POST /documents/indexing-jobs/markdown`: BullMQ 색인 작업 생성
- `GET /permission-boundary/matrix`: 페르소나별 문서 접근 매트릭스
- `GET /answers/{id}/trace`: 답변 실행 추적 복원
- `GET /answers/{id}/proof`: 답변 증명 패킷
- `GET /answers/{id}/replay`: 현재 문서 기준 답변 변경 감지
- `GET /answers/{id}/evidence-bundle`: 추적, 증명, 재실행, 권한 재검사, SHA-256 무결성 해시를 묶은 감사용 증거 번들
- `GET /answers/{id}/quality-gate`: 개별 답변을 공유 가능/검토 필요/차단으로 판정하는 신뢰 게이트
- `GET /questions/{id}/audit-bundle`: 질문 기준 출처 계보, tool calling 정책 검사, 승인/피드백, 권한 재검사, SHA-256 해시를 묶은 감사 번들
- `GET /tool-calls/registry`: 에이전트 도구 계약 확인
- `GET /tool-calls/recent`: 최근 도구 호출 감사 로그
- `GET /approvals`: 승인 대기열
- `PATCH /approvals/{id}`: 승인/반려 처리
- `POST /feedback`: 답변 피드백 저장
- `GET /evaluations/latest`: 최신 평가 결과
- `GET /evaluations/history`: 평가 이력
- `GET /evaluations/cases`: 최신 평가 run의 케이스별 실패 원인, 위험도, 개선 권고
- `GET /observability/summary`: 운영 지표 요약
- `GET /observability/api-requests`: HTTP API 요청 성공률, p95 지연, 엔드포인트별 오류율
- `GET /observability/slo`: SLO 가드레일
- `GET /observability/release-gate`: 배포 가능성 게이트
- `POST /slack/events`: Slack Events API
- `POST /slack/simulate`: Slack 로컬 시뮬레이션

## 계약 검증

```bash
pnpm openapi:smoke
```

이 명령은 포트폴리오 핵심 API, 요청 스키마, `x-opspilot-actor-token` 보안 스키마가 OpenAPI 문서에 남아 있는지 검증합니다. 기능이 커져도 공개 API가 조용히 깨지지 않게 하는 장치입니다.

## `/ask` 멱등성

## 검색 미리보기 랭킹 설명

`POST /retrieval/preview`의 `candidates[].rankingExplanation`은 검색 후보가 상위에 오른 이유를 기계적으로 설명합니다.

- `method`: 벡터/키워드 가중 랭킹 또는 RRF 하이브리드 랭킹
- `matchedQueryTerms`: 제목, 경로, 본문에 실제로 매칭된 검색어
- `scoreContributions`: 벡터 유사도, 키워드 매칭, RRF 결합 점수의 기여도
- `accessDecision`: 권한 필터를 통과한 이유와 적용된 enforcement
- `reasonCodes`: 포트폴리오 데모와 테스트에서 확인하기 쉬운 결정 코드

이 필드는 답변 생성 전 단계에서 “검색 품질이 왜 충분한지”, “권한 경계가 어디서 적용됐는지”, “문서 내용과 질문이 어떻게 연결됐는지”를 확인하기 위한 감사용 데이터입니다.

## 색인 품질 리포트

```txt
GET /documents/index-quality
```

응답은 전체 지식 베이스가 RAG 검색에 쓸 수 있는 상태인지 서버에서 판정합니다.

- `summary`: 문서 수, 청크 수, 평균 청크 길이, 공개/팀/제한 문서 분포, 마스킹 수, 프롬프트 주입 위험 수
- `gates`: 문서 존재, 청크 커버리지, 버전 커버리지, 청크 크기, 보안 격리 게이트
- `documents[]`: 문서별 청크 수, 최신 버전, 본문 길이, 헤딩 커버리지, 보안 상태, 권고 사항

검증:

```bash
pnpm index-quality:smoke
```

## 문서 변경 영향 분석

```txt
GET /documents/{id}/impact
```

응답은 특정 문서가 과거 RAG 답변에 어떤 영향을 줬는지 서버에서 계산합니다.

- `summary.affectedAnswerCount`: 이 문서를 출처로 사용한 저장 답변 수
- `summary.topSourceAnswerCount`: 이 문서가 1순위 근거였던 답변 수
- `summary.staleAnswerCount`: 문서 변경 시각보다 오래된 답변 수
- `summary.humanReviewAnswerCount`: 사람 검토가 필요했던 답변 수
- `summary.riskLevel`: 낮은 영향, 검토 필요, 우선 재검증
- `affectedAnswers[]`: 질문, 답변 미리보기, 출처 순위/점수, stale 여부
- `recommendations[]`: replay 재검증, 승인 이력 확인, 권한 경계 검증 같은 운영 조치

검증:

```bash
pnpm document-impact:smoke
```

## 장애 대응 플랜

```txt
POST /incidents/plan
```

요청은 장애 상황 문장과 선택 limit을 받습니다. 응답은 검색된 운영 문서와 런북을 근거로 아래 구조를 반환합니다.

- `severity`: SEV1/SEV2/SEV3 심각도
- `phases`: 상황 파악, 완화 조치, 커뮤니케이션, 복구 검증 단계
- `approvalGates`: 자동 실행하지 않을 민감 작업과 사람 승인 사유
- `communications`: 알림 채널, 트리거, 메시지 초안
- `verification`: 복구 확인 조건과 근거 문서
- `audit`: 저장된 question id와 `search_documents`, `create_runbook_checklist`, `create_incident_response_plan` 도구 호출

검증:

```bash
pnpm incident-plan:smoke
pnpm question-audit:smoke
```

장애 대응 플랜은 일반 답변 row를 만들지 않지만, `audit.persistedQuestionId`로 `GET /questions/{id}/audit-bundle`을 호출하면 같은 실행을 질문 단위로 검증할 수 있습니다. 응답은 `opspilot.question_audit_bundle.v1` 스키마를 사용하며, 도구 레지스트리 기준 기대 상태와 실제 tool call 상태가 일치하는지, 호출자 권한으로 출처 접근을 다시 확인했는지, 어떤 문서 경로가 근거로 쓰였는지, 번들 무결성 해시가 무엇인지 반환합니다.

## `/ask` 멱등성

`POST /ask`는 선택 헤더 `x-idempotency-key`를 지원합니다. 같은 호출자 범위에서 같은 키와 같은 본문이 다시 들어오면 새로운 질문, 답변, 승인 요청을 만들지 않고 기존 응답을 재사용합니다.

```bash
curl -X POST http://localhost:3000/ask \
  -H "content-type: application/json" \
  -H "x-user-id: demo-operator" \
  -H "x-team-slugs: payments" \
  -H "x-user-roles: ops_admin" \
  -H "x-idempotency-key: demo-ask-001" \
  -d '{"question":"E102 에러가 발생하면 어떻게 대응해야 해?","channel":"demo"}'
```

응답의 `idempotency.replayed`가 `false`면 최초 처리, `true`면 재사용입니다. 같은 키로 다른 질문이나 채널을 보내면 HTTP 409를 반환합니다. 재사용 요청은 `/ask` 호출 제한을 추가로 소모하지 않습니다.

검증:

```bash
pnpm idempotency:smoke
```

## 답변 증거 번들

```txt
GET /answers/{id}/evidence-bundle
```

응답은 `opspilot.answer_evidence_bundle.v1` 스키마를 사용합니다. 번들에는 원본 추적, 증명 체크리스트, 현재 문서 기준 재실행 결과, 호출자 역할/팀 경계, 출처 접근 재검사 여부, 문서 일치율, 근거 커버리지, 출처별 근거 스니펫, 도구/승인/피드백 건수가 들어갑니다.

`integrity.hash`는 반환된 번들 내용을 안정 JSON으로 정규화한 뒤 SHA-256으로 계산합니다. 이 값은 “이 화면에서 보여준 감사 증거가 나중에 조용히 바뀌지 않았는지” 확인하기 위한 포트폴리오용 증거입니다.

검증:

```bash
pnpm evidence-bundle:smoke
```

## 답변 신뢰 게이트

```txt
GET /answers/{id}/quality-gate
```

응답은 개별 답변을 운영 채널에 그대로 공유해도 되는지 서버에서 판정합니다. 시스템 전체 품질을 보는 `GET /observability/release-gate`와 달리, 이 엔드포인트는 특정 `answerId` 하나의 증거를 기준으로 판단합니다.

- `status`: `pass`, `review`, `block`
- `decision.recommendedAction`: `share`, `review_before_share`, `block_and_rework`
- `summary.proofStatus`: 증명 패킷 상태
- `summary.replayStatus`: 현재 문서 기준 재실행 안정성
- `summary.approvalStatus`: 민감 작업 승인 필요 여부와 처리 상태
- `summary.positiveFeedbackCount`, `negativeFeedbackCount`: 리뷰 피드백 신호
- `checks[]`: 증명 패킷, replay, 승인, 피드백, confidence, 문서 일치율, 근거 커버리지, 출처 겹침, 권한 경계 체크
- `evidenceLinks`: trace/proof/replay/evidence-bundle API 경로

검증:

```bash
pnpm quality-gate:smoke
```

스모크는 긍정 피드백 전 답변이 `review`에 머무는지, 피드백 후 `pass`가 되는지, 민감 작업 답변이 승인 대기 때문에 `review_before_share`로 남는지 확인합니다.

## 질문 감사 번들

```txt
GET /questions/{id}/audit-bundle
```

응답은 답변이 생성된 `/ask` 질문뿐 아니라 `POST /incidents/plan`처럼 구조화된 workflow만 만든 질문도 감사할 수 있게 설계했습니다.

- `summary.status`: 검증됨, 검토 필요, 정책 위반, 근거 부족
- `policyChecks`: `search_documents`, `create_runbook_checklist`, `create_incident_response_plan`, `request_human_approval`의 기대 상태와 실제 상태 비교
- `evidence.sources`: answer source 또는 search tool output에서 복원한 출처 계보
- `decisionPath`: 질문 저장, 도구 호출, 답변/출처/승인/피드백, 정책 검사 타임라인
- `actorBoundary`: 현재 호출자의 역할/팀과 출처 접근 재검사 여부
- `integrity.hash`: 안정 JSON 기반 SHA-256 해시

검증:

```bash
pnpm question-audit:smoke
```
