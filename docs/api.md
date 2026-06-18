# API 계약

Swagger UI 문서:

```txt
GET /docs
```

OpenAPI JSON 문서:

```txt
GET /docs-json
```

## 주요 API

- `POST /ask`: RAG 답변 생성
- `POST /retrieval/preview`: 답변 생성 전 검색 후보, 후보별 랭킹 설명, 권한 감사, 검색 실행 계획, 검색 품질 진단 확인
- `POST /retrieval/profile`: 검색 미리보기 결과에 단계별 latency budget, 병목, 프로파일 해시를 더한 운영 프로파일 확인
- `POST /retrieval/robustness`: 질문 변형별 1순위 출처 안정성, 출처 겹침, 점수 흔들림, 권한 경계 재검사
- `POST /retrieval/permission-diff`: 공개 사용자/support/payments/ops_admin 페르소나별 검색 후보와 권한 차단 결과 비교
- `POST /incidents/plan`: 런북 기반 장애 대응 플랜, 심각도, 승인 경계, 커뮤니케이션, 복구 검증 생성
- `GET /documents`: 문서 목록, 청크 수, 보안 메타데이터 확인
- `GET /documents/index-snapshot`: 전체 지식 베이스의 문서/청크/버전/임베딩/보안 메타데이터 스냅샷 해시 확인
- `GET /documents/index-quality`: 색인 품질 리포트, 게이트, 문서별 청크/버전/헤딩/보안 점검 결과 확인
- `POST /documents/markdown`: Markdown 문서 등록/재색인
- `POST /documents/source`: URL, txt, Markdown, PDF, Word docx를 수집해 표준 Markdown으로 변환하고 기존 RAG 색인에 연결. 응답의 `quality`는 텍스트 추출 길이, 청크 생성, 청크 크기, 헤딩 신호, 검색 힌트, 보안 스캔을 `ready`/`attention`/`blocked`로 판정하고 추천 테스트 질문을 제공합니다. URL 수집은 기본적으로 localhost/private/link-local/multicast 주소와 내부망 redirect를 차단합니다.
- `POST /documents/reset`: 문서, 청크, 버전을 초기화하고 선택적으로 seed 문서를 다시 적재
- `GET /documents/{id}/versions`: 마스킹된 문서 버전과 변경 차이 확인
- `GET /documents/{id}/index-explain`: 특정 문서의 청킹 전략, 임베딩 커버리지, 헤딩 아웃라인, 검색 힌트, 버전 변경 차이 확인
- `GET /documents/{id}/impact`: 해당 문서를 출처로 사용한 과거 답변, 오래된 답변 여부, 위험도, 재검증 권고 확인
- `GET /documents/revalidation-queue`: 변경된 문서를 근거로 사용한 오래된 답변을 위험도/우선순위 큐로 집계
- `GET /documents/revalidation-runs`: 저장된 문서 재검증 실행 이력과 리포트 해시 조회
- `POST /documents/revalidation-runs`: 큐 항목 하나를 replay, 품질 게이트, 계보 그래프로 즉시 재검증하고 운영 판정 반환
- `POST /documents/github/sync`: GitHub Markdown 동기화
- `GET /documents/indexing-jobs`: BullMQ 색인 큐 카운트, 최근 작업, 워커 상태 확인
- `POST /documents/indexing-jobs/markdown`: BullMQ 색인 작업 생성
- `GET /permission-boundary/matrix`: 페르소나별 문서 접근 매트릭스
- `GET /answers/{id}/trace`: 답변 실행 추적 복원
- `GET /answers/{id}/proof`: 답변 증명 패킷
- `GET /answers/{id}/replay`: 현재 문서 기준 답변 변경 감지
- `GET /answers/{id}/evidence-bundle`: 추적, 증명, 재실행, 권한 재검사, SHA-256 무결성 해시를 묶은 감사용 증거 번들
- `GET /answers/{id}/claim-support`: 답변 문장별 출처 스니펫 지지 점수, 미지원 claim, SHA-256 리포트 해시
- `GET /answers/{id}/lineage`: 질문, 답변, 출처, 도구 호출, 승인, 피드백, 신뢰 게이트를 노드/엣지로 묶은 계보 그래프
- `GET /answers/{id}/quality-gate`: 개별 답변을 공유 가능/검토 필요/차단으로 판정하는 신뢰 게이트
- `GET /questions/{id}/audit-bundle`: 질문 기준 출처 계보, 도구 호출 정책 검사, 승인/피드백, 권한 재검사, SHA-256 해시를 묶은 감사 번들
- `GET /tool-calls/registry`: 에이전트 도구 계약 확인
- `GET /tool-calls/recent`: 최근 도구 호출 감사 로그
- `GET /approvals`: 승인 대기열
- `PATCH /approvals/{id}`: 승인/반려 처리
- `POST /feedback`: 답변 피드백 저장
- `GET /evaluations/latest`: 최신 평가 결과
- `GET /evaluations/history`: 평가 이력
- `GET /evaluations/cases`: 최신 평가 실행의 케이스별 실패 원인, 위험도, 개선 권고
- `GET /evaluations/regression`: 최신 평가와 직전 평가의 회귀 비교, 릴리즈 판단, 액션, 리포트 해시
- `GET /evaluations/coverage`: 최신 평가 기준 문서별 기대/실제 출처 커버리지, 미검증 문서, 추가 질문 액션, 리포트 해시
- `GET /observability/summary`: 운영 지표 요약
- `GET /observability/api-requests`: HTTP API 요청 성공률, p95 지연, 엔드포인트별 오류율
- `GET /observability/error-budget`: 5분/1시간/24시간 오류 예산 잔량, 오류 예산 소모율, 주요 실패 엔드포인트, 배포 권고
- `GET /observability/slo`: SLO 가드레일
- `GET /observability/release-gate`: 배포 가능성 게이트
- `GET /observability/portfolio-readiness`: 포트폴리오 데모 준비도, 핵심 증거 pillar, 5분 데모 경로
- `GET /observability/action-plan`: 배포 게이트/SLO 결과를 담당자별 우선순위, 조치, 검증 명령으로 변환
- `GET /observability/audit-ledger`: 질문, 답변, 도구 호출, 승인, 피드백 이벤트의 SHA-256 해시 체인
- `POST /slack/events`: Slack Events API
- `POST /slack/simulate`: Slack 로컬 시뮬레이션

