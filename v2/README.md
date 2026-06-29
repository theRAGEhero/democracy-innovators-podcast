# Democracy Innovators Application

This directory contains the active Next.js and Payload CMS application. See the [repository README](../README.md) for setup, deployment, content synchronization and security instructions.

## Useful commands

```bash
npm run dev
npm run lint
npx tsc --noEmit
npm run build
npm run sync:ghost
./scripts/backup.sh
```

Runtime data is stored under `runtime/`. Environment configuration belongs in `.env`. Both are intentionally excluded from Git and Docker build context.
