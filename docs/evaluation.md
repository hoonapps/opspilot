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

## 케이스 상세 리포트

```txt
GET /evaluations/cases
```

최신 평가 실행의 각 케이스를 `source_hit`, `top_source`, `human_review`, `document_agreement`, `citation` 체크로 분해합니다. 응답에는 케이스별 위험도, 실패/주의 상태, 기대 출처와 실제 출처, 문서 일치율, 인용 여부, 개선 권고가 포함됩니다.

웹 콘솔 `품질` 화면의 `케이스 상세 리포트`에서 평균 점수 뒤에 숨어 있는 실패 원인을 확인할 수 있습니다. 포트폴리오 데모에서는 특정 케이스가 실패했을 때 “문서를 보강해야 하는지, 랭킹을 조정해야 하는지, 답변 템플릿을 바꿔야 하는지”를 설명하는 근거로 사용합니다.
