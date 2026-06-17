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
- 운영 액션 플랜 smoke
- API 요청 관측성 smoke
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
- incident response plan smoke
- direct indexing smoke
- retrieval robustness smoke
- queue indexing smoke와 BullMQ 큐 관제 검증
- GitHub sync smoke
- document impact smoke
- evaluation case detail smoke
- review workflow smoke
- 답변 trace/proof smoke
- answer 답변 drift smoke
- answer evidence bundle smoke
- answer quality gate smoke
- portfolio demo/report
- OpenAPI contract smoke
- Playwright web smoke

CI는 “코드가 빌드된다” 수준이 아니라 포트폴리오에서 주장하는 운영 품질을 검증합니다. grounded retrieval, citation accuracy, 검색 강건성, 문서 일치율, 문서 변경 영향 분석, 답변 신뢰 게이트, 권한 경계, 사람 승인, 도구 감사, 런북 기반 장애 대응 플랜, API 요청 관측성, 운영 액션 플랜, BullMQ 색인 큐 관제, `/ask` 멱등성, Slack simulator, 평가 최신성, 배포 게이트, 웹 콘솔 흐름이 모두 깨지면 실패하도록 구성했습니다.
