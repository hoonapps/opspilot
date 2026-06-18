# 문서 색인

OpsPilot의 RAG 핵심은 Markdown 문서를 운영 지식 인덱스로 바꾸고, 새 문서가 실제 답변에 반영되는지 증명하는 것입니다.

## 입력 경로

- `pnpm ingest`: `seed/documents`의 기본 문서 색인
- `POST /documents/markdown`: 런타임 Markdown 등록/수정
- `POST /documents/github/sync`: GitHub Markdown 동기화
- `POST /documents/indexing-jobs/markdown`: BullMQ 비동기 색인
- `GET /documents/indexing-jobs`: 큐 카운트, 최근 작업, 워커 상태 관제
- `GET /documents/index-snapshot`: 전체 지식 베이스의 문서/청크/버전/해시 매니페스트 확인
- `GET /documents/index-quality`: 전체 색인 품질 게이트와 문서별 개선 권고 확인
- `GET /documents/{id}/index-explain`: 특정 문서의 청킹/임베딩/헤딩/버전/보안 메타데이터 설명
- `GET /documents/{id}/impact`: 문서 변경이 과거 답변과 운영 판단에 미치는 영향 확인
- `DELETE /documents/{id}`: 특정 문서와 연결 색인/이력을 삭제하고 과거 답변 영향 요약 반환
- `GET /documents/revalidation-queue`: 문서 변경 이후 오래된 답변을 전역 재검증 큐로 집계
- `GET /documents/revalidation-runs`: 저장된 재검증 실행 이력과 리포트 해시 조회
- `POST /documents/revalidation-runs`: 큐 항목 하나를 replay, 품질 게이트, 계보 그래프로 즉시 재검증하고 실행 이력 저장

## 처리 단계

1. frontmatter 파싱
2. 문서 가시성/팀/제목 정규화
3. 시크릿 마스킹
4. 프롬프트 주입 검사
5. Markdown 청킹
6. 로컬/OpenAI 임베딩 생성
7. PostgreSQL + pgvector 저장
8. 선택적으로 Elasticsearch 미러 저장
9. 문서 버전과 변경 차이 저장

청킹은 `@opspilot/rag`의 `heading_paragraph_window_v1` 전략을 사용합니다. `#`, `##`, `###` 헤딩 기준으로 섹션을 나누고 문단을 1200자 이하 윈도로 묶습니다. 제목만 단독으로 남는 작은 헤딩 청크는 다음 섹션과 병합해 벡터 검색 신호가 약해지지 않게 합니다. 이 계약은 `packages/rag/src/index.test.ts`에서 패키지 단위로 검증합니다.

## 검증

```bash
pnpm indexing:smoke
pnpm index-explain:smoke
pnpm index-snapshot:smoke
pnpm index-quality:smoke
pnpm document-impact:smoke
pnpm document-delete:smoke
pnpm revalidation-queue:smoke
pnpm revalidation-run:smoke
pnpm queue:smoke
pnpm github:smoke
pnpm embedding-eval:smoke
pnpm embedding-hard:smoke
pnpm --filter @opspilot/rag test
```

`pnpm index-explain:smoke`는 새 Markdown 문서를 두 번 등록해 버전 diff를 만든 뒤, 문서 단위 색인 설명 리포트가 청킹 전략, 64차원 임베딩 커버리지, 헤딩 아웃라인, 검색 힌트, 검색 준비 상태를 올바르게 반환하는지 검증합니다.

`pnpm index-snapshot:smoke`는 같은 색인 상태에서 스냅샷 해시가 안정적인지 확인한 뒤, 새 Markdown 문서를 넣었을 때 전체 문서 수, 청크 수, 버전 문서 수, 문서별 `contentHash`, `chunkSetHash`가 매니페스트에 반영되는지 검증합니다.

`pnpm index-quality:smoke`는 새 Markdown 문서를 넣은 뒤 색인 품질 리포트가 해당 문서의 청크 생성, 버전 저장, 헤딩 커버리지, 보안 격리 체크를 통과시키는지 검증합니다.

`pnpm document-impact:smoke`는 특정 문서를 근거로 사용한 답변을 만든 뒤 문서를 변경하고, 영향 분석 리포트가 해당 답변을 오래된 재검증 대상으로 표시하는지 검증합니다.