## 계약 검증

```bash
pnpm openapi:smoke
```

이 명령은 포트폴리오 핵심 API, 요청 스키마, `x-opspilot-actor-token` 보안 스키마가 OpenAPI 문서에 남아 있는지 검증합니다. 기능이 커져도 공개 API가 조용히 깨지지 않게 하는 장치입니다.

## 검색 미리보기 랭킹 설명

`POST /retrieval/preview`의 `candidates[].rankingExplanation`은 검색 후보가 상위에 오른 이유를 기계적으로 설명합니다.

- `method`: 벡터/키워드 가중 랭킹 또는 RRF 하이브리드 랭킹
- `matchedQueryTerms`: 제목, 경로, 본문에 실제로 매칭된 검색어
- `scoreContributions`: 벡터 유사도, 키워드 매칭, RRF 결합 점수의 기여도
- `accessDecision`: 권한 필터를 통과한 이유와 적용된 집행 방식
- `reasonCodes`: 포트폴리오 데모와 테스트에서 확인하기 쉬운 결정 코드

이 필드는 답변 생성 전 단계에서 “검색 품질이 왜 충분한지”, “권한 경계가 어디서 적용됐는지”, “문서 내용과 질문이 어떻게 연결됐는지”를 확인하기 위한 감사용 데이터입니다.

## 검색 운영 프로파일

```txt
POST /retrieval/profile
```

`POST /retrieval/preview`와 같은 입력을 받지만, 운영 프로파일 리포트를 추가로 반환합니다. 이 리포트는 검색 결과가 맞는지만 보지 않고, 검색이 운영 latency budget 안에서 실행됐는지, 어떤 단계가 병목인지, 권한 감사와 컨텍스트 예산이 어떤 상태인지 보여줍니다.

- `summary`: 전체 지연, 검색 지연, 진단 지연, 후보 패키징 지연, 후보 창, 차단 후보, 컨텍스트 예산 사용률
- `stages`: 질문 정규화, 검색과 권한 감사, 품질 진단, 후보 패키징, 운영 판단 단계별 duration/budget/status
- `bottlenecks`: 지연, 권한 차단 후보, 품질 경고, 컨텍스트 예산 압박에 대한 조치
- `profileHash`: 검색 결과와 진단 계획을 SHA-256으로 묶은 재현성 해시
- `preview`: 같은 검색 후보/진단 payload

