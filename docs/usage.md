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

전체 기능 범위는 [기능 명세](features.md)에 정리되어 있습니다. 면접이나 데모에서는 문서 수집, 청킹/임베딩, 권한 인식 검색, 근거 기반 답변, 도구 호출 감사, 사람 승인, 평가 게이트 순서로 설명하면 됩니다.

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
- 색인 스냅샷 갱신
- 검색 미리보기 실행
- `/ask` 실행
- 신규 문서가 1순위 출처인지 확인
- 답변의 문서 일치율 계산

같은 문서를 다시 수정해 등록한 뒤 문서 상세의 `색인 설명`을 누르면 이 문서가 어떤 파이프라인으로 청킹/임베딩됐는지, 헤딩 아웃라인과 검색 힌트가 무엇인지, 64차원 임베딩이 모든 청크에 저장됐는지 확인할 수 있습니다.

문서 화면의 `지식 베이스 스냅샷`은 전체 색인 상태를 SHA-256 해시로 보여줍니다. `스냅샷 생성`을 누르면 현재 문서 수, 청크 수, 버전 문서 수, 임베딩 커버리지, 문서별 `contentHash`, `chunkSetHash`, `document_chunk_manifest_v1` 매니페스트가 표시됩니다. 새 문서를 넣거나 같은 문서를 수정하면 스냅샷 해시가 바뀌어야 합니다.

문서 상세의 `영향 분석`을 누르면 이 문서를 근거로 사용한 과거 답변, 문서 변경 이후 오래된 답변, 1순위 근거 여부, 재실행 검증 권고를 확인할 수 있습니다.

문서 화면의 `문서 재검증 큐`는 특정 문서 하나가 아니라 전체 문서 변경을 기준으로 오래된 답변을 모읍니다. 큐 항목은 `P0`~`P3` 우선순위, 위험도, 변경 문서, 과거 답변, `replay`, `lineage`, `quality-gate` 재검증 경로를 함께 보여줍니다. 각 항목의 `재검증 실행`을 누르면 현재 문서 기준 replay, 품질 게이트, 답변 계보 그래프를 한 번에 실행하고 `종료 가능`, `재검토 필요`, `차단 필요` 판정, 리포트 해시, 최근 실행 이력을 확인할 수 있습니다.

화면의 `색인 검증` 영역에서 다음 값을 확인합니다.

- 색인 경로
- 청크 수
- 1순위 출처 경로
- 출처 적중 여부
- 문서 일치율
- 신뢰도
- 검증 통과/검토 필요 판정 이유
- 실제 답변 미리보기

문서 목록과 상세 화면에서는 각 문서의 원본도 함께 확인합니다.

- 원본 타입: URL, TXT, Markdown, PDF, Word
- 원본 URL 또는 파일명
- 저장 경로와 태그
- 팀/권한, 마스킹 수, 프롬프트 주입 격리 상태

같은 화면의 `색인 품질 리포트`에서는 지식 베이스 전체 상태를 확인합니다.

- 게이트 통과율
- 평균 청크 길이
- 문서당 청크 수
- 문서 존재/청크 커버리지/버전 커버리지/청크 크기/보안 격리 게이트
- 문서별 헤딩 커버리지와 개선 권고

CLI로 같은 검증을 하려면:

```bash
pnpm index-explain:smoke
pnpm index-snapshot:smoke
pnpm index-quality:smoke
pnpm source-ingestion:smoke
pnpm revalidation-queue:smoke
pnpm revalidation-run:smoke
```

`pnpm source-ingestion:smoke`는 URL, txt, PDF, Word docx를 모두 실제 fixture로 넣고 파서, 청크, 품질 리포트, 1순위 답변 출처를 확인합니다.

URL, txt, PDF, Word 문서를 직접 테스트하려면 `문서` 화면 상단의 `문서 넣고 바로 질문하기` 영역을 사용합니다.

1. 소스 타입을 고릅니다.
2. URL을 입력하거나 `.md`, `.txt`, `.pdf`, `.docx` 파일을 선택합니다.
3. 테스트 질문을 입력합니다.
4. `문서 등록하고 질문 테스트`를 누릅니다.

OpsPilot은 입력을 표준 Markdown으로 변환한 뒤 기존 청킹/임베딩/RAG 파이프라인에 연결합니다. 접근 가능한 문서가 없거나 검색 신뢰도가 최소 근거 기준보다 낮으면 `문서에서 확인할 수 없습니다`라고 답하고 사람 검토 대상으로 남깁니다.

