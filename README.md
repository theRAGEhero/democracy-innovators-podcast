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

## Repository Safety

Never commit `.env`, databases, backups, uploads, embeddings, logs, credentials, private exports, or server deployment copies. See [SECURITY.md](SECURITY.md) for reporting and handling rules.
