# Permission Boundary

OpsPilot supports three document visibility levels:

- `public`: visible to all users
- `team`: visible to users whose `teamSlugs` include the document `teamSlug`
- `restricted`: visible only to `ops_admin` or `security_admin`

The retrieval SQL applies this filter before ranking chunks. This prevents restricted content from being included in prompts, citations, answer text, or logs for unauthorized actors.

`search_documents` also stores a permission audit summary with denied candidate counts. The audit is intentionally aggregated so unauthorized users can prove the boundary was enforced without seeing restricted titles or paths.

## Regression Smoke

```bash
pnpm permission:smoke
```

This smoke test asks a production database question without privileged roles. It fails unless restricted candidates are counted as denied and no `restricted/` source is returned to the answer.

## Local Header Demo

No team access:

```bash
curl -X POST http://localhost:3000/ask \
  -H "content-type: application/json" \
  -d '{"question":"정산 배치가 30분 이상 지연되면 어떻게 해?"}'
```

Payments team access:

```bash
curl -X POST http://localhost:3000/ask \
  -H "content-type: application/json" \
  -H "x-team-slugs: payments" \
  -d '{"question":"정산 배치가 30분 이상 지연되면 어떻게 해?"}'
```

Restricted access:

```bash
curl -X POST http://localhost:3000/ask \
  -H "content-type: application/json" \
  -H "x-user-roles: ops_admin" \
  -d '{"question":"운영 DB에서 user status를 직접 update 해도 돼?"}'
```