검증:

```bash
pnpm retrieval-profile:smoke
```

## 검색 강건성 리포트

```txt
POST /retrieval/robustness
```

같은 의도를 가진 질문 변형을 자동/수동으로 실행해 검색 결과가 흔들리는지 확인합니다.

- `summary.topSourceStability`: 변형 질문이 기준 질문과 같은 1순위 출처로 수렴한 비율
- `summary.averageSourceOverlap`: 기준 질문 후보 문서와 변형 질문 후보 문서의 평균 Jaccard 겹침
- `summary.averageConfidenceEstimate`: 변형 검색 전체의 평균 신뢰도 추정
- `summary.maxScoreDelta`: 기준 질문 대비 최고 점수의 최대 변동폭
- `checks`: 1순위 출처 안정성, 출처 겹침, 평균 신뢰도, 점수 흔들림, 권한 경계 재검사
- `variants`: 변형 질문별 1순위 출처, 겹침, 권한 차단 수, 검색어

```bash
pnpm retrieval-robustness:smoke
```

이 스모크는 테스트 문서를 색인한 뒤 질문 표현을 바꿔도 같은 근거 문서로 수렴하는지 검증합니다. RAG가 “한 번 맞았다”가 아니라 “표현이 바뀌어도 운영 의도를 안정적으로 찾는다”는 점을 보여주기 위한 포트폴리오 증거입니다.

## 권한별 검색 비교

```txt
POST /retrieval/permission-diff
```

같은 질문을 여러 호출자 페르소나로 실행해 검색 후보가 어떻게 달라지는지 비교합니다.

- `personas[]`: 공개 사용자, support 담당자, payments 온콜, 운영 관리자 같은 비교 대상
- `summary.unprivilegedRestrictedCandidateCount`: 권한 없는 페르소나에 제한 후보가 노출됐는지
- `summary.privilegedRestrictedCandidateCount`: 관리자 페르소나가 제한 후보를 볼 수 있는지
- `personas[].topSourcePath`: 페르소나별 1순위 출처
- `personas[].deniedCandidateCount`: 후보 창에서 권한으로 차단된 수
- `comparisons[]`: 인접 페르소나 사이의 1순위 변경, 차단 수 변화, 새로 보이는 경로
- `checks`: 제한 문서 격리, 팀 범위 격리, 관리자 가시성, 출처 차이, 후보 창 감사

검증:

```bash
pnpm retrieval-permission-diff:smoke
```

## 색인 스냅샷

```txt
GET /documents/index-snapshot
```

응답은 현재 지식 베이스가 어떤 입력 조합으로 만들어졌는지 재현 가능한 매니페스트로 반환합니다. `generatedAt`은 응답 시각이므로 스냅샷 해시 계산에서 제외하고, 문서 경로, 가시성, 팀, 문서 본문 해시, 청크 집합 해시, 최신 버전, 버전 수, 청크 수, 임베딩 커버리지, 보안 메타데이터를 정규화해 `snapshotHash`를 계산합니다.

- `snapshotHash`: 현재 색인 상태를 대표하는 SHA-256 해시
- `pipeline.snapshot`: `document_chunk_manifest_v1`
- `summary`: 전체 문서/청크 수, 버전 문서 수, 공개/팀/제한 문서 분포, 임베딩/헤딩 커버리지, 품질 점수
- `documents[]`: 문서별 `contentHash`, `chunkSetHash`, 최신 버전, 청크 수, 보안 메타데이터
- `integrity`: 해시 알고리즘, 정규화 방식, 해시에 포함된 필드

검증:

```bash
pnpm index-snapshot:smoke
```

이 스모크는 같은 상태에서 스냅샷 해시가 안정적으로 유지되는지, 새 Markdown 문서를 넣으면 스냅샷 해시와 청크 매니페스트가 바뀌는지 확인합니다.

## 색인 품질 리포트

```txt
GET /documents/index-quality
```

응답은 전체 지식 베이스가 RAG 검색에 쓸 수 있는 상태인지 서버에서 판정합니다.

