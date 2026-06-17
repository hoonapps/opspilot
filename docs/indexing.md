# Document Indexing

OpsPilot supports four ingestion paths:

- Seed folder ingestion for local demos and repeatable evaluations
- Runtime Markdown upsert for proving that new documents become searchable
- GitHub Markdown sync for importing repository docs into the same RAG index
- BullMQ queued Markdown indexing for production-style async ingestion

## Seed Folder

```bash
pnpm ingest
```

The seed command reads Markdown files from `seed/documents`, parses frontmatter, redacts common secret patterns, chunks content, stores embeddings in PostgreSQL `document_chunks`, and optionally writes lexical copies to Elasticsearch.

## Runtime Markdown Upsert

```bash
curl -X POST http://localhost:3000/documents/markdown \
  -H "content-type: application/json" \
  -d '{
    "path": "public/status-page-policy.md",
    "markdown": "---\ntitle: \"Status Page Incident Communication\"\nvisibility: public\n---\n# Status Page Incident Communication\n\nPublish the first status page notice within 15 minutes."
  }'
```

If the document path already exists, OpsPilot updates the document metadata, records a new document version when the redacted content hash changed, replaces old chunks, and indexes fresh chunks. Raw secret values are not stored in document versions, chunk content, embeddings, or Elasticsearch mirrors.

## Version History

```bash
curl http://localhost:3000/documents/{documentId}/versions
```

Each changed Markdown upsert records a new redacted document version. The version endpoint returns the latest document metadata, version list, content hashes, redacted previews, and a `line_set_diff_v1` summary against the previous version. The diff includes added, removed, and unchanged line counts plus short added/removed previews.

This is intentionally separate from retrieval: reviewers can first inspect what changed in the knowledge base, then prove that retrieval and answers reflect the updated document.

## Index Inventory

```bash
curl http://localhost:3000/documents
```

The inventory endpoint returns indexed documents with visibility, team boundary, content hash, latest version, chunk count, redaction summary, and the first chunk previews. This is the fastest way to prove that a newly uploaded Markdown document was parsed, redacted, chunked, embedded, and stored before asking a RAG question.

The Documents screen in the Next.js console calls the same endpoint after Markdown upsert and GitHub sync. The demo screenshot intentionally shows this inventory next to the chunk inspector so reviewers can see the generated chunks instead of trusting a hidden ingestion job.

After a Markdown upsert, the console also runs an indexed-document proof:

1. refresh document inventory
2. load version history and latest diff for the indexed document
3. call retrieval preview for the verification query
4. call `/ask` with the same query
5. display chunk count, top source path, retrieval score, answer agreement, and confidence

This makes the portfolio demo explicit: a reviewer can see that a newly added or changed Markdown file was versioned, parsed, chunked, embedded, retrieved, and used as grounded answer evidence.

## Queued Markdown Indexing

```bash
curl -X POST http://localhost:3000/documents/indexing-jobs/markdown \
  -H "content-type: application/json" \
  -d '{
    "path": "public/queue-indexing-proof.md",
    "markdown": "---\ntitle: \"Queued Indexing Proof\"\nvisibility: public\n---\n# Queued Indexing Proof\n\nQIDX-77 proves that a BullMQ indexing worker completed the queued Markdown job."
  }'
```

Check job state:

```bash
curl http://localhost:3000/documents/indexing-jobs/{jobId}
```

Run the long-lived worker:

```bash
pnpm worker:indexing
```

The queued path stores jobs in Redis through BullMQ. The worker processes `index-markdown` jobs and calls the same `DocumentsService.ingestMarkdown` path used by synchronous ingestion, so redaction, chunking, embeddings, pgvector writes, and optional Elasticsearch mirroring stay consistent.

## GitHub Markdown Sync

```bash
curl -X POST http://localhost:3000/documents/github/sync \
  -H "content-type: application/json" \
  -d '{
    "owner": "hoonapps",
    "repo": "opspilot",
    "branch": "main",
    "rootPath": "docs",
    "sourcePrefix": "github/hoonapps/opspilot"
  }'
```

The sync endpoint reads a repository tree, downloads Markdown files under `rootPath`, and ingests each file as a normal OpsPilot document. Synced paths are stored under `sourcePrefix`, for example `github/hoonapps/opspilot/system-design.md`.

Set `GITHUB_TOKEN` for higher GitHub API limits or private repository access.

The Next.js web console includes the same GitHub sync controls so a demo can show repository docs being indexed without using curl.

## Smoke Test

```bash
pnpm indexing:smoke
```

The smoke test:

1. Ingests the seed wiki
2. Upserts and then updates a `public/status-page-policy.md` Markdown document
3. Verifies that version history and latest diff exist for that document
4. Asks a status-page SLA question using terms that are unique to the newly indexed document
5. Fails unless the top source is the newly indexed document and the answer includes the 15 minute SLA

Run the same proof with hybrid retrieval:

```bash
docker compose --profile search up -d
ENABLE_ELASTICSEARCH=true RETRIEVAL_MODE=hybrid pnpm indexing:smoke
```

Elasticsearch results are treated as candidate chunk ids only. OpsPilot reloads those chunks through PostgreSQL with the same permission filter before using them as answer context.

## Queue Indexing Smoke Test

```bash
pnpm queue:smoke
```

The queue smoke test starts the BullMQ worker in-process, enqueues a Markdown indexing job, waits for Redis job completion, asks about `QIDX-77`, and fails unless the queued document is the top RAG source.

## GitHub Sync Smoke Test

```bash
pnpm github:smoke
```

The GitHub sync smoke test uses `seed/github-docs` as an offline fixture, syncs it through the same ingestion path, asks about `OPS-GH-42`, and fails unless the synced GitHub document is the top source.
