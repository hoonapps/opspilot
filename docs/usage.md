# OpsPilot 사용법

이 문서는 로컬에서 OpsPilot을 실행하고, 문서를 넣고, RAG 색인과 답변 품질을 검증하는 순서를 정리합니다.

## 1. 로컬 인프라 실행

```bash
pnpm install
cp .env.example apps/api/.env
docker compose up -d postgres redis
pnpm --filter @opspilot/api db:migrate
```

기본 포트는 로컬 충돌을 피하도록 아래처럼 잡혀 있습니다.

- API: `http://localhost:3000`
- 웹 콘솔: `http://localhost:3001`
- PostgreSQL: `localhost:25432`
- Redis: `localhost:26379`
- Elasticsearch: `localhost:29200` 선택형

## 2. 기본 문서 색인

```bash
pnpm ingest
```

이 명령은 `seed/documents` 아래 Markdown 문서를 읽어서 RAG 색인에 넣습니다.

현재 기본 문서는 결제 운영 서비스를 가정합니다.

- 결제 에러 코드
- 환불 정책
- 정산 배치 런북
- Redis 장애 런북
- 운영 DB 접근 정책

## 3. API와 웹 콘솔 실행

터미널 1:

```bash
pnpm dev:api
```

터미널 2:

```bash
pnpm dev:web
```

브라우저에서 엽니다.

```txt
http://localhost:3001
```

콘솔 안에서는 왼쪽 `사용법` 화면을 열면 데모 순서를 그대로 볼 수 있습니다. 독립 페이지로 보고 싶으면 아래 주소를 사용합니다.

```txt
http://localhost:3001/usage
```

## 4. 문서 관리 위치

문서는 세 위치에서 관리합니다.

| 위치 | 용도 |
| --- | --- |
| `seed/documents` | 로컬 재현용 기본 운영 문서 |
| 웹 콘솔 `문서` 화면 | 데모 중 Markdown 문서 추가/수정 |
| 웹 콘솔 `GitHub 문서 동기화` | GitHub 저장소의 Markdown 문서 동기화 |

웹에서 문서를 등록하면 OpsPilot은 같은 경로의 기존 문서를 새 버전으로 저장하고, 청크를 다시 만들고, 임베딩을 갱신합니다.

## 5. 새 문서 넣고 RAG 검증

웹 콘솔에서 `문서` 화면을 엽니다.

1. Markdown 경로를 입력합니다. 예: `public/status-page-policy.md`
2. Markdown 본문을 입력합니다.
3. `등록하고 RAG 검증` 버튼을 누릅니다.

버튼을 누르면 아래 검증이 한 번에 실행됩니다.

- Markdown 저장
- 민감 정보 마스킹
- 프롬프트 주입 검사
- 청킹
- 임베딩 저장
- 문서 목록 새로고침
- 검색 미리보기 실행
- `/ask` 실행
- 신규 문서가 1순위 출처인지 확인
- 답변의 문서 일치율 계산

같은 문서를 다시 수정해 등록한 뒤 문서 상세의 `영향 분석`을 누르면 이 문서를 근거로 사용한 과거 답변, 문서 변경 이후 stale 답변, 1순위 근거 여부, replay 재검증 권고를 확인할 수 있습니다.

화면의 `색인 검증` 영역에서 다음 값을 확인합니다.

- 색인 경로
- 청크 수
- 1순위 출처 경로
- 출처 적중 여부
- 문서 일치율
- 신뢰도

같은 화면의 `색인 품질 리포트`에서는 지식 베이스 전체 상태를 확인합니다.

- 게이트 통과율
- 평균 청크 길이
- 문서당 청크 수
- 문서 존재/청크 커버리지/버전 커버리지/청크 크기/보안 격리 게이트
- 문서별 헤딩 커버리지와 개선 권고

CLI로 같은 검증을 하려면:

```bash
pnpm index-quality:smoke
```

## 6. 청킹과 검색 결과 확인

청킹 결과는 웹 콘솔 `문서` 화면에서 확인합니다.

- `색인 인벤토리`: 문서별 청크 수와 보안 메타데이터
- `색인 품질 리포트`: 전체 문서/청크 커버리지와 문서별 개선 권고
- `청크 미리보기`: 실제 검색에 들어가는 청크 미리보기
- `문서 버전`: 마스킹 이후 저장된 버전과 변경 차이

검색 랭킹은 `검색` 화면에서 확인합니다.

