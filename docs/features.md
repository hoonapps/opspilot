# OpsPilot 기능 명세

OpsPilot은 URL, Markdown, txt, PDF, Word 문서를 운영 지식으로 저장하고, 사용자가 질문하면 권한이 허용된 문서만 근거로 검색해 답변하는 RAG 기반 AI Agent 플랫폼입니다. Slack은 핵심 기능이 아니라 같은 질의응답 파이프라인을 쓰는 확장 채널입니다.

## 한 문장 정의

다양한 문서 소스를 지식 베이스로 수집하고, 청킹/임베딩/검색/출처 기반 답변/권한 경계/도구 호출 감사/품질 평가까지 검증하는 운영 지원 AI Agent입니다.

## 사용자 관점 기능

| 기능 | 설명 | 포트폴리오에서 보여줄 증거 |
| --- | --- | --- |
| 문서 넣기 | URL, Markdown, txt, PDF, Word docx를 등록합니다. | 웹 `문서` 화면, `POST /documents/source`, `pnpm source-ingestion:smoke` |
| 문서 저장 | 원본 타입, URL/파일명, 경로, 권한, 태그, 버전을 저장합니다. | 문서 목록, 버전 이력, 색인 스냅샷 |
| 수집 추적 | 원본 URL/파일명, content type, parser, 추출 해시, 저장 해시를 반환하고 문서 metadata에 보존합니다. | `provenance`, 웹 문서 수집 결과, 문서 상세 |
| 텍스트 추출 | 파일 타입별로 텍스트를 추출하고 표준 Markdown으로 변환합니다. | 수집 품질 리포트, 파서 선택 결과 |
| 청킹 | 문서를 헤딩/문단 기준으로 검색 가능한 조각으로 나눕니다. | 청크 미리보기, 색인 설명 |
| 임베딩 | 각 청크의 embedding을 생성하고 pgvector에 저장합니다. | 임베딩 커버리지, 색인 품질 리포트 |
| RAG 검색 | 질문과 관련된 청크를 벡터/키워드 기반으로 찾습니다. | 검색 미리보기, 랭킹 설명, 검색 프로파일 |
| 임베딩 비교 | 같은 질문/문서에서 로컬 임베딩과 OpenAI 임베딩의 검색 순위를 비교합니다. | `GET /evaluations/embedding-comparison`, `pnpm embedding-hard:smoke` |
| 근거 기반 답변 | 검색된 문서 조각만 사용해 답변하고 출처를 표시합니다. | `/ask` 응답, 답변 출처, 문서 일치율 |
| 모름 처리 | 근거가 없거나 약하면 꾸며내지 않고 확인 불가로 응답합니다. | unsupported answer 정책, 품질 게이트 |
| 권한 경계 | 사용자 팀/역할에 따라 접근 가능한 문서만 검색·답변에 사용합니다. | 권한별 검색 비교, 권한 경계 스모크 |
| 도구 호출 | 검색, 체크리스트 생성, 장애 대응 플랜, 승인 요청을 tool로 기록합니다. | 도구 호출 로그, 질문 감사 번들 |
| 사람 승인 | 운영 DB 수정, 강제 환불 같은 민감 작업은 승인 요청으로 분리합니다. | 승인 대기열, `request_human_approval` 로그 |
| 품질 평가 | 출처 적중률, 1순위 출처 정확도, 문서 일치율, 인용 정확도를 평가합니다. | `pnpm eval`, 평가 회귀 리포트 |
| 변경 영향 분석 | 문서가 바뀌면 과거 답변이 낡았는지 재검증합니다. | 문서 영향 분석, 재검증 큐와 실행 이력 |
| Slack 확장 | Slack mention을 같은 RAG/도구 호출 파이프라인으로 처리합니다. | Slack 시뮬레이터, Slack trace |

## 처리 흐름

1. 사용자가 URL 또는 파일을 등록합니다.
2. OpsPilot이 원본 타입과 메타데이터를 저장합니다.
3. 소스 타입별 파서가 텍스트를 추출합니다.
4. 추출 텍스트를 표준 Markdown으로 변환합니다.
5. 시크릿 마스킹과 프롬프트 주입 검사를 수행합니다.
6. Markdown을 헤딩/문단 기준으로 청킹합니다.
7. 각 청크의 embedding을 생성합니다.
8. PostgreSQL + pgvector에 문서, 버전, 청크, embedding을 저장합니다.
9. 선택적으로 Elasticsearch에 미러 색인합니다.
10. 사용자가 질문하면 권한이 허용된 청크만 검색합니다.
11. 검색 결과를 컨텍스트 패키지로 만들고 답변을 생성합니다.
12. 답변, 출처, 문서 일치율, 도구 호출, 승인 상태, 피드백을 로그로 남깁니다.

## 지원하는 문서 소스

