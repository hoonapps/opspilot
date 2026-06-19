# OpsPilot 포트폴리오 100점 로컬 증명

생성 시각: 2026-06-19T08:48:40.598Z

점수: 100/100
상태: 통과
공개 배포 URL 필요 여부: 아니오

## 요약

- 통과 항목: 10/10
- 정리한 스모크 승인 요청: 13
- 제품 검증 점수: 100%
- 릴리즈 게이트: pass
- 대기 승인: 12
- CI 100점 게이트 포함: 예
- README 스크린샷: 10개

## 채점표

| 항목 | 결과 | 증거 | 검증 명령 |
| --- | --- | --- | --- |
| 배포 URL 없는 로컬 재현성 | 통과 | README와 docs/local-proof.md가 공개 URL 없이 product:proof로 재현하는 경로를 설명합니다. | `pnpm product:proof` |
| CI에서 같은 증명 경로 검증 | 통과 | GitHub Actions가 portfolio:100과 Web smoke를 실행하도록 구성돼 있습니다. | `.github/workflows/ci.yml` |
| 새 문서 수집, 청킹, 검색 연결 | 통과 | public/uploads/portfolio-100-local-proof.md를 등록했고 청크 1개가 생성됐으며 질문의 1순위 출처로 반환됐습니다. | `pnpm source-ingestion:smoke` |
| RAG 답변 근거성과 문서 일치율 | 통과 | E102 답변 문서 일치율 90%, 출처 public/payment-error-codes.md, public/agentic-payment-runbook.md, public/agreement-smoke-policy.md, public/uploads/portfolio-100-local-proof.md, team/settlement-runbook.md. | `pnpm agreement:smoke` |
| 에이전트 도구 선택 | 통과 | 런북 질문 도구 호출: search_documents:allowed, create_runbook_checklist:allowed. | `pnpm agentic-tool-use:smoke` |
| 민감 작업 사람 승인 경계 | 통과 | 민감 작업은 sensitive_action 사유로 검토 처리됐고 승인 요청은 검증 후 반려됐습니다. | `pnpm permission:smoke && pnpm review:smoke` |
| 답변 trace와 감사 원장 | 통과 | trace 출처 5개, 도구 2개, 감사 루트 b0647e8b048b... | `pnpm trace:smoke && pnpm audit-ledger:smoke` |
| 평가 게이트와 문서 커버리지 | 통과 | sourceHitRate 100%, topSourceAccuracy 100%, citationAccuracy 100%. | `pnpm eval` |
| 운영성, SLO, 릴리즈 게이트 | 통과 | readiness 1, release pass, SLO ok, pending approvals 12. | `pnpm product-readiness:smoke && pnpm release-gate:smoke` |
| 포트폴리오 산출물 | 통과 | 스크린샷 10개, 색인 품질 점수 100%, 색인 스냅샷 d89cdfc4a041... | `pnpm product:report && pnpm web:smoke` |

## 실행

```bash
pnpm install
cp .env.example apps/api/.env
pnpm portfolio:100
```

`pnpm product:proof`는 이 100점 게이트를 포함한 로컬 전체 증명 경로입니다.
