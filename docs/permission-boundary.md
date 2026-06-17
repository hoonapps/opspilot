# 권한 경계

OpsPilot은 문서 visibility를 기준으로 검색 전 권한 필터를 적용합니다.

## Visibility

- `public`: 모든 사용자 접근 가능
- `team`: 사용자 `teamSlugs`에 문서 `teamSlug`가 있어야 접근 가능
- `restricted`: `ops_admin` 또는 `security_admin` 필요

권한 없는 chunk는 prompt context, answer, source, trace preview에 들어가지 않습니다.

## Matrix API

```bash
curl http://localhost:3000/permission-boundary/matrix
```

이 API는 현재 색인 문서를 anonymous, team on-call, ops admin, security admin persona로 평가합니다. 웹 콘솔 `문서` 화면은 이 결과를 matrix로 보여줍니다.

## Smoke

```bash
pnpm permission:smoke
```

이 테스트는 권한 없는 사용자에게 restricted source가 반환되지 않는지, denied candidate count가 남는지, privileged persona는 접근 가능한지 검증합니다.
