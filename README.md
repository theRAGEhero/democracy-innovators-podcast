# Democracy Innovators Podcast

The repository contains one application: the Democracy Innovators publishing and knowledge platform.

## Stack

- Next.js 16, React 19 and TypeScript
- Payload CMS 3 with REST and GraphQL APIs
- SQLite/libSQL persistent storage
- A cited Gemini archive assistant grounded in imported transcripts
- Docker Compose behind the existing Nginx and Certbot reverse proxy

## Structure

```text
public/       Static assets; public/media links to runtime/uploads
scripts/      Backups, content synchronization and maintenance commands
src/          Next.js, Payload collections, components and shared application code
tests/        Integration and browser tests
runtime/      Ignored production database, uploads, embeddings and backups
```

Runtime data and credentials are never committed.

## Local Development

```bash
cp .env.example .env
npm ci --legacy-peer-deps
npm run dev
```

Configure `PAYLOAD_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_SERVER_URL`, and the optional integration keys in `.env`.

### Archive assistant provider

The answer can come from Google Gemini (default) or from Ollama Cloud, chosen with
`CHATBOT_PROVIDER=gemini|ollama`. Switching provider needs no code change and no
redeploy of the image — only the variable and a restart.

`GEMINI_API_KEY` stays required either way: retrieval embeddings are Gemini, and
the indexed chunks are stored under `embeddingModel: gemini-embedding-2`, so the
question has to be embedded with the same model the archive was built with.

For Ollama set `OLLAMA_API_KEY` (created at `ollama.com/settings/keys`) and
`OLLAMA_MODEL` to an id from the live cloud catalogue.

Use the **plain** model id. The default is `gemma4`, chosen because it is the
one cloud model measured that does no chain-of-thought: the whole token budget
goes to the answer rather than to reasoning the visitor never sees, which is the
same intent as the `thinkingBudget: 0` used for Gemini. Reasoning models work
too — `gpt-oss:120b` answers well — but they spend part of the 900-token budget
thinking and can truncate the answer. Avoid `nemotron-3-super`: it did not
respond within 90 seconds. The `-cloud` suffix that appears
in Ollama's own docs is only for a local daemon proxying to the cloud; calling
`ollama.com` directly, the endpoint already serves cloud models and a suffixed id
is rejected. A wrong id shows up as a 404 from the provider, which the assistant
reports as a generic 502.

`OLLAMA_BASE_URL` defaults to `https://ollama.com/v1` and can point at a
self-hosted instance — both speak the same OpenAI-compatible API.

## Validation

```bash
npm run security:check
npm run lint
npx tsc --noEmit
npm run test:int
npm run build
```

## Deployment

```bash
./scripts/backup.sh
docker-compose build app
docker-compose up -d --force-recreate app
```

The container binds to `127.0.0.1:8098`. Nginx terminates HTTPS for `stream.democracyinnovators.com` and proxies to that port.

## Content Maintenance

```bash
DATABASE_URL=file:./runtime/database/payload.db npm run sync:ghost
DATABASE_URL=file:./runtime/database/payload.db npm run embeddings:build
DATABASE_URL=file:./runtime/database/payload.db npm run map:import -- /path/to/dataset.xlsx
npm run episodes:summarize -- --apply
```

Take a backup before any command that writes to SQLite and avoid concurrent writers.

## API

Payload exposes a REST API at `/api/<collection>` and GraphQL at `/api/graphql`. All
examples below use the production base URL `https://stream.democracyinnovators.com`.

### Authentication

Write operations (create / update / upload / publish) require an authenticated user.
Two options:

**A. API key (recommended for automation).** Enable an API key on a user and send it as a
header:

```bash
npm run apikey:create -- admin@democracyinnovators.com   # prints the key once
```

```
Authorization: users API-Key <API_KEY>
```

**B. Email + password → JWT.**

```bash
curl -X POST https://stream.democracyinnovators.com/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}'
# → { "token": "..." }  then send:  Authorization: JWT <token>
```

### Posts

`Post` fields: `title`, `slug`, `heroImage` (Media id — the cover), `content` (Lexical
rich-text JSON), `meta.title` / `meta.description` / `meta.image` (Media id, SEO),
`publishedAt`, `authors`, `categories`, `_status` (`draft` | `published`). Drafts and
autosave are enabled.

**Create a draft**

```bash
curl -X POST 'https://stream.democracyinnovators.com/api/posts?draft=true' \
  -H 'Authorization: users API-Key <API_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "My draft article",
    "slug": "my-draft-article",
    "_status": "draft"
  }'
```

**Update a post**

```bash
curl -X PATCH 'https://stream.democracyinnovators.com/api/posts/<POST_ID>' \
  -H 'Authorization: users API-Key <API_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{ "title": "Updated title" }'
```

**Publish now**

```bash
curl -X PATCH 'https://stream.democracyinnovators.com/api/posts/<POST_ID>' \
  -H 'Authorization: users API-Key <API_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{ "_status": "published", "publishedAt": "2026-07-20T10:00:00.000Z" }'
```

> `content` is Lexical rich-text (a JSON tree), not HTML. Build it with the Payload
> Lexical helpers or copy the structure from an existing post via `GET /api/posts/<id>`.

### Upload a cover image (Media)

Upload the file first, then reference the returned `id` in `heroImage` (and/or `meta.image`).

```bash
curl -X POST 'https://stream.democracyinnovators.com/api/media' \
  -H 'Authorization: users API-Key <API_KEY>' \
  -F 'file=@cover.jpg' \
  -F 'alt=Cover description'
# → { "doc": { "id": <MEDIA_ID>, ... } }

curl -X PATCH 'https://stream.democracyinnovators.com/api/posts/<POST_ID>' \
  -H 'Authorization: users API-Key <API_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{ "heroImage": <MEDIA_ID> }'
```

### Scheduled publishing

Scheduling is enabled on Posts (`schedulePublish`). You can set a future publish from the
admin UI, or create a scheduled job via the API. **However, scheduled publishes only fire
when the jobs runner executes** — this self-hosted setup has no runner yet, so a scheduled
post stays queued. To enable it:

1. Set `CRON_SECRET` in `.env`.
2. Add a cron (system or container) that periodically runs the queue:

```bash
*/5 * * * * curl -s -X POST https://stream.democracyinnovators.com/api/payload-jobs/run \
  -H "Authorization: Bearer $CRON_SECRET" >/dev/null
```

Until then, publish immediately with `_status: "published"` (above).

### GraphQL

`POST /api/graphql` with the same `Authorization` header. In development a playground is
available at `/api/graphql-playground`.

> Episodes work the same way as Posts (`/api/episodes`, drafts enabled) if you automate the
> podcast archive rather than the blog.

## Repository Safety

Never commit `.env`, databases, backups, uploads, embeddings, logs, credentials, private exports, or server deployment copies. See [SECURITY.md](SECURITY.md) for reporting and handling rules.
