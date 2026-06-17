# 권한 경계

OpsPilot은 문서 가시성을 기준으로 검색 전 권한 필터를 적용합니다.

## 가시성

- `public`: 모든 사용자 접근 가능
- `team`: 사용자 `teamSlugs`에 문서 `teamSlug`가 있어야 접근 가능
- `restricted`: `ops_admin` 또는 `security_admin` 필요

권한 없는 청크는 프롬프트 컨텍스트, 답변, 출처, 추적 미리보기에 들어가지 않습니다.

## 매트릭스 API

```bash
curl http://localhost:3000/permission-boundary/matrix
```

이 API는 현재 색인 문서를 익명 사용자, 팀 온콜, 운영 관리자, 보안 관리자 페르소나로 평가합니다. 웹 콘솔 `문서` 화면은 이 결과를 매트릭스로 보여줍니다.

## 검증

```bash
pnpm permission:smoke
```

이 테스트는 권한 없는 사용자에게 제한 출처가 반환되지 않는지, 차단 후보 수가 남는지, 권한 있는 페르소나는 접근 가능한지 검증합니다.