1. 질문을 입력합니다.
2. 팀/역할을 입력합니다.
3. `검색 미리보기`를 누릅니다.

이 화면은 답변을 생성하지 않고 검색만 실행합니다. 따라서 어떤 청크가 프롬프트 후보가 되는지, 어떤 후보가 권한 때문에 차단되는지 안전하게 볼 수 있습니다.

각 후보 카드의 `랭킹 설명`에서는 다음을 확인합니다.

- 질문에서 실제로 매칭된 검색어
- 벡터 유사도와 키워드 매칭의 점수 기여도
- 하이브리드 모드에서는 RRF 결합 점수
- 해당 후보가 권한 정책을 통과한 이유

`검색 품질 진단` 영역에서는 다음을 함께 확인합니다.

- 검색 실행 계획
- 질문 정규화, 후보 생성, 권한 경계, 점수 결합, 컨텍스트 패키징, 리뷰 판단 단계
- 신뢰도 추정
- 최고 점수와 점수 격차
- 출처 다양성
- 컨텍스트 예산 포함/제외
- 리뷰 없이 답변 가능한지 또는 담당자 검토가 필요한지

## 7. 장애 대응 플랜 확인

웹 콘솔에서 `대응` 화면을 엽니다.

예시 상황:

```txt
정산 배치가 30분 이상 지연되고 settlement.dlq.count가 120이면 어떻게 대응해야 해?
```

`장애 대응 플랜 생성`을 누르면 다음을 확인할 수 있습니다.

- SEV 심각도
- 매칭된 팀 런북과 근거 문서
- 상황 파악, 완화 조치, 커뮤니케이션, 복구 검증 단계
- 사람 승인 필요 작업
- `#payments-oncall` 같은 알림 채널
- 복구 검증 조건
- `search_documents`, `create_runbook_checklist`, `create_incident_response_plan` 도구 호출 감사
- 질문 단위 감사 번들의 정책 검사, 출처 계보, 권한 재검사, SHA-256 해시

CLI 검증:

```bash
pnpm incident-plan:smoke
pnpm question-audit:smoke
```

## 8. 권한 경계 확인

권한은 문서 단위로 적용됩니다.

- `public`: 모든 사용자 접근 가능
- `team`: 사용자의 `teamSlugs`에 문서 `teamSlug`가 있어야 접근 가능
- `restricted`: `ops_admin` 또는 `security_admin` 필요

검증 방법:

```bash
pnpm permission:smoke
```

웹 콘솔에서는 `문서` 화면의 `매트릭스 불러오기`를 누르면 페르소나별 허용/차단 결과가 보입니다.

중요한 점은 권한 필터가 답변 생성 후가 아니라 검색/프롬프트 구성 전에 적용된다는 것입니다. 접근 불가능한 청크는 LLM 컨텍스트에 들어가지 않습니다.

## 9. 도구 호출 확인

OpsPilot의 에이전트 도구는 `감사` 화면에서 확인합니다.

현재 핵심 도구:

- `search_documents`: 접근 가능한 문서 청크 검색
- `create_runbook_checklist`: 런북 체크리스트 추출
- `create_incident_response_plan`: 런북 기반 장애 대응 플랜 생성
- `request_human_approval`: 민감 작업 승인 요청 생성
- `save_feedback`: 답변 피드백 저장

검증 명령:

```bash
pnpm checklist:smoke
pnpm incident-plan:smoke
pnpm review:smoke
pnpm trace:smoke
```

민감 작업 예시:

```txt
운영 DB에서 고객 정보를 바로 수정해도 돼?
```

이 질문은 자동 실행되지 않고 사람 승인으로 분리되어야 합니다.

## 10. 문서 일치율과 답변 품질 확인

답변 화면은 다음 증거를 보여줍니다.

- 신뢰도
- 문서 일치율
- 출처 목록
- 출처 근거 커버리지
- 출처별 근거 스니펫
- 컨텍스트 예산
- 답변 증명 패킷
- 답변 변경 감지
- 답변 증거 번들
- 검토 사유
- 권한 감사
- 도구 호출

CLI 검증:

```bash
pnpm eval
pnpm agreement:smoke
pnpm trace:smoke
pnpm replay:smoke
pnpm evidence-bundle:smoke
pnpm question-audit:smoke
```

