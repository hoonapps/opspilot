# 관측성

OpsPilot은 RAG 에이전트를 운영 시스템처럼 다루기 위해 답변, 도구 호출, 승인, 피드백, 평가 상태를 지표로 집계합니다.

## API

- `GET /observability/summary`: 질문 수, 답변 수, 평균 신뢰도, 문서 일치율, 도구 호출, 승인, 피드백, 색인 문서 규모, API 요청 요약
- `GET /observability/api-requests`: 최근 24시간 HTTP 요청 수, 성공률, 오류율, p50/p95 지연, 엔드포인트별 집계, 최근 요청
- `GET /observability/slo`: 근거성, 검토 부하, 도구 감사 커버리지, 최신 평가 게이트를 SLO 가드레일로 변환
- `GET /observability/release-gate`: 준비 상태, 색인된 지식, 평가 최신성, SLO, 감사 추적, 승인 대기열, 피드백 신호를 종합
- `GET /observability/action-plan`: release gate와 SLO의 warn/fail 항목을 owner, P0/P1/P2, 조치, 검증 명령으로 변환

## 검증

```bash
pnpm observability:smoke
pnpm observability:slo-smoke
pnpm action-plan:smoke
pnpm release-gate:smoke
```

웹 콘솔 `품질` 화면에서 운영 지표, 배포 게이트, 운영 액션 플랜을 확인할 수 있습니다.

API 요청 로그는 요청 본문을 저장하지 않습니다. 메서드, 경로, 라우트 템플릿, 상태 코드, 처리 시간, 호출자 해시, 역할/팀 경계, 사용자 에이전트, 오류 이름만 남겨 운영 진단에 필요한 최소 정보만 유지합니다.
