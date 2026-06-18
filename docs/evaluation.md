# 평가

OpsPilot의 평가는 “답변이 자연스러운가”보다 운영에서 중요한 증거를 기준으로 합니다.

## 지표

- `sourceHitRate`: 기대 출처가 검색 결과에 포함됐는지
- `topSourceAccuracy`: 기대 출처가 1순위인지
- `humanReviewAccuracy`: 민감 작업이 사람 검토로 분리됐는지
- `documentAgreementScore`: `@opspilot/rag`의 `token_overlap_v1`로 계산하는 답변과 출처 청크의 토큰 겹침 기반 일치율
- `citationAccuracy`: 답변 출처 인용이 기대 조건을 만족하는지

## 실행

```bash
pnpm eval
pnpm --filter @opspilot/rag test
```

기본 기준값:

```txt
EVAL_MIN_SOURCE_HIT_RATE=1
EVAL_MIN_TOP_SOURCE_ACCURACY=1
EVAL_MIN_HUMAN_REVIEW_ACCURACY=1
EVAL_MIN_DOCUMENT_AGREEMENT_SCORE=0.8
EVAL_MIN_CITATION_ACCURACY=1
```

기준값이 깨지면 명령은 실패합니다.

## 회귀와 최신성

```bash
pnpm eval:history-smoke
pnpm eval:cases-smoke
pnpm eval:regression-smoke
pnpm eval:coverage-smoke
pnpm retrieval-eval:smoke
pnpm rerank-challenge:smoke
pnpm openai-embedding-path:smoke
pnpm embedding-eval:smoke
pnpm embedding-hard:smoke
pnpm freshness:smoke
```

문서가 바뀐 뒤 최신 평가가 오래된 상태가 되는지 확인합니다. 배포 게이트는 최신 평가가 없거나 문서 변경 이후 재평가가 없으면 검토/차단 상태로 내려갈 수 있습니다.

## 회귀 릴리즈 리포트

```txt
GET /evaluations/regression
```

최신 평가와 직전 평가를 비교해 `promote`, `watch`, `block` 중 하나로 릴리즈 판단을 반환합니다.

- 게이트 실패가 있거나 고위험 케이스가 남으면 `block`
- 게이트는 통과했지만 직전 실행 대비 하락한 메트릭이 있으면 `watch`
- 게이트 통과와 회귀 없음이 함께 만족되면 `promote`

응답에는 메트릭별 delta, 실패 게이트, 고위험 케이스, 담당 영역별 액션 아이템, SHA-256 `reportHash`가 포함됩니다. 웹 콘솔 `품질` 화면의 `회귀 릴리즈 리포트`에서 같은 내용을 확인할 수 있습니다.

## 평가 문서 커버리지

```txt
GET /evaluations/coverage
```

최신 평가가 현재 문서 집합을 얼마나 덮는지 계산합니다. 각 문서는 기대 출처, 실제 검색 출처, 둘 다, 미검증 중 하나로 분류됩니다.

- 제한 문서와 팀 문서 커버리지를 별도 비율로 계산합니다.
- 평가에 포함되지 않은 문서는 blind spot으로 표시하고 suggested question을 생성합니다.
- 응답에는 action item과 SHA-256 `reportHash`가 포함됩니다.

`pnpm eval:coverage-smoke`는 평가에 포함되지 않은 임시 문서를 추가해 blind spot 탐지와 리포트 해시가 생성되는지 검증합니다.

## 검색 품질 리포트

```txt
GET /evaluations/retrieval
```

기존 평가의 `documentAgreementScore`는 답변과 출처의 토큰 겹침을 보는 지표입니다. 반면 검색 품질 리포트는 답변 생성 전에 검색기 자체가 기대 문서를 몇 등 안에 올리는지 측정합니다.

- `recallAt1`, `recallAt3`, `recallAt5`: 기대 출처가 top-k 문서 후보에 포함됐는지
- `mrr`: 첫 기대 출처 순위의 reciprocal rank 평균
- `ndcgAt5`: top-5 랭킹 품질
- `averageFirstRelevantRank`: 기대 출처가 처음 등장한 평균 순위
- `baselineMetrics`: pgvector/lexical fusion만 적용한 기준선 검색 품질
- `reranking`: `local_bm25_keytoken_v1` 리랭커 적용 후 top source 변경 수와 metric delta
- `rows[].baseRankedSources`: 리랭킹 전 후보 문서 랭킹
- `rows[].rankedSources`: 검색 후보 문서를 중복 제거한 실제 랭킹
- `rows[].rankDelta`: 기대 출처가 리랭킹 후 몇 등 개선 또는 하락했는지
- `rows[].permissionEnforcement`: 권한 경계가 검색 전 SQL 필터인지, Elasticsearch 후 PostgreSQL 재검사인지