`pnpm document-delete:smoke`는 특정 문서를 근거로 사용한 답변을 만든 뒤 `DELETE /documents/{id}`와 같은 삭제 경로를 실행합니다. 삭제 결과가 문서, 청크, 버전, 답변 출처, 재검증 이력, Elasticsearch 미러 청크 정리와 영향 답변 요약을 반환하는지, 삭제 후 목록과 색인 스냅샷에서 문서가 사라지는지 검증합니다.

`pnpm revalidation-queue:smoke`는 문서 변경 이후 오래된 답변이 전역 큐에 올라가고, 위험도/우선순위와 replay, lineage, quality gate 링크가 함께 생성되는지 검증합니다.

`pnpm revalidation-run:smoke`는 큐 항목 하나를 실제로 실행해 replay 변경 감지, 품질 게이트 판정, 계보 그래프 SHA-256 해시, 출처 권한 재검사, 실행 이력 저장이 한 흐름으로 묶이는지 검증합니다.

`pnpm queue:smoke`는 BullMQ 작업 생성, 워커 처리, 완료 작업 조회, 큐 관제 API의 완료 카운트와 최근 작업 목록까지 검증합니다.

`pnpm embedding-eval:smoke`는 현재 seed 문서 청크를 대상으로 로컬 해시 임베딩 baseline과 OpenAI embedding candidate를 비교할 수 있는 리포트가 생성되는지 검증합니다. 로컬/CI처럼 `OPENAI_API_KEY`가 없는 환경에서는 candidate를 `skipped`로 남기고, key가 있는 데모 환경에서는 같은 문서와 질문으로 실제 OpenAI embedding 순위까지 계산합니다.

`pnpm embedding-hard:smoke`는 `seed/embedding-hard/documents`의 테스트 문서를 임시 색인합니다. 질문과 문서가 같은 단어를 많이 공유하지 않도록 만든 세트라서, 단순 토큰 겹침이나 로컬 해시 임베딩이 약한 상황을 보여줍니다. 이 명령은 실행 후 기본 seed 문서를 다시 복구합니다.

웹 콘솔 `문서` 화면에서는 문서 목록, 청크 수, 마스킹 메타데이터, 프롬프트 주입 격리 상태, 색인 스냅샷, 색인 품질 리포트, 문서 색인 설명, 버전 변경 차이, 문서 변경 영향 분석, 문서 재검증 큐, 재검증 실행 리포트와 최근 실행 이력, 청크 미리보기, 신규 문서 검색 검증 결과, BullMQ 큐 관제 패널을 볼 수 있습니다.

문서 상세의 `삭제`는 선택한 문서 하나만 제거합니다. 전체 초기화와 달리 나머지 문서는 유지하고, 삭제 결과에는 제거된 청크/버전/답변 출처 수와 이 문서를 근거로 사용했던 과거 답변 수가 표시됩니다.

## 색인 스냅샷

`GET /documents/index-snapshot`은 현재 지식 베이스를 `document_chunk_manifest_v1` 매니페스트로 정규화합니다. 이 리포트는 색인 품질이 “좋다/나쁘다”를 판정하기보다, 지금 검색에 쓰이는 지식 베이스가 어떤 문서와 청크 집합으로 구성되어 있는지 증명합니다.

- 스냅샷 해시: `generatedAt`을 제외한 정규화 JSON의 SHA-256
- 문서 해시: 마스킹 이후 저장된 문서 본문 해시
- 청크 집합 해시: 청크 인덱스와 청크 본문 해시를 정렬해 만든 문서별 SHA-256
- 버전 정보: 최신 버전과 누적 버전 수
- 커버리지: 임베딩 청크 비율, 헤딩 청크 비율, 보안 격리 상태

면접 데모에서는 문서를 등록하기 전후로 `스냅샷 생성`을 눌러 해시와 청크 수가 바뀌는 것을 보여주면 됩니다. 이 기능은 “새 문서를 넣었을 때 실제로 재색인됐는가”를 화면과 CLI 양쪽에서 증명합니다.

## 색인 품질 게이트

`GET /documents/index-quality`는 현재 저장된 문서와 청크를 기준으로 아래 게이트를 계산합니다.

- 문서 존재: 색인된 문서가 1개 이상인지 확인합니다.
- 청크 커버리지: 모든 문서에 검색 가능한 청크가 있는지 확인합니다.
- 버전 커버리지: 모든 문서에 마스킹 이후 버전 이력이 있는지 확인합니다.
- 청크 크기: 평균 청크 길이가 검색 컨텍스트에 넣기 적절한 범위인지 확인합니다.
- 보안 격리: 프롬프트 주입 위험 문서가 있는지 표시합니다.