`pnpm eval`은 출처 적중, 1순위 출처 정확도, 사람 검토 정확도, 문서 일치율, 인용 정확도를 기준값과 비교합니다.

웹 콘솔 `질문` 화면에서는 근거 커버리지에 출처별 근거 스니펫이 표시되고, 증명 패킷 아래에 `증거 번들`이 표시됩니다. 이 영역은 추적, 증명, 재실행 결과를 한 번에 묶은 감사용 결과이며, `opspilot.answer_evidence_bundle.v1` 스키마와 `sha256` 해시를 함께 보여줍니다. 민감 작업 질문을 실행하면 출처 수, 도구 호출 수, 승인 수, 피드백 수, 권한 경계 재검사 결과까지 같이 확인할 수 있습니다.

웹 콘솔 `대응` 화면에서는 장애 대응 플랜 아래 `감사 번들`이 표시됩니다. 이 영역은 저장된 질문 ID를 기준으로 `opspilot.question_audit_bundle.v1`을 조회해 답변 row가 없는 workflow도 감사합니다. `search_documents`, `create_runbook_checklist`, `create_incident_response_plan`의 기대 상태와 실제 상태가 일치하는지, 출처 계보가 어떤 문서로 이어지는지, 현재 호출자 권한으로 출처 접근이 다시 확인됐는지, 번들 해시가 무엇인지 확인할 수 있습니다.

## 11. Slack 봇 로컬 검증

실제 Slack 인증 정보 없이도 같은 에이전트 경로를 검증할 수 있습니다.

```bash
pnpm slack:simulate
```

웹 콘솔에서는 `감사` 화면의 `Slack 시뮬레이션` 버튼을 누릅니다.

이 흐름은 Slack 멘션 요청을 질문으로 바꾸고, `/ask`와 같은 RAG/도구 호출 경로를 실행한 뒤 스레드 답변 요청을 생성합니다.

## 12. Elasticsearch 하이브리드 검색

기본은 PostgreSQL + pgvector입니다. Elasticsearch는 정확한 키워드, 에러 코드, API 경로, 로그 키워드 검색 품질을 보여주기 위한 선택형 확장입니다.

```bash
docker compose --profile search up -d
ENABLE_ELASTICSEARCH=true RETRIEVAL_MODE=hybrid pnpm ingest
ENABLE_ELASTICSEARCH=true RETRIEVAL_MODE=hybrid pnpm dev:api
```

하이브리드 모드에서도 Elasticsearch 결과는 권한의 기준이 아닙니다. 반환된 청크 ID를 PostgreSQL에서 다시 로드하면서 같은 권한 필터를 적용합니다.

## 13. 포트폴리오 데모 리포트 생성

브라우저 없이 핵심 증거를 만들려면:

```bash
pnpm portfolio:demo
```

Markdown 증거 리포트까지 남기려면:

```bash
pnpm portfolio:report
```

웹 화면까지 검증하려면 API와 웹 콘솔을 실행한 상태에서:

```bash
pnpm web:smoke
```

## 13. 자주 쓰는 검증 명령

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm eval
pnpm indexing:smoke
pnpm queue:smoke
pnpm github:smoke
pnpm permission:smoke
pnpm authn:smoke
pnpm redaction:smoke
pnpm prompt-injection:smoke
pnpm rate-limit:smoke
pnpm idempotency:smoke
pnpm release-gate:smoke
pnpm evidence-bundle:smoke
pnpm web:smoke
```

## 14. 데모에서 말할 포인트

면접이나 포트폴리오 설명에서는 다음 순서가 가장 좋습니다.

1. 운영 문서를 RAG 인덱스로 만들었다.
2. 새 문서를 넣으면 바로 청킹과 검색 검증이 된다.
3. 권한 없는 문서는 프롬프트에 들어가기 전에 제거된다.
4. 답변은 출처와 문서 일치율을 함께 보여준다.
5. `/ask`는 멱등성 키로 Slack 재시도와 중복 클릭을 안전하게 처리한다.
6. 증거 번들은 추적, 증명, 재실행, 권한 재검사, 무결성 해시를 한 번에 묶는다.
7. 런북 질문은 도구 호출로 체크리스트를 만든다.
8. 운영 DB 수정 같은 민감 작업은 사람 승인으로 분리된다.
9. Slack 멘션도 같은 에이전트 작업 흐름을 탄다.
10. 평가, 답변 변경 감지, 배포 게이트로 운영 품질을 계속 검증한다.