등록 결과의 `수집 품질` 패널은 새 문서가 검색에 충분한지 바로 보여줍니다. `ready`는 추출 텍스트, 청크, 검색 힌트, 보안 스캔이 기준을 통과한 상태입니다. `attention`은 문서가 너무 짧거나 헤딩/검색 키워드가 부족해 답변 품질이 약할 수 있다는 뜻입니다. 이때 추천 조치에 따라 OCR, 원문 보강, Markdown 헤딩 추가, 정책명/장애 코드 같은 검색 키워드 명시를 진행하면 됩니다.

등록 결과의 `수집 추적 정보`는 원본 URL/파일명, content type, parser, 원본 바이트 크기, 추출 텍스트 해시, 저장 content hash, 청크 수, URL 보안 가드 상태를 보여줍니다. 이 값으로 “파일이 업로드됐다”가 아니라 “어떤 원본이 어떤 파서와 해시로 지식 베이스에 저장됐는지”를 설명할 수 있습니다.

같은 패널의 `추천 테스트 질문`은 문서 제목과 검색 힌트로 자동 생성됩니다. 버튼을 누르면 테스트 질문 입력칸에 들어가므로, 새 문서를 넣은 뒤 어떤 질문으로 1순위 출처 적중을 확인할지 고민하지 않아도 됩니다.

## 6. 청킹과 검색 결과 확인

청킹 결과는 웹 콘솔 `문서` 화면에서 확인합니다.

- `색인 인벤토리`: 문서별 청크 수와 보안 메타데이터
- `지식 베이스 스냅샷`: 전체 문서/청크/버전 매니페스트 해시와 문서별 청크 집합 해시
- `색인 품질 리포트`: 전체 문서/청크 커버리지와 문서별 개선 권고
- `문서 재검증 큐`: 문서 변경 이후 오래된 답변의 우선순위와 재검증 액션
- `재검증 실행`: 큐 항목을 replay, 품질 게이트, 계보 해시로 즉시 판정하고 실행 이력 저장
- `청크 미리보기`: 실제 검색에 들어가는 청크 미리보기
- `문서 버전`: 마스킹 이후 저장된 버전과 변경 차이

검색 랭킹은 `검색` 화면에서 확인합니다.

1. 질문을 입력합니다.
2. 팀/역할을 입력합니다.
3. `검색 미리보기`를 누릅니다.

이 화면은 답변을 생성하지 않고 검색만 실행합니다. 따라서 어떤 청크가 프롬프트 후보가 되는지, 어떤 후보가 권한 때문에 차단되는지 안전하게 볼 수 있습니다.

같은 화면의 `권한별 검색 비교`를 누르면 같은 질문을 공개 사용자, 지원 담당자, 결제 온콜, 운영 관리자 권한으로 다시 실행합니다. 이 리포트는 권한별 1순위 출처, 차단 후보 수, 제한 문서 후보 노출 여부, 새로 보이는 문서를 비교해 권한 경계가 검색 단계에서 적용되는지 보여줍니다.

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

같은 화면의 `검색 프로파일`을 누르면 운영 관점의 단계별 프로파일을 확인합니다.

- 전체 지연과 검색 지연
- 단계별 latency budget
- 권한 차단 후보 수
- 컨텍스트 예산 사용률
- 프로파일 해시
- 병목과 조치 액션

같은 화면의 `검색 강건성 리포트`에서는 `질문 변형 안정성 진단`을 눌러 다음을 확인합니다.

- 같은 의도의 질문 변형들이 같은 1순위 출처로 수렴하는지
- 기준 질문과 변형 질문의 후보 출처가 얼마나 겹치는지
- 평균 신뢰도와 최고 점수 변동폭이 기준 안에 있는지
- 변형 검색 중 권한 경계에서 차단된 후보가 있었는지

CLI로는 같은 흐름을 아래 명령으로 검증합니다.

```bash
pnpm retrieval-profile:smoke
pnpm retrieval-permission-diff:smoke
pnpm retrieval-robustness:smoke
pnpm eval:regression-smoke
```

품질 화면에서 `평가 불러오기`를 누르면 최신 평가, 회귀 이력, 케이스 상세 리포트와 함께 `회귀 릴리즈 리포트`가 표시됩니다. 이 리포트는 직전 평가 대비 하락한 메트릭, 실패 게이트, 고위험 케이스, 릴리즈 판단, 리포트 해시, 재검증 명령을 한 화면에 묶습니다.

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
- 문장별 근거 검증
- 답변 계보 그래프
- 답변 신뢰 게이트
- 감사 원장 루트 해시
- 검토 사유
- 권한 감사
- 도구 호출

