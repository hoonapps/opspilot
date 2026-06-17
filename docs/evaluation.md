# 평가

OpsPilot의 평가는 “답변이 자연스러운가”보다 운영에서 중요한 증거를 기준으로 합니다.

## 지표

- `sourceHitRate`: 기대 source가 검색 결과에 포함됐는지
- `topSourceAccuracy`: 기대 source가 1순위인지
- `humanReviewAccuracy`: 민감 작업이 사람 검토로 분리됐는지
- `documentAgreementScore`: `@opspilot/rag`의 `token_overlap_v1`로 계산하는 답변과 출처 chunk의 token overlap 기반 일치율
- `citationAccuracy`: 답변 source citation이 기대 조건을 만족하는지

## 실행

```bash
pnpm eval
pnpm --filter @opspilot/rag test
```

기본 threshold:

```txt
EVAL_MIN_SOURCE_HIT_RATE=1
EVAL_MIN_TOP_SOURCE_ACCURACY=1
EVAL_MIN_HUMAN_REVIEW_ACCURACY=1
EVAL_MIN_DOCUMENT_AGREEMENT_SCORE=0.8
EVAL_MIN_CITATION_ACCURACY=1
```

threshold가 깨지면 명령은 실패합니다.

## 회귀와 freshness

```bash
pnpm eval:history-smoke
pnpm eval:cases-smoke
pnpm freshness:smoke
```

문서가 바뀐 뒤 최신 평가가 stale 상태가 되는지 확인합니다. 배포 게이트는 최신 평가가 없거나 문서 변경 이후 재평가가 없으면 review/block 상태로 내려갈 수 있습니다.

## 케이스 상세 리포트

```txt
GET /evaluations/cases
```

최신 평가 run의 각 케이스를 `source_hit`, `top_source`, `human_review`, `document_agreement`, `citation` 체크로 분해합니다. 응답에는 케이스별 위험도, 실패/주의 상태, 기대 출처와 실제 출처, 문서 일치율, 인용 여부, 개선 권고가 포함됩니다.

웹 콘솔 `품질` 화면의 `케이스 상세 리포트`에서 평균 점수 뒤에 숨어 있는 실패 원인을 확인할 수 있습니다. 포트폴리오 데모에서는 특정 케이스가 실패했을 때 “문서를 보강해야 하는지, 랭킹을 조정해야 하는지, 답변 템플릿을 바꿔야 하는지”를 설명하는 근거로 사용합니다.
