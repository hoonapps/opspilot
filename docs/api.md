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
- `POST /retrieval/preview`: 답변 생성 전 검색 후보, 권한 감사, 검색 품질 진단 확인
- `GET /documents`: 문서 목록, 청크 수, 보안 메타데이터 확인
- `POST /documents/markdown`: Markdown 문서 등록/재색인
- `GET /documents/{id}/versions`: redacted 문서 버전과 diff 확인
- `POST /documents/github/sync`: GitHub Markdown 동기화
- `GET /documents/indexing-jobs`: BullMQ 색인 큐 카운트, 최근 작업, 워커 상태 확인
- `POST /documents/indexing-jobs/markdown`: BullMQ 색인 작업 생성
- `GET /permission-boundary/matrix`: 페르소나별 문서 접근 매트릭스
- `GET /answers/{id}/trace`: 답변 실행 추적 복원
- `GET /answers/{id}/proof`: 답변 증명 패킷
- `GET /answers/{id}/replay`: 현재 문서 기준 답변 변경 감지
- `GET /answers/{id}/evidence-bundle`: 추적, 증명, 재실행, 권한 재검사, SHA-256 무결성 해시를 묶은 감사용 증거 번들
- `GET /tool-calls/registry`: 에이전트 도구 계약 확인
- `GET /tool-calls/recent`: 최근 도구 호출 감사 로그
- `GET /approvals`: 승인 대기열
- `PATCH /approvals/{id}`: 승인/반려 처리
- `POST /feedback`: 답변 피드백 저장
- `GET /evaluations/latest`: 최신 평가 결과
- `GET /evaluations/history`: 평가 이력
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

응답은 `opspilot.answer_evidence_bundle.v1` 스키마를 사용합니다. 번들에는 원본 추적, 증명 체크리스트, 현재 문서 기준 재실행 결과, 호출자 역할/팀 경계, 출처 접근 재검사 여부, 문서 일치율, 근거 커버리지, 도구/승인/피드백 건수가 들어갑니다.

`integrity.hash`는 반환된 번들 내용을 안정 JSON으로 정규화한 뒤 SHA-256으로 계산합니다. 이 값은 “이 화면에서 보여준 감사 증거가 나중에 조용히 바뀌지 않았는지” 확인하기 위한 포트폴리오용 증거입니다.

검증:

```bash
pnpm evidence-bundle:smoke
```
