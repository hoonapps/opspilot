# Document Indexing

OpsPilot supports two ingestion paths:

- Seed folder ingestion for local demos and repeatable evaluations
- Runtime Markdown upsert for proving that new documents become searchable

## Seed Folder

```bash
pnpm ingest
```

The seed command reads Markdown files from `seed/documents`, parses frontmatter, chunks content, stores embeddings in PostgreSQL `document_chunks`, and optionally writes lexical copies to Elasticsearch.

## Runtime Markdown Upsert

```bash
curl -X POST http://localhost:3000/documents/markdown \
  -H "content-type: application/json" \
  -d '{
    "path": "public/status-page-policy.md",
    "markdown": "---\ntitle: \"Status Page Incident Communication\"\nvisibility: public\n---\n# Status Page Incident Communication\n\nPublish the first status page notice within 15 minutes."
  }'
```

If the document path already exists, OpsPilot updates the document metadata, records a new document version when the content hash changed, replaces old chunks, and indexes fresh chunks.

## Smoke Test

```bash
pnpm indexing:smoke
```

The smoke test:

1. Ingests the seed wiki
2. Upserts a new `public/status-page-policy.md` Markdown document
3. Asks `장애 공지는 몇 분 안에 올려야 해?`
4. Fails unless the top source is the newly indexed document and the answer includes the 15 minute SLA

Run the same proof with hybrid retrieval:

```bash
docker compose --profile search up -d
ENABLE_ELASTICSEARCH=true RETRIEVAL_MODE=hybrid pnpm indexing:smoke
```

Elasticsearch results are treated as candidate chunk ids only. OpsPilot reloads those chunks through PostgreSQL with the same permission filter before using them as answer context.
