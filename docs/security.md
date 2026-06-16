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

These actions create approval requests and tool call logs.

## Data Handling

Document visibility is stored on the document and enforced during retrieval. Restricted chunks should not be sent to the LLM layer for unauthorized users.
