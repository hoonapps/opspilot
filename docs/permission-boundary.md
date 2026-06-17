# Permission Boundary

OpsPilot supports three document visibility levels:

- `public`: visible to all users
- `team`: visible to users whose `teamSlugs` include the document `teamSlug`
- `restricted`: visible only to `ops_admin` or `security_admin`

The retrieval SQL applies this filter before ranking chunks. This prevents restricted content from being included in prompts, citations, answer text, or logs for unauthorized actors.

`search_documents` also stores a permission audit summary with denied candidate counts. The audit is intentionally aggregated so unauthorized users can prove the boundary was enforced without seeing restricted titles or paths.

## Boundary Matrix

```bash
curl http://localhost:3000/permission-boundary/matrix
```

The matrix endpoint evaluates every indexed document against demo personas:

- anonymous user
- team on-call user for the first indexed team slug
- `ops_admin`
- `security_admin`

It uses the same `AuthzService.canAccessDocument` function as retrieval and trace reads. The response includes document visibility, team slug, allow/deny decisions, and short policy reasons. The web console renders the result in the Documents screen so reviewers can inspect the permission model before asking a RAG question.

## Regression Smoke

```bash
pnpm permission:smoke
```

This smoke test asks a production database question without privileged roles. It fails unless restricted candidates are counted as denied, no `restricted/` source is returned to the answer, and the matrix proves anonymous users are denied restricted documents while `ops_admin` and `security_admin` personas are allowed.

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