| 소스 | 현재 지원 범위 | 검증 방법 |
| --- | --- | --- |
| Markdown | frontmatter, 권한, 태그, 버전 관리 | `pnpm ingest`, `pnpm indexing:smoke` |
| txt | 텍스트 파일 업로드 후 Markdown 변환 | `pnpm source-ingestion:smoke` |
| PDF | PDF 텍스트 추출 후 색인 | `pnpm source-ingestion:smoke` |
| Word docx | 문단 텍스트 추출 후 색인 | `pnpm source-ingestion:smoke` |
| URL | HTTP/HTTPS 페이지 수집, private URL 차단 | `pnpm source-ingestion:smoke` |
| GitHub Markdown | 저장소 문서 동기화 | `pnpm github:smoke` |

URL 수집은 SSRF 방지를 위해 localhost, private IP, link-local, multicast, 내부망 redirect를 기본 차단합니다. 로컬 fixture 테스트가 필요할 때만 `SOURCE_INGESTION_ALLOW_PRIVATE_URLS=true`를 명시합니다.

## RAG에서 확인할 수 있는 것

- 어떤 문서가 검색됐는지
- 어떤 청크가 컨텍스트에 들어갔는지
- 벡터 점수와 키워드 점수가 어떻게 결합됐는지
- 접근 권한이 없어 제외된 후보가 있는지
- 답변과 근거 문서의 일치율이 얼마인지
- 답변 문장별로 어떤 출처 스니펫이 지지하는지
- 같은 질문을 다르게 표현해도 1순위 출처가 유지되는지
- 문서 변경 이후 이전 답변이 여전히 유효한지

## 권한 경계

문서 권한은 답변 생성 이후가 아니라 검색 단계에서 먼저 적용됩니다.

| visibility | 접근 조건 |
| --- | --- |
| `public` | 모든 사용자 |
| `team` | 문서의 `teamSlug`가 사용자 `teamSlugs`에 포함될 때 |
| `restricted` | `ops_admin` 또는 `security_admin` 역할 |

Elasticsearch 하이브리드 검색을 켜도 Elasticsearch 결과를 그대로 신뢰하지 않습니다. Elasticsearch가 반환한 후보 ID를 PostgreSQL에서 다시 로드하고 같은 권한 필터를 통과한 청크만 답변 컨텍스트에 넣습니다.

## Tool calling 경계

OpsPilot의 Agent tool은 읽기/생성/승인 요청으로 나뉩니다.

| tool | 역할 | 승인 필요 여부 |
| --- | --- | --- |
| `search_documents` | 접근 가능한 문서 검색 | 불필요 |
| `create_runbook_checklist` | 런북 기반 체크리스트 생성 | 불필요 |
| `create_incident_response_plan` | 장애 대응 플랜 생성 | 불필요 |
| `request_human_approval` | 민감 작업 승인 요청 생성 | 필요 |

민감 작업은 Agent가 직접 실행하지 않습니다. 운영 DB 수정, 강제 환불, 권한 부여처럼 실제 시스템 상태를 바꾸는 요청은 승인 요청으로만 남기고, 사람이 승인 또는 반려해야 합니다.

## 답변 품질 검증

OpsPilot은 답변 텍스트만 보는 프로젝트가 아니라, 답변이 문서와 맞는지 검증하는 프로젝트입니다.

| 지표 | 의미 |
| --- | --- |
| source hit rate | 기대한 문서가 검색 결과에 포함됐는지 |
| top source accuracy | 기대한 문서가 1순위 출처인지 |
| document agreement | 답변이 근거 문서와 얼마나 겹치는지 |
| citation accuracy | 답변 출처가 실제 근거 문서인지 |
| claim support | 답변 문장별로 출처 스니펫이 지지하는지 |
| retrieval robustness | 질문 표현이 바뀌어도 출처가 안정적인지 |
| embedding comparison | 임베딩 모델을 바꿨을 때 의미 검색 순위가 개선되는지 |
| evaluation coverage | 평가가 현재 문서 집합을 얼마나 덮는지 |

## 데모에서 보여줄 순서

1. PDF, Word, URL 중 하나를 등록합니다.
2. 수집 품질이 `ready`인지 확인합니다.
3. 수집 추적 정보에서 원본, parser, content type, 저장 content hash, URL 보안 가드를 확인하고 문서 상세 metadata에 남았는지 확인합니다.
4. 청크 미리보기와 색인 설명을 확인합니다.
5. 추천 테스트 질문으로 `/ask`를 실행합니다.
6. 답변에 출처와 문서 일치율이 표시되는지 확인합니다.
7. 권한이 낮은 사용자로 같은 질문을 던져 제한 문서가 빠지는지 확인합니다.
8. 민감 작업 질문을 던져 사람 승인 요청으로 분리되는지 확인합니다.
9. 평가/품질 게이트/포트폴리오 리포트로 전체 상태를 검증합니다.

## 현재 프로젝트 성격

OpsPilot은 단순 챗봇이 아닙니다. 포트폴리오에서 강조해야 할 포인트는 “LLM 답변을 만들었다”가 아니라 아래 세 가지입니다.

- 새 문서를 넣으면 실제로 색인되고 검색되는가
- 권한이 없는 문서는 답변 프롬프트에 들어가지 않는가
- 답변이 문서와 얼마나 일치하는지 측정하고 실패를 검출하는가
