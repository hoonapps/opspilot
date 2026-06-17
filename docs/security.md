# 보안

## 로컬 데모와 운영 환경

로컬 데모는 빠른 실행을 위해 header 기반 actor context를 허용합니다. `OPSPILOT_ACTOR_TOKEN_SECRET`을 설정하면 보호 API는 `x-opspilot-actor-token`으로 전달된 HMAC 서명 token을 요구합니다.

## 인증 검증

```bash
pnpm authn:smoke
```

이 테스트는 `/health`는 공개 상태로 유지되고, `/ask`는 token 없음/변조/만료 token을 거부하며, 유효한 `ops_admin` token만 restricted 문서를 검색할 수 있는지 검증합니다.

## 민감 작업

Agent는 다음 작업을 직접 실행하지 않습니다.

- production DB write
- 강제 환불
- 권한 부여
- 파괴적 cache/queue 조작
- 정산 결과 변경

이런 요청은 `request_human_approval` 도구 호출과 approval record로 분리됩니다.

## Secret Redaction

Markdown ingestion은 저장과 색인 전에 secret pattern을 마스킹합니다. AWS key, GitHub token, Slack token, bearer token, `api_key`, `password`, `client_secret`류 key-value secret을 대상으로 합니다.

```bash
pnpm redaction:smoke
```

## Prompt Injection Guardrail

Markdown 안의 “이전 지시를 무시하라”, system prompt 탈취 요청 같은 prompt-injection pattern을 탐지해 `metadata.security.promptInjectionRisk=true`로 표시합니다. 위험 chunk는 inventory에는 남지만 검색 context에서는 제외됩니다.

```bash
pnpm prompt-injection:smoke
```

## Rate Limit

`POST /ask`는 retrieval과 답변 생성 전에 actor 단위 Redis fixed-window rate limit을 적용합니다. actor key는 actor id, email, roles, teamSlugs를 조합한 뒤 hash로 저장합니다.

환경 변수:

```txt
ASK_RATE_LIMIT_MAX=300
ASK_RATE_LIMIT_WINDOW_SECONDS=60
ASK_RATE_LIMIT_DISABLED=false
```

검증:

```bash
pnpm rate-limit:smoke
```

limit 초과 시 HTTP 429와 `rateLimit.limit`, `remaining`, `resetAt`, `retryAfterSeconds`가 반환됩니다.

## 검색 보안

Elasticsearch는 recall booster일 뿐 권한 기준이 아닙니다. hybrid 모드에서도 Elasticsearch가 반환한 chunk id를 PostgreSQL에서 다시 로드하고 actor 권한 필터를 통과한 chunk만 답변 context에 들어갑니다.

## Trace 보안

`GET /answers/:id/trace`, `proof`, `replay`, `evidence-bundle`은 저장된 source에 대해 현재 caller 권한을 다시 확인합니다. 권한 없는 사용자는 trace나 증거 bundle을 통해 restricted 출처 path나 preview를 추론할 수 없어야 합니다.

`evidence-bundle`의 SHA-256 해시는 반환된 감사 payload 전체를 대상으로 합니다. 해시는 권한을 우회하는 서명이 아니라, 허용된 caller에게 보여준 trace/proof/replay 증거가 나중에 바뀌지 않았는지 확인하기 위한 무결성 표시입니다.
