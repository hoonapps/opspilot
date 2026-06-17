# 배포

OpsPilot은 로컬 Node 환경 없이도 포트폴리오 데모를 실행할 수 있도록 프로덕션 스타일 Docker 구성을 포함합니다.

## 로컬 개발 실행

```bash
docker compose up -d postgres redis
pnpm --filter @opspilot/api db:migrate
pnpm ingest
pnpm dev:api
pnpm dev:web
```

## 프로덕션 스타일 데모

```bash
pnpm docker:prod
```

이 명령은 API, 웹, 워커, PostgreSQL, Redis 컨테이너를 함께 실행합니다.

검증:

```bash
pnpm docker:prod:smoke
```

스모크 스크립트는 프로덕션 대상을 빌드하고, compose 스택을 올리고, `/health/ready`, 웹 콘솔, 실제 `/ask` 요청을 확인한 뒤 컨테이너와 볼륨을 정리합니다.

## 선택형 Elasticsearch

```bash
docker compose --profile search up -d
ENABLE_ELASTICSEARCH=true RETRIEVAL_MODE=hybrid pnpm ingest
ENABLE_ELASTICSEARCH=true RETRIEVAL_MODE=hybrid pnpm dev:api
```

Elasticsearch는 검색 재현율을 높이기 위한 선택형 구성입니다. 권한 판단은 항상 PostgreSQL 재검사를 통과해야 합니다.
