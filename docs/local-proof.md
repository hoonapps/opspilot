# 로컬 제품 증명

OpsPilot은 공개 배포 URL 없이도 제품 완성도를 확인할 수 있도록 로컬 증명 경로를 제공합니다. 이 문서는 평가자가 코드를 받은 뒤 어떤 순서로 실행하고 무엇을 봐야 하는지에만 집중합니다.

## 3분 확인

```bash
pnpm install
cp .env.example apps/api/.env
pnpm product:proof
```

`pnpm product:proof`는 PostgreSQL/Redis를 올리고, 마이그레이션, 타입체크, 문서 수집, agentic tool-use, 권한 경계, 답변 trace, 문서 일치율, 신뢰 게이트, 제품 상태 리포트를 한 번에 검증합니다.

최종 점수만 빠르게 확인하려면 다음 명령을 실행합니다.

```bash
pnpm portfolio:100
```

이 명령은 공개 배포 URL을 요구하지 않습니다. 대신 새 문서 수집, RAG 답변, tool-use, 권한 경계, trace, 평가 게이트, 운영성, CI 구성, README 스크린샷 산출물을 검사하고 모든 항목이 통과할 때만 `docs/portfolio-100.md`에 `100/100` 리포트를 생성합니다.

## 10분 제품 확인

```bash
pnpm dev:api
pnpm dev:web
```

웹 콘솔은 `http://localhost:3001`에서 확인합니다. 평가 순서는 아래처럼 잡으면 됩니다.

1. `문서` 화면에서 URL, txt, PDF, Word 중 하나를 등록합니다.
2. 색인 상태, 추출 파서, 청크 수, content hash, URL 보안 가드를 확인합니다.
3. `검색` 화면에서 문서 내용으로 질문하고 답변 출처와 문서 일치율을 확인합니다.
4. 운영 DB 수정처럼 민감한 질문을 넣고 `request_human_approval` trace와 승인 필요 사유를 확인합니다.
5. `상태` 화면에서 RAG 근거성, 권한 경계, 도구 감사, 운영성, 제품 검증 상태를 확인합니다.

## 증명 항목

| 항목 | 증명 방법 | 통과 기준 |
| --- | --- | --- |
| 다양한 문서 수집 | `pnpm source-ingestion:smoke` | txt, URL, PDF, Word가 모두 1순위 출처로 검색됨 |
| RAG 근거성 | `pnpm agreement:smoke` | 답변과 출처의 문서 일치율이 저장됨 |
| 모델 주도 도구 호출 | `pnpm agentic-tool-use:smoke` | `search_documents`, `create_runbook_checklist`, `request_human_approval`이 Anthropic tool-use 루프로 실행됨 |
| 권한 경계 | `pnpm permission:smoke` | 접근 불가 문서가 검색 전후 답변 컨텍스트에서 제외됨 |
| 답변 trace | `pnpm trace:smoke` | 출처, 도구 호출, 승인, 피드백이 답변 단위로 복원됨 |
| 신뢰 게이트 | `pnpm quality-gate:smoke` | 공유 가능, 검토 필요, 차단 판정이 근거와 함께 계산됨 |
| 제품 상태 | `pnpm product-readiness:smoke` | RAG, 권한, 도구 감사, 운영성, 검증 산출물이 집계됨 |
| 최종 100점 게이트 | `pnpm portfolio:100` | 10개 포트폴리오 기준이 모두 통과하고 `docs/portfolio-100.md`가 100/100으로 생성됨 |

## 공개 URL을 대체하는 근거

공개 URL 대신 아래 근거를 남깁니다.

- GitHub Actions 전체 CI 성공 배지
- `pnpm product:proof` 로컬 실행 결과
- `pnpm portfolio:100` 최종 100점 리포트
- `docs/demo-report.md` 제품 검증 리포트
- `docs/portfolio-100.md` 공개 URL 없는 채점표
- `docs/assets/*.png` 실제 Playwright 스모크로 생성한 화면
- `docs/ci.md`의 검증 범위

이 조합은 “접속 가능한 데모 사이트” 대신 “누구나 같은 로컬 환경에서 제품 동작을 재현하고 검증할 수 있음”을 보여주기 위한 구성입니다.