- `summary`: 문서 수, 청크 수, 평균 청크 길이, 공개/팀/제한 문서 분포, 마스킹 수, 프롬프트 주입 위험 수
- `gates`: 문서 존재, 청크 커버리지, 버전 커버리지, 청크 크기, 보안 격리 게이트
- `documents[]`: 문서별 청크 수, 최신 버전, 본문 길이, 헤딩 커버리지, 보안 상태, 권고 사항

검증:

```bash
pnpm index-quality:smoke
```

## 문서 색인 설명

```txt
GET /documents/{id}/index-explain
```

응답은 특정 문서가 RAG 검색에 어떤 형태로 들어갔는지 설명합니다.

- `pipeline`: frontmatter 파서, 마스킹, 청킹 전략, 임베딩, pgvector 저장소, Elasticsearch 미러 여부
- `summary`: 청크 수, 총 본문 길이, 평균/최대/최소 청크 길이, 헤딩 커버리지, 임베딩 커버리지, 검색 준비 상태
- `checks`: 청크 생성, 임베딩 커버리지, 헤딩 신호, 청크 크기, 버전 추적, 보안 메타데이터 판정
- `headingOutline`: 헤딩별 청크 인덱스
- `chunks[]`: 청크별 길이, 토큰 추정치, 64차원 임베딩 저장 여부, 검색 힌트, 미리보기
- `latestDiff`: 최신 버전 변경 차이
- `recommendations`: 재색인, 헤딩 보강, 청크 분리 같은 개선 권고

검증:

```bash
pnpm index-explain:smoke
```

## 문서 변경 영향 분석

```txt
GET /documents/{id}/impact
```

응답은 특정 문서가 과거 RAG 답변에 어떤 영향을 줬는지 서버에서 계산합니다.

- `summary.affectedAnswerCount`: 이 문서를 출처로 사용한 저장 답변 수
- `summary.topSourceAnswerCount`: 이 문서가 1순위 근거였던 답변 수
- `summary.staleAnswerCount`: 문서 변경 시각보다 오래된 답변 수
- `summary.humanReviewAnswerCount`: 사람 검토가 필요했던 답변 수
- `summary.riskLevel`: 낮은 영향, 검토 필요, 우선 재검증
- `affectedAnswers[]`: 질문, 답변 미리보기, 출처 순위/점수, 오래된 답변 여부
- `recommendations[]`: 재실행 검증, 승인 이력 확인, 권한 경계 검증 같은 운영 조치

검증:

```bash
pnpm document-impact:smoke
```

## 문서 재검증 큐

```txt
GET /documents/revalidation-queue
```

응답은 특정 문서 하나가 아니라 전체 지식 베이스에서 “문서 변경 이후 오래된 답변”을 큐로 모읍니다.

- `status`: 큐가 비어 있는지, 정상 대기인지, 재검증 필요인지, 즉시 대응인지 표시
- `summary`: 큐 항목 수, 영향 문서/답변 수, 고위험/P0 항목, 1순위 근거, 사람 검토, 제한 문서 항목 수
- `items[]`: 우선순위 `P0`~`P3`, 위험도, 변경 문서, 과거 답변, 출처 순위/점수, stale 시간
- `items[].actions`: replay, lineage, quality gate, 승인 이력 확인 같은 운영 조치
- `items[].evidenceLinks`: `/documents/{id}/impact`, `/answers/{id}/replay`, `/answers/{id}/lineage`, `/answers/{id}/quality-gate`

검증:

```bash
pnpm revalidation-queue:smoke
```

## 문서 재검증 실행

```txt
GET /documents/revalidation-runs?limit=20
```

최근 재검증 실행 이력을 반환합니다. 각 이력에는 문서, 답변, 실행 상태, 권고 액션, 체크 결과, replay/품질 게이트/계보 아티팩트 해시, 리포트 해시가 포함됩니다.

```txt
POST /documents/revalidation-runs
```

요청:

```json
{
  "documentId": "문서 UUID",
  "answerId": "답변 UUID"
}
```

응답은 재검증 큐 항목 하나를 현재 호출자 권한으로 다시 검사한 운영 리포트입니다. 실행 결과는 `document_revalidation_runs` 테이블에 저장되고, `GET /documents/revalidation-runs`와 감사 원장에서 다시 확인할 수 있습니다.

