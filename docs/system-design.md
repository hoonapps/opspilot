# 시스템 설계

OpsPilot은 운영 지식 기반 AI Agent를 만들기 위한 RAG 백엔드와 감사 가능한 운영 콘솔로 구성됩니다.

## 구성 요소

- API: NestJS HTTP API. 문서 색인, 질문 처리, 검색 미리보기, 권한 감사, 답변 trace/proof/replay, 평가, 승인, 피드백, Slack 이벤트를 담당합니다.
- Web Console: Next.js 한국어 콘솔. 질문, 검색, 문서, 품질, 승인, 감사, 사용법 화면으로 나뉩니다.
- PostgreSQL: 문서, chunk, embedding, 질문, 답변, 출처, 도구 호출, 승인, 피드백, 평가 결과를 저장합니다.
- pgvector: 권한이 적용된 semantic retrieval을 수행합니다.
- Redis/BullMQ: 비동기 문서 색인 작업과 `/ask` rate limit에 사용합니다.
- Elasticsearch: 선택형 BM25 검색 확장입니다. hybrid 모드에서도 권한 기준은 PostgreSQL입니다.
- AI adapter: 로컬 deterministic 모드, OpenAI, Anthropic adapter를 제공합니다.
- Slack Bot: Slack mention을 같은 Agent workflow로 처리하고 thread reply payload를 만듭니다.
- Docker Compose: 로컬 인프라와 production-style 데모 실행을 제공합니다.

## 요청 흐름

1. 사용자가 웹 콘솔, API, Slack에서 질문합니다.
2. API는 signed actor token, 로컬 header, Slack identity로 actor context를 만듭니다.
3. `/ask`는 Redis fixed-window rate limit을 먼저 확인합니다.
4. actor의 role/team 기준으로 문서 권한 필터를 구성합니다.
5. `search_documents` tool이 접근 가능한 chunk만 검색합니다.
6. 검색 결과는 문서 권한으로 다시 확인된 뒤 context budget에 들어갑니다.
7. runbook 질문이면 `create_runbook_checklist` tool을 호출합니다.
8. Agent가 출처 기반 답변을 생성합니다.
9. 답변과 출처 chunk 사이의 문서 일치율을 계산합니다.
10. 낮은 confidence, 출처 없음, 민감 작업은 `reviewReasons`로 구조화합니다.
11. 민감 작업은 `request_human_approval` 도구 호출과 approval record로 분리합니다.
12. 질문, 답변, 출처, 권한 감사, 도구 호출, approval, feedback을 저장합니다.
13. `GET /answers/:id/trace`는 저장된 답변 실행 내역을 복원합니다.
14. `GET /answers/:id/proof`는 trace를 pass/warn/fail 증거 패킷으로 요약합니다.
15. `GET /answers/:id/replay`는 현재 문서 기준으로 이전 답변의 drift를 확인합니다.
16. observability/배포 게이트 API가 운영 품질 상태를 집계합니다.

## 문서 색인 흐름

1. Markdown frontmatter를 파싱합니다.
2. secret redaction을 먼저 수행합니다.
3. prompt-injection pattern을 탐지합니다.
4. Markdown을 heading/paragraph 기준으로 chunking합니다.
5. embedding을 생성합니다.
6. PostgreSQL `document_chunks`와 pgvector 컬럼에 저장합니다.
7. 선택적으로 Elasticsearch에 redacted chunk를 mirror합니다.
8. 같은 path 재색인 시 obsolete chunk를 정리하고 문서 버전을 남깁니다.

## 권한 경계

핵심 원칙은 “권한 없는 chunk는 LLM 프롬프트에 들어가기 전에 제거한다”입니다. 답변 생성 후 숨기는 방식이 아닙니다.

- `public`: 모든 사용자 접근 가능
- `team`: 사용자 `teamSlugs`와 문서 `teamSlug`가 일치해야 접근 가능
- `restricted`: `ops_admin` 또는 `security_admin` 필요

검색 로그는 차단 후보 개수와 visibility bucket만 저장합니다. 권한 없는 사용자에게 차단된 문서 제목이나 path를 노출하지 않습니다.

## 배포 관점

로컬 데모는 Docker Compose로 PostgreSQL, Redis, 선택형 Elasticsearch를 올립니다. production-style profile은 API, Web, Worker, PostgreSQL, Redis 컨테이너를 함께 띄우며, CI에서 실제 `/ask` 요청까지 검증합니다.
