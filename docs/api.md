# API 계약

Swagger UI:

```txt
GET /docs
```

OpenAPI JSON:

```txt
GET /docs-json
```

## 주요 API

- `POST /ask`: RAG 답변 생성
- `POST /retrieval/preview`: 답변 생성 전 검색 후보와 권한 감사 확인
- `GET /documents`: 문서 목록, chunk 수, 보안 metadata 확인
- `POST /documents/markdown`: Markdown 문서 등록/재색인
- `GET /documents/{id}/versions`: redacted 문서 버전과 diff 확인
- `POST /documents/github/sync`: GitHub Markdown sync
- `POST /documents/indexing-jobs/markdown`: BullMQ 색인 작업 생성
- `GET /permission-boundary/matrix`: persona별 문서 접근 matrix
- `GET /answers/{id}/trace`: 답변 실행 trace 복원
- `GET /answers/{id}/proof`: 답변 증거 packet
- `GET /answers/{id}/replay`: 현재 문서 기준 답변 drift 확인
- `GET /tool-calls/registry`: Agent 도구 계약 확인
- `GET /tool-calls/recent`: 최근 도구 호출 감사 로그
- `GET /approvals`: 승인 대기열
- `PATCH /approvals/{id}`: 승인/반려 처리
- `POST /feedback`: 답변 피드백 저장
- `GET /evaluations/latest`: 최신 평가 결과
- `GET /evaluations/history`: 평가 이력
- `GET /observability/summary`: 운영 지표 요약
- `GET /observability/slo`: SLO guardrail
- `GET /observability/release-gate`: 배포 가능성 gate
- `POST /slack/events`: Slack Events API
- `POST /slack/simulate`: Slack 로컬 시뮬레이션

## 계약 검증

```bash
pnpm openapi:smoke
```

이 명령은 포트폴리오 핵심 API와 request schema, `x-opspilot-actor-token` security scheme이 OpenAPI 문서에 남아 있는지 검증합니다. 기능이 커져도 공개 API가 조용히 깨지지 않게 하는 장치입니다.
