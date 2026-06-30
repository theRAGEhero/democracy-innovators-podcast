# Democracy Innovators Podcast

The active application is in [`v2/`](v2/): a single-VPS podcast publication with an editorial frontend, Payload CMS, SQLite, guest profiles, transcript search and a cited Gemini archive assistant.

The root Express application is the retired v1 implementation and is retained only as migration/reference material.

## Stack

- Next.js 16, React 19 and TypeScript
- Payload CMS 3 with REST and GraphQL APIs
- SQLite/libSQL persistent database
- Gemini archive assistant grounded in imported transcripts
- Docker Compose behind an existing Nginx/Certbot reverse proxy

## Local development

```bash
cd v2
cp .env.example .env
npm ci --legacy-peer-deps
npm run dev
```

Set real values only in `v2/.env`. That file is ignored by Git and Docker build context. At minimum configure `PAYLOAD_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_SERVER_URL`, and `GEMINI_API_KEY` if the chatbot is required.

## Validation

```bash
npm run security:check       # from repository root
cd v2
npm run lint
npx tsc --noEmit
```

GitHub Actions runs the same secret, lint and TypeScript checks for pushes and pull requests.

## Docker deployment

```bash
cd v2
docker compose build app
docker compose up -d app
```

The container binds only to `127.0.0.1:8098`; Nginx is expected to terminate HTTPS and proxy the public domain. Persistent state lives under `v2/runtime/` and must be backed up separately, never committed.

## Content synchronization

Fetch new public Ghost episodes, covers and guest records with:

```bash
cd v2
DATABASE_URL=file:./runtime/database/payload.db npm run sync:ghost
DATABASE_URL=file:./runtime/database/payload.db npm run embeddings:build
DATABASE_URL=file:./runtime/database/payload.db npm run map:import -- /path/to/democracy_innovators_geo_time_dataset_place_researched.xlsx
```

Take a backup first with `v2/scripts/backup.sh`. Avoid running multiple SQLite writers during synchronization.

## Repository safety

Never commit:

- `.env` files or credentials
- SQLite databases and backups
- uploaded media or admin credentials
- logs, comments, embeddings or raw Ghost exports
- ZIP or server deployment copies

See [`SECURITY.md`](SECURITY.md) for reporting and credential-handling rules.
