# 문서 색인

OpsPilot의 RAG 핵심은 Markdown 문서를 운영 지식 인덱스로 바꾸고, 새 문서가 실제 답변에 반영되는지 증명하는 것입니다.

## 입력 경로

- `pnpm ingest`: `seed/documents`의 기본 문서 색인
- `POST /documents/markdown`: 런타임 Markdown upsert
- `POST /documents/github/sync`: GitHub Markdown sync
- `POST /documents/indexing-jobs/markdown`: BullMQ 비동기 색인
- `GET /documents/indexing-jobs`: 큐 카운트, 최근 작업, 워커 상태 관제
- `GET /documents/index-quality`: 전체 색인 품질 게이트와 문서별 개선 권고 확인
- `GET /documents/{id}/impact`: 문서 변경이 과거 답변과 운영 판단에 미치는 영향 확인

## 처리 단계

1. frontmatter 파싱
2. 문서 visibility/teamSlug/title 정규화
3. secret redaction
4. prompt-injection scan
5. Markdown chunking
6. local/OpenAI embedding 생성
7. PostgreSQL + pgvector 저장
8. 선택적으로 Elasticsearch mirror 저장
9. 문서 버전과 diff 저장

## 검증

```bash
pnpm indexing:smoke
pnpm index-quality:smoke
pnpm document-impact:smoke
pnpm queue:smoke
pnpm github:smoke
```

`pnpm index-quality:smoke`는 새 Markdown 문서를 넣은 뒤 색인 품질 리포트가 해당 문서의 청크 생성, 버전 저장, 헤딩 커버리지, 보안 격리 체크를 통과시키는지 검증합니다.

`pnpm document-impact:smoke`는 특정 문서를 근거로 사용한 답변을 만든 뒤 문서를 변경하고, 영향 분석 리포트가 해당 답변을 stale 재검증 대상으로 표시하는지 검증합니다.

`pnpm queue:smoke`는 BullMQ 작업 생성, 워커 처리, 완료 작업 조회, 큐 관제 API의 완료 카운트와 최근 작업 목록까지 검증합니다.

웹 콘솔 `문서` 화면에서는 문서 목록, 청크 수, 마스킹 메타데이터, 프롬프트 주입 격리 상태, 색인 품질 리포트, 버전 변경 차이, 문서 변경 영향 분석, 청크 미리보기, 신규 문서 검색 검증 결과, BullMQ 큐 관제 패널을 볼 수 있습니다.

## 색인 품질 게이트

`GET /documents/index-quality`는 현재 저장된 문서와 청크를 기준으로 아래 게이트를 계산합니다.

- 문서 존재: 색인된 문서가 1개 이상인지 확인합니다.
- 청크 커버리지: 모든 문서에 검색 가능한 청크가 있는지 확인합니다.
- 버전 커버리지: 모든 문서에 redaction 이후 버전 이력이 있는지 확인합니다.
- 청크 크기: 평균 청크 길이가 검색 컨텍스트에 넣기 적절한 범위인지 확인합니다.
- 보안 격리: 프롬프트 주입 위험 문서가 있는지 표시합니다.

문서별 결과에는 최신 버전, 청크 수, 평균/최대/최소 청크 길이, 헤딩 커버리지, 마스킹 수, 프롬프트 주입 위험, 개선 권고가 포함됩니다. 이 화면은 “문서를 넣었는데 실제로 RAG가 쓸 수 있는 형태로 색인됐는가”를 면접 데모에서 바로 증명하기 위한 장치입니다.

## 문서 변경 영향 분석

`GET /documents/{id}/impact`는 선택한 문서가 과거 답변의 출처로 쓰인 기록을 추적합니다. 문서가 변경된 뒤 오래된 답변이 남아 있으면 `staleAnswerCount`와 `affectedAnswers[].staleAfterDocumentUpdate`로 표시하고, replay 재검증과 승인 이력 확인을 권고합니다. 면접 데모에서는 “RAG 지식이 바뀌었을 때 어떤 기존 답변을 다시 검토해야 하는가”를 설명하는 근거로 사용할 수 있습니다.

## 청킹 확인 위치

실제 chunk preview는 `GET /documents` 응답과 웹 콘솔 `문서` 화면에서 확인합니다. 검색 전 ranking은 `POST /retrieval/preview`와 웹 콘솔 `검색` 화면에서 확인합니다. 이 응답은 후보별 랭킹 설명과 검색 실행 계획을 함께 반환해 매칭 검색어, 점수 기여도, 권한 통과 사유, 질문 정규화, 후보 생성, 권한 경계, 점수 결합, 컨텍스트 패키징, 리뷰 판단 단계를 확인할 수 있습니다.
