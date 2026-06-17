# CI

OpsPilot은 `main` push와 pull request에서 GitHub Actions를 실행합니다.

## 검증 항목

- frozen lockfile 기반 설치
- PostgreSQL + pgvector, Redis service container 실행
- DB migration
- typecheck
- build
- Jest package test
- Docker image build
- production compose smoke
- RAG 평가
- 평가 게이트 negative smoke
- 평가 이력 smoke
- 지식 최신성 smoke
- 운영 지표/SLO smoke
- 배포 게이트 smoke
- permission boundary smoke
- signed actor token smoke
- secret redaction smoke
- prompt-injection guardrail smoke
- actor rate limit smoke
- ask idempotency smoke
- readiness smoke
- document agreement smoke
- runbook checklist 도구 호출 smoke
- direct indexing smoke
- queue indexing smoke
- GitHub sync smoke
- review workflow smoke
- 답변 trace/proof smoke
- answer 답변 drift smoke
- answer evidence bundle smoke
- portfolio demo/report
- OpenAPI contract smoke
- Playwright web smoke

CI는 “코드가 빌드된다” 수준이 아니라 포트폴리오에서 주장하는 운영 품질을 검증합니다. grounded retrieval, citation accuracy, 문서 일치율, 권한 경계, 사람 승인, 도구 감사, `/ask` 멱등성, Slack simulator, 평가 최신성, 배포 게이트, 웹 콘솔 흐름이 모두 깨지면 실패하도록 구성했습니다.
