# Security

## Local Demo vs Production

Local Docker disables Elasticsearch security and uses simple header-based actor context for demonstration. Production must replace this with real authentication, signed Slack identities, secret management, rate limits, and encrypted credentials.

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

`GET /answers/:id/trace` is an audit endpoint for the portfolio demo. It reconstructs the persisted answer with ranked source chunks, tool calls, approval requests, and feedback. Production should protect this endpoint with the same answer-level authorization used for the original actor or an operator audit role, because source previews can contain permitted operational content.

## Slack Security

When `SLACK_SIGNING_SECRET` is configured, OpsPilot verifies Slack request signatures with the raw request body and rejects stale requests older than five minutes. Local demos can leave the secret empty to replay fixture payloads without Slack credentials.

The current demo maps Slack users through environment defaults. Production should store Slack user ids on application users and derive team/role access from the database.
