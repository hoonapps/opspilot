# OpsPilot

[![CI](https://github.com/hoonapps/opspilot/actions/workflows/ci.yml/badge.svg)](https://github.com/hoonapps/opspilot/actions/workflows/ci.yml)

운영 문서, runbook, 장애 대응 정책, Slack 질문을 기반으로 답변하는 권한 인식 RAG Agent 플랫폼입니다. OpsPilot은 단순 문서 검색 데모가 아니라 “실제 운영 업무에 AI Agent를 붙이면 어디까지 검증해야 하는가”를 보여주기 위한 포트폴리오 프로젝트입니다.

![OpsPilot 대시보드 미리보기](docs/assets/opspilot-dashboard.svg)

![OpsPilot 웹 콘솔](docs/assets/opspilot-web-console.png)

## 핵심 가치

OpsPilot은 다음 질문에 답하는 구조로 설계했습니다.

- RAG 답변이 실제 문서 출처와 연결되는가?
- 새로운 Markdown 문서를 넣으면 청킹, 임베딩, 색인, 검색, 답변까지 즉시 검증되는가?
- 문서 권한 경계가 LLM 프롬프트 생성 전에 적용되는가?
- Slack 질문도 API와 같은 RAG/tool-calling 경로를 타는가?
- Agent가 어떤 tool을 호출했고, 어떤 호출은 사람 승인이 필요한지 감사할 수 있는가?
- 답변과 근거 문서의 일치율, 출처 적중률, citation 정확도를 평가할 수 있는가?
- 이전 답변이 문서 변경 이후에도 여전히 유효한지 답변 drift로 확인할 수 있는가?
- prompt injection, secret 유출, 과도한 `/ask` 호출 같은 운영 리스크를 막는 guardrail이 있는가?

## 현재 구현 범위

- NestJS + TypeScript API
- PostgreSQL + pgvector 기반 권한 인식 RAG 검색
- Redis + BullMQ 기반 비동기 문서 색인
- 선택형 Elasticsearch hybrid 검색
- Markdown 문서 업로드, 버전 이력, diff, chunk 미리보기
- GitHub Markdown 문서 동기화
- `/ask` API와 출처 포함 답변
- 답변별 문서 일치율, source grounding coverage, proof packet
- 답변 trace/proof/replay/evidence bundle API
- role/team 기반 문서 권한 필터링과 permission boundary matrix
- prompt-injection 문서 격리
- secret redaction
- actor 단위 `/ask` rate limit
- actor scope 기반 `/ask` idempotency key
- runbook checklist 도구 호출
- 민감 작업 사람 승인 분리
- 도구 registry와 도구 호출 감사 로그
- Slack Events API와 로컬 Slack mention 시뮬레이터
- 평가 게이트, 최신성 게이트, 배포 게이트, SLO guardrail
- 한국어 Next.js 웹 콘솔
- Docker Compose 로컬/프로덕션 데모
- GitHub Actions CI 전체 검증

## 기술 스택

- Backend: NestJS, TypeScript
- ORM: MikroORM
- Database: PostgreSQL + pgvector
- Queue/cache: Redis, BullMQ
- Search: pgvector 기본, Elasticsearch 선택형 hybrid 검색
- AI: 로컬 deterministic embedding/answer 기본값, OpenAI/Anthropic adapter 구조
- Integration: Slack Bot
- Web: Next.js
- Infra: Docker Compose

## 빠른 시작

```bash
pnpm install
cp .env.example apps/api/.env
docker compose up -d postgres redis
pnpm --filter @opspilot/api db:migrate
pnpm ingest
pnpm dev:api
```

다른 터미널에서 웹 콘솔을 실행합니다.

```bash
pnpm dev:web
```

웹 콘솔:

```txt
http://localhost:3001
```

API 문서:

```txt
http://localhost:3000/docs
```

## 사용법

자세한 로컬 실행 순서와 데모 시나리오는 [docs/usage.md](docs/usage.md)에 정리했습니다.

웹 콘솔에서도 `사용법` 화면을 열면 다음 흐름을 그대로 따라 할 수 있습니다.

1. PostgreSQL/Redis 실행
2. DB migration
3. seed Markdown 문서 색인
4. 새 Markdown 문서 등록
5. 청킹/검색 미리보기/답변 일치율 확인
6. 권한 경계와 차단 후보 확인
7. 도구 호출과 사람 승인 확인
8. 평가/배포 게이트 확인
9. 포트폴리오 데모 리포트 생성

## API 예시

질문하기:

```bash
curl -X POST http://localhost:3000/ask \
  -H "content-type: application/json" \
  -H "x-team-slugs: payments" \
  -H "x-user-roles: ops_admin" \
  -d '{"question":"E102 에러가 발생하면 어떻게 대응해야 해?"}'
```

검색 미리보기:

```bash
curl -X POST http://localhost:3000/retrieval/preview \
  -H "content-type: application/json" \
  -H "x-team-slugs: payments" \
  -d '{"question":"정산 배치가 30분 이상 지연되면 어떻게 해?","limit":5}'
```

Slack mention 로컬 시뮬레이션:

```bash
pnpm slack:simulate
```

## 문서 관리 방식

문서는 세 경로로 관리합니다.

- 로컬 seed 문서: `seed/documents`
- 웹 콘솔에서 추가하는 Markdown: `문서` 화면의 Markdown 등록 폼
- GitHub 문서: `문서` 화면의 GitHub Markdown 동기화 폼

등록된 문서는 다음 과정을 거칩니다.

1. frontmatter 파싱
2. secret redaction
3. prompt-injection scan
4. Markdown chunking
5. embedding 생성
6. PostgreSQL/pgvector 저장
7. 선택적으로 Elasticsearch mirror 저장
8. 기존 같은 path 문서의 obsolete chunk 정리

문서 화면은 문서 목록, chunk 수, redaction 수, prompt-injection 격리 여부, 버전 diff, chunk preview, 권한 매트릭스, 신규 문서 검색 검증 결과를 보여줍니다.

## RAG 검증

OpsPilot은 답변만 보여주지 않고, 아래 증거를 함께 보여줍니다.

- 검색된 출처 path
- vector/lexical/fused score
- 문서 일치율
- source grounding coverage
- 컨텍스트 예산에 포함/제외된 chunk
- 권한으로 차단된 후보 수
- 도구 호출 기록
- 사람 승인 여부
- answer proof packet
- 답변 drift 결과
- 권한 재검사와 SHA-256 해시가 포함된 answer evidence bundle
- Slack retry와 브라우저 중복 제출을 막는 `/ask` idempotency

주요 검증 명령:

```bash
pnpm eval
pnpm indexing:smoke
pnpm agreement:smoke
pnpm trace:smoke
pnpm replay:smoke
pnpm evidence-bundle:smoke
pnpm permission:smoke
pnpm prompt-injection:smoke
pnpm rate-limit:smoke
pnpm idempotency:smoke
```

## 포트폴리오 데모

브라우저 없이 핵심 시나리오를 한 번에 검증합니다.

```bash
pnpm portfolio:demo
```

Markdown 증거 리포트를 생성합니다.

```bash
pnpm portfolio:report
```

생성 결과는 [docs/demo-report.md](docs/demo-report.md)에 저장됩니다. 이 리포트는 grounded RAG, 신규 문서 색인, runbook 도구 호출, 사람 승인, 답변 trace 복원을 한 번에 보여줍니다.

웹 콘솔까지 검증하고 README 스크린샷을 갱신합니다.

```bash
pnpm web:smoke
```

## Elasticsearch

Elasticsearch는 필수가 아니라 선택형입니다. 기본 RAG 경로는 PostgreSQL + pgvector로 동작합니다.

Elasticsearch hybrid 검색을 로컬에서 켜려면:

```bash
docker compose --profile search up -d
ENABLE_ELASTICSEARCH=true RETRIEVAL_MODE=hybrid pnpm ingest
ENABLE_ELASTICSEARCH=true RETRIEVAL_MODE=hybrid pnpm dev:api
```

로컬 포트:

- PostgreSQL: `localhost:25432`
- Redis: `localhost:26379`
- Elasticsearch: `localhost:29200`

Elasticsearch 결과는 권한의 기준으로 신뢰하지 않습니다. hybrid 모드에서도 Elasticsearch가 반환한 chunk id를 PostgreSQL에서 다시 로드하고, 같은 권한 필터를 통과한 chunk만 답변 컨텍스트에 들어갑니다.

## 보안 경계

- `public`: 모든 사용자 접근 가능
- `team`: 문서의 `teamSlug`와 사용자 `teamSlugs`가 맞을 때 접근 가능
- `restricted`: `ops_admin` 또는 `security_admin`만 접근 가능

권한 필터는 검색/프롬프트 생성 전에 적용됩니다. 접근 불가능한 chunk는 답변, 출처, trace preview에 포함되지 않습니다.

민감 작업은 Agent가 직접 실행하지 않습니다. 운영 DB 수정, 강제 환불, 권한 부여 같은 요청은 `request_human_approval` 도구 호출과 approval record로 분리됩니다.

`POST /ask`는 `x-idempotency-key`를 지원합니다. 같은 actor scope에서 같은 key와 같은 request body가 다시 들어오면 기존 `answerId`를 replay하고, 같은 key로 다른 질문을 보내면 HTTP 409로 차단합니다. replay 요청은 rate limit을 추가로 소모하지 않습니다.

## 품질 게이트

기본 평가 threshold:

```txt
EVAL_MIN_SOURCE_HIT_RATE=1
EVAL_MIN_TOP_SOURCE_ACCURACY=1
EVAL_MIN_HUMAN_REVIEW_ACCURACY=1
EVAL_MIN_DOCUMENT_AGREEMENT_SCORE=0.8
EVAL_MIN_CITATION_ACCURACY=1
```

`pnpm eval`은 threshold가 깨지면 실패합니다. `freshness:smoke`와 `release-gate:smoke`는 문서가 바뀐 뒤 최신 평가가 stale 상태가 되는지, 재평가 후 gate가 회복되는지 검증합니다.

## CI

GitHub Actions는 다음 범위를 검증합니다.

- typecheck/build/test
- Docker image build
- production compose smoke
- DB migration
- RAG 평가
- 평가 이력/최신성/배포 게이트
- permission boundary
- signed actor token
- secret redaction
- prompt-injection guardrail
- actor rate limit
- ask idempotency
- readiness
- document agreement
- indexing/queue indexing/GitHub sync
- review workflow
- 답변 trace/proof/replay
- answer evidence bundle
- portfolio demo/report
- observability/SLO
- OpenAPI contract
- Playwright web smoke

자세한 내용은 [docs/ci.md](docs/ci.md)를 참고하세요.

## 주요 문서

- [사용법](docs/usage.md)
- [시스템 설계](docs/system-design.md)
- [Agent workflow](docs/agent-workflow.md)
- [문서 색인](docs/indexing.md)
- [권한 경계](docs/permission-boundary.md)
- [보안](docs/security.md)
- [평가](docs/evaluation.md)
- [Slack Bot](docs/slack-bot.md)
- [API 계약](docs/api.md)
- [배포](docs/deployment.md)
- [디자인](docs/design.md)
