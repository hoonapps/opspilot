# Deployment

OpsPilot includes a Docker production demo profile so the portfolio can be run without local Node or pnpm.

## Local Production Demo

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

This starts:

- PostgreSQL with pgvector
- Redis
- NestJS API on `http://localhost:3000`
- Next.js web console on `http://localhost:3001`
- BullMQ indexing worker

The API container runs migrations and seed ingestion before starting. Ingestion is idempotent, so restarting the stack keeps the demo usable.

## Hosted Environment Shape

For a hosted demo, keep these process boundaries:

- API container: HTTP API, Slack Events, RAG orchestration
- Web container: Next.js console
- Worker container: BullMQ indexing jobs
- PostgreSQL: managed Postgres with pgvector enabled
- Redis: managed Redis
- Optional Elasticsearch: only for hybrid BM25 recall

Required production environment variables:

```txt
DATABASE_HOST
DATABASE_PORT
DATABASE_NAME
DATABASE_USER
DATABASE_PASSWORD
REDIS_URL
NEXT_PUBLIC_API_BASE_URL
OPSPILOT_ACTOR_TOKEN_SECRET
```

Optional provider variables:

```txt
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_CHAT_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=64
```

or:

```txt
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_CHAT_MODEL=claude-3-5-haiku-latest
```

## CI Proof

GitHub Actions builds the Docker image target after typecheck and package build, then runs tests, RAG evaluation, authentication smoke tests, answer agreement smoke tests, permission boundary smoke tests, and browser smoke tests. This proves the checked-in deployment artifact can build from a clean environment and that the runtime behavior still passes the portfolio gates.
