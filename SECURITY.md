# Security

## Reporting

Report security issues privately to `ale@9minuti.it`. Do not open a public issue for credentials, personal data, authentication bypasses, or unpublished content.

## Repository rules

- Never commit `.env` files, Payload databases, backups, uploads, logs, Ghost exports, admin credentials, or private keys.
- Run `npm run security:check` from the repository root before every push.
- Store production secrets only in server-side environment files or a secret manager.
- Rotate a credential immediately if it appears in Git history, CI output, logs, screenshots, or issue text.
- The Ghost Content API key used for public read-only content is not an administrative credential.

The automated scanner is a guardrail, not proof that a commit contains no sensitive information. Review staged changes before pushing.
