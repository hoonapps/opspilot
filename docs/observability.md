# Observability

OpsPilot은 RAG Agent를 운영 시스템처럼 다루기 위해 답변, 도구 호출, approval, feedback, 평가 상태를 지표로 집계합니다.

## API

- `GET /observability/summary`: 질문 수, 답변 수, 평균 confidence, 문서 일치율, 도구 호출, approval, feedback, 색인 문서 규모
- `GET /observability/slo`: grounding, review load, 도구 감사 coverage, 최신 eval gate를 SLO guardrail로 변환
- `GET /observability/release-gate`: readiness, indexed knowledge, eval freshness, SLO, audit trail, approval backlog, feedback signal을 종합

## 검증

```bash
pnpm observability:smoke
pnpm observability:slo-smoke
pnpm release-gate:smoke
```

웹 콘솔 `품질` 화면에서 운영 지표와 배포 게이트 상태를 확인할 수 있습니다.