- `status`: `cleared`, `needs_review`, `blocked`
- `decision`: 큐 항목 종료, 담당자 재검토, 답변 차단/재작성 권고
- `summary`: replay 상태, 품질 게이트 상태, 계보 상태, 현재 문서 일치율, 출처 겹침, 권한 차단 후보, 계보 해시
- `checks`: 오래된 답변 여부, replay 안정성, 품질 게이트, 계보 무결성, 출처 권한 재검사
- `artifacts`: 실제 `replay`, `qualityGate`, `lineage` 결과
- `artifactHashes` / `persistence.reportHash`: 재검증 근거와 저장 리포트 무결성 확인용 해시

검증:

```bash
pnpm revalidation-run:smoke
```

## 장애 대응 플랜

```txt
POST /incidents/plan
```

요청은 장애 상황 문장과 선택 limit을 받습니다. 응답은 검색된 운영 문서와 런북을 근거로 아래 구조를 반환합니다.

- `severity`: SEV1/SEV2/SEV3 심각도
- `phases`: 상황 파악, 완화 조치, 커뮤니케이션, 복구 검증 단계
- `approvalGates`: 자동 실행하지 않을 민감 작업과 사람 승인 사유
- `communications`: 알림 채널, 트리거, 메시지 초안
- `verification`: 복구 확인 조건과 근거 문서
- `audit`: 저장된 질문 ID와 `search_documents`, `create_runbook_checklist`, `create_incident_response_plan` 도구 호출

검증:

```bash
pnpm incident-plan:smoke
pnpm question-audit:smoke
```

장애 대응 플랜은 일반 답변 행을 만들지 않지만, `audit.persistedQuestionId`로 `GET /questions/{id}/audit-bundle`을 호출하면 같은 실행을 질문 단위로 검증할 수 있습니다. 응답은 `opspilot.question_audit_bundle.v1` 스키마를 사용하며, 도구 레지스트리 기준 기대 상태와 실제 도구 호출 상태가 일치하는지, 호출자 권한으로 출처 접근을 다시 확인했는지, 어떤 문서 경로가 근거로 쓰였는지, 번들 무결성 해시가 무엇인지 반환합니다.

## `/ask` 멱등성

`POST /ask`는 선택 헤더 `x-idempotency-key`를 지원합니다. 같은 호출자 범위에서 같은 키와 같은 본문이 다시 들어오면 새로운 질문, 답변, 승인 요청을 만들지 않고 기존 응답을 재사용합니다.

```bash
curl -X POST http://localhost:3000/ask \
  -H "content-type: application/json" \
  -H "x-user-id: demo-operator" \
  -H "x-team-slugs: payments" \
  -H "x-user-roles: ops_admin" \
  -H "x-idempotency-key: demo-ask-001" \
  -d '{"question":"E102 에러가 발생하면 어떻게 대응해야 해?","channel":"demo"}'
```

응답의 `idempotency.replayed`가 `false`면 최초 처리, `true`면 재사용입니다. 같은 키로 다른 질문이나 채널을 보내면 HTTP 409를 반환합니다. 재사용 요청은 `/ask` 호출 제한을 추가로 소모하지 않습니다.

검증:

```bash
pnpm idempotency:smoke
```

## 평가 회귀 리포트

```txt
GET /evaluations/regression
```

응답은 최신 평가 실행과 직전 평가 실행을 비교해 지식 베이스를 릴리즈해도 되는지 판단합니다.

- `status`: `promote`, `watch`, `block`
- `releaseDecision`: 배포 가능, 관찰 후 배포, 배포 차단과 필요한 후속 조치
- `metricDeltas`: 출처 적중, 1순위 출처, 사람 검토, 문서 일치율, 인용률의 직전 실행 대비 변화
- `failedGates`: 현재 평가에서 기준값을 넘지 못한 게이트
- `highRiskCases`: 실패 또는 고위험 케이스의 기대/실제 출처, 실패 체크, 권고
- `actionItems`: 담당 영역, 우선순위, 근거, 재검증 명령
- `integrity.reportHash`: 릴리즈 증거로 남길 SHA-256 리포트 해시

검증:

