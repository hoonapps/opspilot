# 문서 색인

OpsPilot의 RAG 핵심은 Markdown 문서를 운영 지식 인덱스로 바꾸고, 새 문서가 실제 답변에 반영되는지 증명하는 것입니다.

## 입력 경로

- `pnpm ingest`: `seed/documents`의 기본 문서 색인
- `POST /documents/markdown`: 런타임 Markdown upsert
- `POST /documents/github/sync`: GitHub Markdown sync
- `POST /documents/indexing-jobs/markdown`: BullMQ 비동기 색인
- `GET /documents/indexing-jobs`: 큐 카운트, 최근 작업, 워커 상태 관제

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
pnpm queue:smoke
pnpm github:smoke
```

`pnpm queue:smoke`는 BullMQ 작업 생성, 워커 처리, 완료 작업 조회, 큐 관제 API의 완료 카운트와 최근 작업 목록까지 검증합니다.

웹 콘솔 `문서` 화면에서는 문서 목록, 청크 수, 마스킹 메타데이터, 프롬프트 주입 격리 상태, 버전 변경 차이, 청크 미리보기, 신규 문서 검색 검증 결과, BullMQ 큐 관제 패널을 볼 수 있습니다.

## 청킹 확인 위치

실제 chunk preview는 `GET /documents` 응답과 웹 콘솔 `문서` 화면에서 확인합니다. 검색 전 ranking은 `POST /retrieval/preview`와 웹 콘솔 `검색` 화면에서 확인합니다. 이 응답은 검색 실행 계획도 함께 반환해 질문 정규화, 후보 생성, 권한 경계, 점수 결합, 컨텍스트 패키징, 리뷰 판단 단계를 확인할 수 있습니다.
