# 보안

## 로컬 데모와 운영 환경

로컬 데모는 빠른 실행을 위해 헤더 기반 호출자 컨텍스트를 허용합니다. `OPSPILOT_ACTOR_TOKEN_SECRET`을 설정하면 보호 API는 `x-opspilot-actor-token`으로 전달된 HMAC 서명 토큰을 요구합니다.

## 인증 검증

```bash
pnpm authn:smoke
```

이 테스트는 `/health`는 공개 상태로 유지되고, `/ask`는 토큰 없음/변조/만료 토큰을 거부하며, 유효한 `ops_admin` 토큰만 제한 문서를 검색할 수 있는지 검증합니다.

## 민감 작업

에이전트는 다음 작업을 직접 실행하지 않습니다.

- 운영 DB 쓰기
- 강제 환불
- 권한 부여
- 파괴적 캐시/큐 조작
- 정산 결과 변경

이런 요청은 `request_human_approval` 도구 호출과 승인 기록으로 분리됩니다.

## 시크릿 마스킹

Markdown, URL, txt, PDF, Word docx 수집은 저장과 색인 전에 표준 Markdown으로 정규화되고 시크릿 패턴을 마스킹합니다. AWS 키, GitHub 토큰, Slack 토큰, bearer 토큰, `api_key`, `password`, `client_secret`류 키-값 시크릿을 대상으로 합니다.

URL 수집은 기본적으로 `http`/`https`만 허용하고, DNS 해석 결과가 localhost, private network, loopback, link-local, multicast, unspecified 주소이면 차단합니다. Redirect도 자동으로 신뢰하지 않고 각 hop을 다시 검사합니다. 로컬 fixture 테스트처럼 내부 주소가 꼭 필요할 때만 `SOURCE_INGESTION_ALLOW_PRIVATE_URLS=true`로 명시적으로 우회합니다.

```bash
pnpm redaction:smoke
```

## 프롬프트 주입 가드레일

Markdown 안의 “이전 지시를 무시하라”, 시스템 프롬프트 탈취 요청 같은 프롬프트 주입 패턴을 탐지해 `metadata.security.promptInjectionRisk=true`로 표시합니다. 위험 청크는 인벤토리에는 남지만 검색 컨텍스트에서는 제외됩니다.

```bash
pnpm prompt-injection:smoke
```

## 호출 제한

`POST /ask`는 검색과 답변 생성 전에 호출자 단위 Redis 고정 윈도 호출 제한을 적용합니다. 호출자 키는 호출자 ID, 이메일, 역할, 팀 슬러그를 조합한 뒤 해시로 저장합니다.

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

제한 초과 시 HTTP 429와 `rateLimit.limit`, `remaining`, `resetAt`, `retryAfterSeconds`가 반환됩니다.

## `/ask` 멱등성

`POST /ask`는 `x-idempotency-key`를 지원합니다. 키는 호출자 범위 안에서만 재사용되며, OpsPilot은 질문/채널을 안정 해시로 저장합니다.

- 같은 호출자 + 같은 키 + 같은 본문: 기존 답변 재사용
- 같은 호출자 + 같은 키 + 다른 본문: HTTP 409
- 다른 호출자 + 같은 키: 별도 범위로 처리
- 처리 실패: 키를 삭제해 안전하게 재시도 가능

검증:

```bash
pnpm idempotency:smoke
```

이 테스트는 재사용 요청이 같은 `answerId`를 반환하고, 충돌이 409로 막히며, 재사용 요청이 호출 제한을 추가로 소모하지 않는지 확인합니다.

## 검색 보안

Elasticsearch는 재현율 보강 장치일 뿐 권한 기준이 아닙니다. 하이브리드 모드에서도 Elasticsearch가 반환한 청크 ID를 PostgreSQL에서 다시 로드하고 호출자 권한 필터를 통과한 청크만 답변 컨텍스트에 들어갑니다.

`POST /retrieval/permission-diff`는 같은 질문을 여러 호출자 페르소나로 실행해 권한 경계를 비교합니다. 공개/support 페르소나에 제한 후보가 노출되지 않는지, payments 팀 권한이 있을 때 팀 문서가 새로 보이는지, ops_admin에서 제한 문서가 검색 가능한지 한 응답에서 확인합니다. 이 리포트는 권한 우회용 API가 아니라, 실제 검색 필터가 페르소나별로 어떤 결과 차이를 만드는지 검증하는 감사용 API입니다.

## 환각 방지

`POST /ask`는 접근 가능한 출처가 없거나 검색 신뢰도가 `UNSUPPORTED_ANSWER_CONFIDENCE_THRESHOLD`보다 낮으면 답변 생성을 거부합니다. `CONFIDENCE_THRESHOLD`는 답변 차단 기준이 아니라 사람 검토 기준입니다. 모름 처리의 경우 답변에는 `문서에서 확인할 수 없습니다`가 포함되고, `needsHumanReview=true`와 `no_sources` 또는 `low_confidence` 검토 사유가 저장됩니다. LLM provider를 사용하는 경우에도 시스템 프롬프트는 제공된 출처 밖의 사실을 추론하거나 보완하지 말라고 지시합니다.

## 추적 보안

`GET /answers/:id/trace`, `proof`, `replay`, `evidence-bundle`, `lineage`는 저장된 출처에 대해 현재 호출자 권한을 다시 확인합니다. `GET /questions/:id/audit-bundle`도 답변 출처와 검색 도구 출력에서 복원한 출처 경로를 현재 호출자 권한으로 다시 확인합니다. 권한 없는 사용자는 추적, 계보 그래프, 감사 번들을 통해 제한 출처 경로 또는 미리보기를 추론할 수 없어야 합니다.

`evidence-bundle`, `lineage`, `audit-bundle`의 SHA-256 해시는 반환된 감사 페이로드 전체를 대상으로 합니다. 해시는 권한을 우회하는 서명이 아니라, 허용된 호출자에게 보여준 추적/증명/재실행/도구 호출/계보 증거가 나중에 바뀌지 않았는지 확인하기 위한 무결성 표시입니다.