문서별 결과에는 최신 버전, 청크 수, 평균/최대/최소 청크 길이, 헤딩 커버리지, 마스킹 수, 프롬프트 주입 위험, 개선 권고가 포함됩니다. 이 화면은 “문서를 넣었는데 실제로 RAG가 쓸 수 있는 형태로 색인됐는가”를 면접 데모에서 바로 증명하기 위한 장치입니다.

## 문서 색인 설명

`GET /documents/{id}/index-explain`은 선택한 문서 하나를 기준으로 색인 파이프라인과 청크 결과를 설명합니다. 색인 품질 리포트가 전체 지식 베이스의 건강 상태라면, 색인 설명 리포트는 “이 문서 하나가 왜 검색 가능한가”를 증명합니다.

- 파이프라인: `frontmatter_markdown_v1`, `security_redaction_v1`, `heading_paragraph_window_v1`, `local_hash_embedding_64d`, `pgvector_hnsw`
- 요약: 청크 수, 본문 길이, 헤딩 커버리지, 64차원 임베딩 커버리지, 검색 준비 상태
- 체크: 청크 생성, 임베딩 커버리지, 헤딩 신호, 청크 크기, 버전 추적, 보안 메타데이터
- 청크: 미리보기, 토큰 추정치, 검색 힌트, 임베딩 저장 여부
- 최신 변경 차이: 같은 경로로 다시 등록한 문서의 변경 라인

면접에서는 문서 화면에서 `색인 설명`을 눌러 청킹 방식과 검색 힌트를 보여준 뒤, 검색 화면에서 같은 힌트로 후보 청크가 올라오는지 확인하면 됩니다.

## 문서 변경 영향 분석

`GET /documents/{id}/impact`는 선택한 문서가 과거 답변의 출처로 쓰인 기록을 추적합니다. 문서가 변경된 뒤 오래된 답변이 남아 있으면 `staleAnswerCount`와 `affectedAnswers[].staleAfterDocumentUpdate`로 표시하고, 재실행 검증과 승인 이력 확인을 권고합니다. 면접 데모에서는 “RAG 지식이 바뀌었을 때 어떤 기존 답변을 다시 검토해야 하는가”를 설명하는 근거로 사용할 수 있습니다.

`GET /documents/revalidation-queue`는 특정 문서가 아니라 전체 지식 베이스의 변경 영향을 큐로 모읍니다. 각 항목은 `P0`~`P3` 우선순위, 위험도, 변경 문서, 오래된 답변, 출처 순위, replay/lineage/quality gate 링크를 포함합니다. `POST /documents/revalidation-runs`는 이 큐 항목을 실제로 실행해 종료 가능, 재검토 필요, 차단 필요 판정과 리포트 해시를 저장합니다. `GET /documents/revalidation-runs`는 저장된 실행 이력을 반환합니다. 면접 데모에서는 “문서가 바뀌었을 때 기존 운영 답변을 어떻게 회수하고 재검증하는가”를 설명하는 근거로 사용할 수 있습니다.

## 청킹 확인 위치

실제 청크 미리보기는 `GET /documents` 응답과 웹 콘솔 `문서` 화면에서 확인합니다. 검색 전 랭킹은 `POST /retrieval/preview`와 웹 콘솔 `검색` 화면에서 확인합니다. 이 응답은 후보별 랭킹 설명과 검색 실행 계획을 함께 반환해 매칭 검색어, 점수 기여도, 권한 통과 사유, 질문 정규화, 후보 생성, 권한 경계, 점수 결합, 리랭킹, 컨텍스트 패키징, 검토 판단 단계를 확인할 수 있습니다.

검색 파이프라인은 먼저 pgvector/lexical fusion으로 권한을 통과한 후보군을 만들고, 그 후보군에 `local_bm25_keytoken_v1` 리랭커를 적용합니다. 리랭커는 BM25 계열 점수, 오류 코드/지표/경로 같은 핵심 토큰 일치, 제목·경로 일치, 기존 검색 점수를 결합합니다. `GET /evaluations/retrieval`과 `pnpm retrieval-eval:smoke`는 리랭킹 전 기준선과 리랭킹 후 결과를 함께 비교합니다. 임베딩 모델 자체의 차이는 `GET /evaluations/embedding-comparison`과 `pnpm embedding-hard:smoke`에서 별도로 확인합니다.
