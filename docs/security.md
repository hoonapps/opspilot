# Security

## Local Demo vs Production

Local Docker disables Elasticsearch security and, by default, accepts simple header-based actor context for fast demos. When `OPSPILOT_ACTOR_TOKEN_SECRET` is configured, OpsPilot requires a signed actor token on protected API routes and derives `actorId`, `email`, `roles`, and `teamSlugs` from that verified token instead of trusting caller-supplied role headers.

The signed actor token is an HMAC-SHA256 JWT-shaped token carried in `x-opspilot-actor-token`. It is intentionally small and dependency-free for the portfolio demo: missing, tampered, and expired tokens are rejected before `/ask` can build a retrieval context. `/health`, Swagger docs, and Slack Events remain public entry points because Slack has its own request signature check. Production should still add a full identity provider, rate limits, secret rotation, encrypted credentials, and audit-role policy.

## Authentication Smoke

```bash
pnpm authn:smoke
```

This smoke test enables `OPSPILOT_ACTOR_TOKEN_SECRET`, starts the API through Nest, and verifies four cases:

- `/health` remains public.
- `/ask` without a token returns 401.
- `/ask` with a tampered or expired token returns 401.
- `/ask` with a valid `ops_admin` token can retrieve the restricted production database policy and route the answer to human approval.

## Sensitive Operations

The agent must not execute sensitive operations directly. Examples:

- production database writes
- forced refunds
- permission grants
- destructive cache or queue operations
- settlement result changes

These actions create approval requests and tool call logs. Human reviewers resolve them through `PATCH /approvals/:id`; the agent never runs the sensitive operation by itself.

`/ask` also returns structured `reviewReasons`. A sensitive request includes `sensitive_action`, low retrieval confidence includes `low_confidence`, and missing permitted evidence includes `no_sources`. This makes the human approval decision auditable in the API response, answer metadata, Slack reply, and web console.

## Data Handling

Document visibility is stored on the document and enforced during retrieval. Restricted chunks should not be sent to the LLM layer for unauthorized users.

## Search Security

Elasticsearch is used only as a recall booster. In hybrid mode, Elasticsearch returns chunk ids, and OpsPilot reloads those chunks from PostgreSQL with the actor's permission filter before answer generation. PostgreSQL remains the authorization boundary.

The `search_documents` tool log stores an aggregated permission audit with the candidate window, allowed count, denied count, denied visibility buckets, actor roles, and actor teams. It does not store denied document titles or paths, so the demo can prove access control behavior without leaking restricted knowledge.

## Answer Trace

`GET /answers/:id/trace` is an audit endpoint for the portfolio demo. It reconstructs the persisted answer with ranked source chunks, tool calls, approval requests, and feedback. The endpoint re-checks every traced source against the caller's roles and teams before returning the artifact, because source previews can contain permitted operational content. A production deployment should additionally require real user authentication and either original-answer access or an operator audit role.

## Slack Security

When `SLACK_SIGNING_SECRET` is configured, OpsPilot verifies Slack request signatures with the raw request body and rejects stale requests older than five minutes. Local demos can leave the secret empty to replay fixture payloads without Slack credentials.

The current demo maps Slack users through environment defaults. Production should store Slack user ids on application users and derive team/role access from the database.