CLI 검증:

```bash
pnpm eval
pnpm retrieval-robustness:smoke
pnpm eval:coverage-smoke
pnpm agreement:smoke
pnpm trace:smoke
pnpm claim-support:smoke
pnpm replay:smoke
pnpm evidence-bundle:smoke
pnpm lineage:smoke
pnpm quality-gate:smoke
pnpm question-audit:smoke
pnpm audit-ledger:smoke
pnpm error-budget:smoke
pnpm action-plan:smoke
```

`pnpm eval`은 출처 적중, 1순위 출처 정확도, 사람 검토 정확도, 문서 일치율, 인용 정확도를 기준값과 비교합니다.

웹 콘솔 `질문` 화면에서는 근거 커버리지에 출처별 근거 스니펫이 표시되고, 추적 요약 아래에 `답변 신뢰 게이트`가 표시됩니다. 이 게이트는 증명 패킷, 현재 문서 기준 재실행, 승인 상태, 피드백 신호, 문서 일치율, 근거 커버리지, 권한 재검사를 묶어 `공유 가능`, `검토 후 공유`, `차단 후 재작성` 중 하나로 판정합니다. 일반 답변은 피드백 저장 전에는 검토 대상으로 남고, `도움됨` 피드백을 저장하면 공유 가능으로 바뀝니다. 민감 작업 질문은 승인 대기 상태 때문에 자동 공유되지 않습니다.

같은 화면의 `문장별 근거 검증`은 답변을 claim 단위로 나누고 각 문장이 어떤 출처 스니펫으로 지지되는지 보여줍니다. 면접에서는 “출처 목록만 붙인 것이 아니라, 답변 문장마다 실제 문서 스니펫과 토큰 일치 점수를 계산해 미지원 문장을 찾는다”고 설명하면 됩니다. `pnpm claim-support:smoke`는 제한 문서 답변에서 권한 없는 호출자가 이 리포트를 볼 수 없고, 권한 있는 호출자는 claim, 스니펫, 리포트 해시를 받는지 확인합니다.

웹 콘솔 `품질` 화면의 `평가 문서 커버리지`는 최신 평가가 현재 지식 베이스의 어떤 문서를 기대 출처 또는 실제 검색 출처로 검증했는지 보여줍니다. 제한 문서와 팀 문서 커버리지, 미검증 문서, suggested question, 리포트 해시를 함께 확인할 수 있습니다. `pnpm eval:coverage-smoke`는 평가에 포함되지 않은 문서를 의도적으로 추가해 blind spot 탐지가 작동하는지 검증합니다.

웹 콘솔 `품질` 화면의 `오류 예산 소모율`은 최근 5분, 1시간, 24시간 API 5xx가 허용 오류 예산을 얼마나 소모하는지 보여줍니다. `error-budget:smoke`는 실패 로그를 주입해 오류 예산 소모율이 높을 때 배포 동결 권고와 주요 실패 엔드포인트가 잡히는지 검증합니다.

같은 화면의 `운영 액션 플랜`은 배포 게이트와 SLO의 실패/검토 항목을 담당자, P0/P1/P2 우선순위, 조치, 검증 명령으로 바꿉니다. 배포 보류 사유를 말할 때는 이 영역에서 “누가 무엇을 고치고 어떤 명령으로 회복을 증명하는지”를 보여주면 됩니다.

같은 화면의 `포트폴리오 증거 보드`는 RAG 근거성, 권한 경계, 도구 호출 감사, 운영성, 데모 산출물을 서버에서 한 번에 집계합니다. 이 패널은 `GET /observability/portfolio-readiness` 응답을 사용하며, 면접에서는 “현재 데모가 보여줄 준비가 됐는지”를 먼저 설명한 뒤 아래 화면으로 들어가면 됩니다.

같은 화면의 `증거 번들`은 추적, 증명, 재실행 결과를 한 번에 묶은 감사용 결과이며, `opspilot.answer_evidence_bundle.v1` 스키마와 `sha256` 해시를 함께 보여줍니다. 민감 작업 질문을 실행하면 출처 수, 도구 호출 수, 승인 수, 피드백 수, 권한 경계 재검사 결과까지 같이 확인할 수 있습니다.

