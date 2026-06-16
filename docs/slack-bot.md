# Slack Bot

OpsPilot supports Slack Events API `app_mention` events.

## Local Simulation

Run without Slack credentials:

```bash
pnpm slack:simulate
```

The simulator:

1. ingests seed Markdown documents
2. loads `seed/slack/app-mention.json`
3. converts the mention text into a question
4. runs the same Agent workflow as `/ask`
5. prints the Slack thread reply payload

## Endpoint

```txt
POST /slack/events
```

Supported payloads:

- `url_verification`
- `event_callback` with `event.type=app_mention`

## Production Settings

```bash
SLACK_SIGNING_SECRET=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_BOT_USER_ID=U...
SLACK_POST_REPLIES=true
```

When `SLACK_SIGNING_SECRET` is configured, OpsPilot verifies `x-slack-signature` against the raw request body and rejects requests older than five minutes.

## Permission Mapping

For the portfolio demo, Slack users are mapped through:

```bash
SLACK_DEFAULT_TEAM_SLUGS=payments
SLACK_DEFAULT_ROLES=
```

Production should map Slack user ids to application users, teams, and roles in PostgreSQL.