```bash
pnpm eval:regression-smoke
```

## 답변 증거 번들

```txt
GET /answers/{id}/evidence-bundle
```

응답은 `opspilot.answer_evidence_bundle.v1` 스키마를 사용합니다. 번들에는 원본 추적, 증명 체크리스트, 현재 문서 기준 재실행 결과, 호출자 역할/팀 경계, 출처 접근 재검사 여부, 문서 일치율, 근거 커버리지, 출처별 근거 스니펫, 도구/승인/피드백 건수가 들어갑니다.

`integrity.hash`는 반환된 번들 내용을 안정 JSON으로 정규화한 뒤 SHA-256으로 계산합니다. 이 값은 “이 화면에서 보여준 감사 증거가 나중에 조용히 바뀌지 않았는지” 확인하기 위한 포트폴리오용 증거입니다.

검증:

```bash
pnpm evidence-bundle:smoke
```

## 답변 계보 그래프

```txt
GET /answers/{id}/lineage
```

응답은 하나의 답변이 어떤 운영 증거로 만들어졌는지 그래프로 복원합니다.

- `nodes`: 질문, 답변, 출처, 도구 호출, 승인, 피드백, 신뢰 게이트
- `edges`: 생성, 근거 연결, 도구 호출, 승인 필요, 피드백 반영, 권한 재검사
- `summary.documentAgreementScore`: 답변과 근거 문서의 일치율
- `summary.sourceAccessRechecked`: 현재 호출자 권한으로 출처 접근을 다시 확인했는지 여부
- `integrity.hash`: 반환된 계보 payload의 SHA-256 해시

검증:

```bash
pnpm lineage:smoke
```

스모크는 민감 작업 질문에서 제한 출처, `request_human_approval` 도구 호출, 승인 대기, 피드백, 신뢰 게이트, SHA-256 해시가 계보 그래프에 모두 남는지 확인합니다.

## 답변 신뢰 게이트

```txt
GET /answers/{id}/quality-gate
```

응답은 개별 답변을 운영 채널에 그대로 공유해도 되는지 서버에서 판정합니다. 시스템 전체 품질을 보는 `GET /observability/release-gate`와 달리, 이 엔드포인트는 특정 `answerId` 하나의 증거를 기준으로 판단합니다.

- `status`: `pass`, `review`, `block`
- `decision.recommendedAction`: `share`, `review_before_share`, `block_and_rework`
- `summary.proofStatus`: 증명 패킷 상태
- `summary.replayStatus`: 현재 문서 기준 재실행 안정성
- `summary.approvalStatus`: 민감 작업 승인 필요 여부와 처리 상태
- `summary.positiveFeedbackCount`, `negativeFeedbackCount`: 리뷰 피드백 신호
- `checks[]`: 증명 패킷, 재실행, 승인, 피드백, 신뢰도, 문서 일치율, 근거 커버리지, 출처 겹침, 권한 경계 체크
- `evidenceLinks`: 추적/증명/재실행/증거 번들 API 경로

검증:

```bash
pnpm quality-gate:smoke
```

스모크는 긍정 피드백 전 답변이 `review`에 머무는지, 피드백 후 `pass`가 되는지, 민감 작업 답변이 승인 대기 때문에 `review_before_share`로 남는지 확인합니다.

## 질문 감사 번들

```txt
GET /questions/{id}/audit-bundle
```

응답은 답변이 생성된 `/ask` 질문뿐 아니라 `POST /incidents/plan`처럼 구조화된 작업 흐름만 만든 질문도 감사할 수 있게 설계했습니다.

- `summary.status`: 검증됨, 검토 필요, 정책 위반, 근거 부족
- `policyChecks`: `search_documents`, `create_runbook_checklist`, `create_incident_response_plan`, `request_human_approval`의 기대 상태와 실제 상태 비교
- `evidence.sources`: 답변 출처 또는 검색 도구 출력에서 복원한 출처 계보
- `decisionPath`: 질문 저장, 도구 호출, 답변/출처/승인/피드백, 정책 검사 타임라인
- `actorBoundary`: 현재 호출자의 역할/팀과 출처 접근 재검사 여부
- `integrity.hash`: 안정 JSON 기반 SHA-256 해시

검증:

```bash
pnpm question-audit:smoke
```