`pnpm retrieval-eval:smoke`는 seed 평가셋을 색인한 뒤 이 리포트가 `recall@3=1`, `MRR>=0.8`, `nDCG@5>=0.8`을 만족하는지 검증합니다. 이 리포트는 같은 질문셋에 대해 리랭킹 전 기준선과 리랭킹 후 결과를 함께 반환하므로, 검색 튜닝이 top-k 품질을 실제로 개선했는지 숫자로 비교할 수 있습니다. `pnpm rerank-challenge:smoke`는 기본 검색이 과거 archive 문서를 1위로 잘못 올리는 fixture를 색인하고, 리랭커 적용 후 최신 runbook이 1위가 되며 `recall@1`, `MRR` delta가 양수인지 강제합니다. OpenAI 임베딩을 사용할 때는 같은 명령을 `EMBEDDING_PROVIDER=openai OPENAI_API_KEY=...` 환경으로 재실행해 local hash embedding 대비 성능 차이를 남깁니다.

## 임베딩 비교 리포트

```txt
GET /evaluations/embedding-comparison
```

이 리포트는 검색기 전체가 아니라 “임베딩 모델만 바꿨을 때” 질문과 청크의 의미 검색 순위가 어떻게 달라지는지 비교합니다.

- `baseline`: 기본 로컬 `local_hash_embedding_64d`로 계산한 `recall@1/3/5`, `MRR`, `nDCG@5`
- `candidate`: `OPENAI_API_KEY`가 있을 때 OpenAI embedding으로 다시 계산한 같은 지표
- `delta`: candidate가 baseline 대비 얼마나 좋아지거나 나빠졌는지
- `rows[].localRankedSources`: 로컬 임베딩 기준 질문별 문서 순위
- `rows[].candidateRankedSources`: OpenAI 임베딩 기준 질문별 문서 순위
- `integrity.reportHash`: 평가셋, 문서 청크, 모델 이름, 지표를 묶은 SHA-256 해시
- `actionItems`: API key가 없거나 candidate가 baseline보다 낮을 때 재검증 명령과 조치

로컬/CI에서는 외부 API key 없이도 `pnpm embedding-eval:smoke`가 실행됩니다. 이때 리포트 상태는 `skipped`이고 candidate는 `unavailable`로 남습니다. 실제 포트폴리오 데모에서는 아래처럼 실행해 OpenAI embedding과 로컬 기준선의 차이를 같은 리포트에 남깁니다.

```bash
EMBEDDING_PROVIDER=openai OPENAI_API_KEY=... pnpm embedding-eval:smoke
```

`pnpm embedding-hard:smoke`는 `seed/embedding-hard/documents`의 어려운 패러프레이즈 문서 세트를 임시로 색인합니다. 이 세트는 단어가 그대로 겹치지 않는 질문을 넣어 로컬 해시 임베딩의 한계를 드러내기 위한 테스트입니다. API key가 없을 때도 로컬 기준선 순위와 지표를 남기고, API key가 있으면 같은 문서와 질문으로 OpenAI embedding 후보 지표까지 계산합니다.

`pnpm openai-embedding-path:smoke`는 mock OpenAI embedding 응답을 사용합니다. 외부 네트워크 없이 `EMBEDDING_PROVIDER=openai`가 문서 청크 색인, pgvector 저장, 질문 검색까지 실제 provider 경로를 타는지 검증합니다. OpenAI embedding을 명시했는데 `OPENAI_API_KEY`가 없거나 API 호출이 실패하면 local fallback으로 숨기지 않고 실패합니다. fallback이 필요한 개발 환경에서만 `OPENAI_EMBEDDING_FALLBACK_TO_LOCAL=true`를 명시합니다.

## 케이스 상세 리포트

```txt
GET /evaluations/cases
```

최신 평가 실행의 각 케이스를 `source_hit`, `top_source`, `human_review`, `document_agreement`, `citation` 체크로 분해합니다. 응답에는 케이스별 위험도, 실패/주의 상태, 기대 출처와 실제 출처, 문서 일치율, 인용 여부, 개선 권고가 포함됩니다.

웹 콘솔 `품질` 화면의 `케이스 상세 리포트`에서 평균 점수 뒤에 숨어 있는 실패 원인을 확인할 수 있습니다. 포트폴리오 데모에서는 특정 케이스가 실패했을 때 “문서를 보강해야 하는지, 랭킹을 조정해야 하는지, 답변 템플릿을 바꿔야 하는지”를 설명하는 근거로 사용합니다.
