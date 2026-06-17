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
- Web: `http://localhost:3001`
- PostgreSQL: `localhost:25432`
- Redis: `localhost:26379`
- Elasticsearch: `localhost:29200` 선택형

## 2. seed 문서 색인

```bash
pnpm ingest
```

이 명령은 `seed/documents` 아래 Markdown 문서를 읽어서 RAG 인덱스에 넣습니다.

현재 seed 문서는 결제 운영 서비스를 가정합니다.

- 결제 에러 코드
- 환불 정책
- 정산 배치 runbook
- Redis 장애 runbook
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

## 4. 문서 관리 위치

문서는 세 위치에서 관리합니다.

| 위치 | 용도 |
| --- | --- |
| `seed/documents` | 로컬 재현용 기본 운영 문서 |
| 웹 콘솔 `문서` 화면 | 데모 중 Markdown 문서 추가/수정 |
| 웹 콘솔 `GitHub 문서 동기화` | GitHub repository의 Markdown 문서 sync |

웹에서 문서를 등록하면 OpsPilot은 같은 path의 기존 문서를 새 버전으로 저장하고, chunk를 다시 만들고, embedding을 갱신합니다.

## 5. 새 문서 넣고 RAG 검증

웹 콘솔에서 `문서` 화면을 엽니다.

1. Markdown path를 입력합니다. 예: `public/status-page-policy.md`
2. Markdown 본문을 입력합니다.
3. `등록하고 RAG 검증` 버튼을 누릅니다.

버튼을 누르면 아래 검증이 한 번에 실행됩니다.

- Markdown 저장
- secret redaction
- prompt-injection scan
- chunking
- embedding 저장
- 문서 목록 refresh
- retrieval preview 실행
- `/ask` 실행
- 신규 문서가 1순위 출처인지 확인
- 답변의 문서 일치율 계산

화면의 `색인 검증` 영역에서 다음 값을 확인합니다.

- 색인 path
- chunk 수
- top 출처 path
- 출처 적중 여부
- 문서 일치율
- confidence

## 6. 청킹과 검색 결과 확인

청킹 결과는 웹 콘솔 `문서` 화면에서 확인합니다.

- `색인 인벤토리`: 문서별 chunk 수와 보안 metadata
- `청크 미리보기`: 실제 검색에 들어가는 chunk preview
- `문서 버전`: redaction 이후 저장된 버전과 diff

검색 랭킹은 `검색` 화면에서 확인합니다.

1. 질문을 입력합니다.
2. 팀/역할을 입력합니다.
3. `검색 미리보기`를 누릅니다.

이 화면은 답변을 생성하지 않고 retrieval만 실행합니다. 따라서 어떤 chunk가 프롬프트 후보가 되는지, 어떤 후보가 권한 때문에 차단되는지 안전하게 볼 수 있습니다.

## 7. 권한 경계 확인

권한은 문서 단위로 적용됩니다.

- `public`: 모든 사용자 접근 가능
- `team`: 사용자의 `teamSlugs`에 문서 `teamSlug`가 있어야 접근 가능
- `restricted`: `ops_admin` 또는 `security_admin` 필요

검증 방법:

```bash
pnpm permission:smoke
```

웹 콘솔에서는 `문서` 화면의 `매트릭스 불러오기`를 누르면 persona별 허용/차단 결과가 보입니다.

중요한 점은 권한 필터가 답변 생성 후가 아니라 검색/프롬프트 구성 전에 적용된다는 것입니다. 접근 불가능한 chunk는 LLM 컨텍스트에 들어가지 않습니다.

## 8. 도구 호출 확인

OpsPilot의 Agent 도구는 `감사` 화면에서 확인합니다.

현재 핵심 도구:

- `search_documents`: 접근 가능한 문서 chunk 검색
- `create_runbook_checklist`: runbook checklist 추출
- `request_human_approval`: 민감 작업 승인 요청 생성
- `save_feedback`: 답변 피드백 저장

검증 명령:

```bash
pnpm checklist:smoke
pnpm review:smoke
pnpm trace:smoke
```

민감 작업 예시:

```txt
운영 DB에서 고객 정보를 바로 수정해도 돼?
```

이 질문은 자동 실행되지 않고 사람 승인으로 분리되어야 합니다.

## 9. 문서 일치율과 답변 품질 확인

답변 화면은 다음 증거를 보여줍니다.

- confidence
- 문서 일치율
- 출처 목록
- source grounding coverage
- context budget
- answer proof packet
- 답변 drift
- answer evidence bundle
- review reasons
- permission audit
- 도구 호출

CLI 검증:

```bash
pnpm eval
pnpm agreement:smoke
pnpm trace:smoke
pnpm replay:smoke
pnpm evidence-bundle:smoke
```

`pnpm eval`은 출처 적중, 1순위 출처 accuracy, 사람 검토 accuracy, document agreement, citation accuracy를 threshold와 비교합니다.

웹 콘솔 `질문` 화면에서는 proof packet 아래에 `증거 번들`이 표시됩니다. 이 영역은 trace/proof/replay를 한 번에 묶은 감사용 결과이며, `opspilot.answer_evidence_bundle.v1` schema와 `sha256` 해시를 함께 보여줍니다. 민감 작업 질문을 실행하면 출처 수, 도구 호출 수, 승인 수, 피드백 수, 권한 경계 재검사 결과까지 같이 확인할 수 있습니다.

## 10. Slack Bot 로컬 검증

실제 Slack credential 없이도 같은 Agent 경로를 검증할 수 있습니다.

```bash
pnpm slack:simulate
```

웹 콘솔에서는 `감사` 화면의 `Slack 시뮬레이션` 버튼을 누릅니다.

이 플로우는 Slack mention payload를 질문으로 바꾸고, `/ask`와 같은 RAG/tool-calling 경로를 실행한 뒤 thread reply payload를 생성합니다.

## 11. Elasticsearch hybrid 검색

기본은 PostgreSQL + pgvector입니다. Elasticsearch는 exact keyword, 에러 코드, API path, 로그 키워드 검색 품질을 보여주기 위한 선택형 확장입니다.

```bash
docker compose --profile search up -d
ENABLE_ELASTICSEARCH=true RETRIEVAL_MODE=hybrid pnpm ingest
ENABLE_ELASTICSEARCH=true RETRIEVAL_MODE=hybrid pnpm dev:api
```

hybrid 모드에서도 Elasticsearch 결과는 권한의 기준이 아닙니다. 반환된 chunk id를 PostgreSQL에서 다시 로드하면서 같은 권한 필터를 적용합니다.

## 12. 포트폴리오 데모 리포트 생성

브라우저 없이 핵심 증거를 만들려면:

```bash
pnpm portfolio:demo
```

Markdown 리포트까지 남기려면:

```bash
pnpm portfolio:report
```

웹 화면까지 검증하려면 API와 Web을 실행한 상태에서:

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
2. 새 문서를 넣으면 바로 chunking과 검색 검증이 된다.
3. 권한 없는 문서는 프롬프트에 들어가기 전에 제거된다.
4. 답변은 출처와 문서 일치율을 함께 보여준다.
5. `/ask`는 idempotency key로 Slack retry와 중복 클릭을 안전하게 처리한다.
6. 증거 번들은 trace, proof, replay, 권한 재검사, 무결성 해시를 한 번에 묶는다.
7. runbook 질문은 도구 호출로 checklist를 만든다.
8. 운영 DB 수정 같은 민감 작업은 사람 승인으로 분리된다.
9. Slack mention도 같은 Agent workflow를 탄다.
8. 평가, 답변 drift, 배포 게이트로 운영 품질을 계속 검증한다.
