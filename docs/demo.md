# 포트폴리오 데모

`pnpm portfolio:demo`는 브라우저 없이 핵심 시나리오를 실행하는 간단한 전체 흐름 데모입니다.

## 검증하는 내용

- 일반 장애 질문이 문서 출처와 함께 답변되는지
- 새 Markdown 문서가 색인되고 1순위 출처로 검색되는지
- 런북 질문에서 `create_runbook_checklist` 도구가 호출되는지
- 운영 DB 수정 같은 민감 작업이 사람 승인으로 분리되는지
- 답변 추적이 출처, 도구 호출, 승인, 피드백을 복원하는지
- 증명 패킷이 근거성, 정책, 컨텍스트 예산, 피드백을 요약하는지

## 실행

```bash
docker compose up -d postgres redis
pnpm --filter @opspilot/api db:migrate
pnpm portfolio:demo
```

Markdown 리포트를 남기려면:

```bash
pnpm portfolio:report
```

결과는 [docs/demo-report.md](docs/demo-report.md)에 저장됩니다.