같은 화면의 `답변 계보 그래프`는 질문, 답변, 출처, 도구 호출, 승인, 피드백, 신뢰 게이트를 노드/엣지로 보여줍니다. 면접에서는 이 영역에서 “RAG 답변이 어떤 문서에 근거했고, 어떤 도구 호출과 사람 승인 경계가 최종 판정에 영향을 줬는지”를 한 번에 설명하면 됩니다. `pnpm lineage:smoke`는 이 그래프가 제한 출처, 승인 대기, 피드백, 권한 재검사, SHA-256 해시까지 포함하는지 확인합니다.

웹 콘솔 `대응` 화면에서는 장애 대응 플랜 아래 `감사 번들`이 표시됩니다. 이 영역은 저장된 질문 ID를 기준으로 `opspilot.question_audit_bundle.v1`을 조회해 답변 행이 없는 작업 흐름도 감사합니다. `search_documents`, `create_runbook_checklist`, `create_incident_response_plan`의 기대 상태와 실제 상태가 일치하는지, 출처 계보가 어떤 문서로 이어지는지, 현재 호출자 권한으로 출처 접근이 다시 확인됐는지, 번들 해시가 무엇인지 확인할 수 있습니다.

웹 콘솔 `감사` 화면의 `감사 원장 해시 체인`은 최근 질문, 답변, 도구 호출, 승인, 피드백 이벤트를 시간순으로 묶고 `previousHash`, `eventHash`, `chainHash`를 계산합니다. 루트 해시가 바뀌면 같은 이벤트 윈도우의 감사 payload가 달라졌다는 뜻이므로, 면접에서는 “운영 기록을 단순 로그가 아니라 무결성 검증 가능한 원장으로 본다”고 설명하면 됩니다.

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

로컬에서 실제 동작을 검증하려면 아래 명령을 실행합니다.

```bash
docker compose --profile search up -d
pnpm elasticsearch:smoke
```

이 스모크는 공개 문서와 제한 문서를 Elasticsearch에 미러 색인하고, 검색 계획이 `hybrid`인지, 권한 집행이 `postgres_recheck_after_elasticsearch`인지, 공개 사용자가 제한 문서를 받지 않는지, 운영 관리자는 제한 문서를 검색할 수 있는지 확인합니다.

## 13. 포트폴리오 데모 리포트 생성

브라우저 없이 핵심 증거를 만들려면:

```bash
pnpm portfolio:demo
```

Markdown 증거 리포트까지 남기려면:

```bash
pnpm portfolio-readiness:smoke
pnpm portfolio:report
```

웹 화면까지 검증하려면 API와 웹 콘솔을 실행한 상태에서:

```bash
pnpm web:smoke
```

## 14. 자주 쓰는 검증 명령

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm eval
pnpm eval:regression-smoke
pnpm indexing:smoke
pnpm source-ingestion:smoke
pnpm queue:smoke
pnpm github:smoke
pnpm index-snapshot:smoke
pnpm retrieval-profile:smoke
pnpm permission:smoke
pnpm authn:smoke
pnpm redaction:smoke
pnpm prompt-injection:smoke
pnpm rate-limit:smoke
pnpm idempotency:smoke
pnpm release-gate:smoke
pnpm portfolio-readiness:smoke
pnpm audit-ledger:smoke
pnpm error-budget:smoke
pnpm evidence-bundle:smoke
pnpm lineage:smoke
pnpm revalidation-queue:smoke
pnpm revalidation-run:smoke
pnpm quality-gate:smoke
pnpm web:smoke
```

## 15. 데모에서 말할 포인트

면접이나 포트폴리오 설명에서는 다음 순서가 가장 좋습니다.

1. 운영 문서를 RAG 인덱스로 만들었다.
2. 새 문서를 넣으면 바로 청킹과 검색 검증이 된다.
3. 권한 없는 문서는 프롬프트에 들어가기 전에 제거된다.
4. 답변은 출처와 문서 일치율을 함께 보여준다.
5. `/ask`는 멱등성 키로 Slack 재시도와 중복 클릭을 안전하게 처리한다.
6. 답변 신뢰 게이트는 개별 답변을 공유 가능/검토 필요/차단으로 판정한다.
7. 증거 번들은 추적, 증명, 재실행, 권한 재검사, 무결성 해시를 한 번에 묶는다.
8. 런북 질문은 도구 호출로 체크리스트를 만든다.
9. 운영 DB 수정 같은 민감 작업은 사람 승인으로 분리된다.
10. Slack 멘션도 같은 에이전트 작업 흐름을 탄다.
11. 평가, 답변 변경 감지, 배포 게이트로 운영 품질을 계속 검증한다.
