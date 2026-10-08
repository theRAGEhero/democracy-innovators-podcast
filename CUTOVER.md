# Moving the apex to this site

What is already done, and what is left. Everything below the line is deliberately
**not** applied: each item depends on `old.democracyinnovators.com` existing, or
on the apex already pointing here. Applying them early breaks the live site.

## Done

- Guest portraits rehosted locally — nothing on the site loads from the blog any more.
- Ghost-era redirects: `/rss`, `/tag/*`, `/author/*`, `/page/:n`, the four
  `sitemap-*.xml` children, `/sitemap.xsl`, `/ghost*`.
- Backups verified, weekly, with a second copy in Nextcloud.
- `/developers` page, reachable from the footer and listed in the sitemap. Its
  connect command is derived from the server URL, so it corrects itself.
- The empty `/posts` template routes are gone; drafts no longer reach the
  public search endpoint.

## Order of operations

**1. Stand up `old.democracyinnovators.com` first.** DNS, certificate, vhost,
pointing at the existing Ghost. Change Ghost's own `url` setting to match, and
confirm a signup works there — *before* the apex moves. A cutover with Ghost
homeless breaks subscriptions silently, which is the worst way for it to fail.

**2. Then these four repo changes, together:**

| Where | From | To |
|---|---|---|
| `docker-compose.yml` `NEXT_PUBLIC_SERVER_URL` | `https://stream.democracyinnovators.com` | `https://democracyinnovators.com` |
| `.env` | *(unset)* | `GHOST_ORIGIN=https://old.democracyinnovators.com` |
| `src/app/(frontend)/subscribe/page.tsx` `data-api`, `data-ghost` | `democracyinnovators.com` | `old.democracyinnovators.com` |
| `next.config.ts` `images.remotePatterns` | — | add `old.democracyinnovators.com` |

Two redirects to add in `redirects.ts` at the same time, both pointing at `old.`:

- `/members/:path*` — every confirm and unsubscribe link Ghost has already
  emailed carries the apex, and those live in inboxes indefinitely. Without
  this, a subscriber clicking unsubscribe gets a 404.
- `/content/images/:path*` — the portraits are local now, but two images inside
  episode HTML still hotlink the blog.

**3. Prose that becomes false** once the apex is this site:

- `privacy/page.tsx` names `democracyinnovators.com` as a third party handling
  subscriber email. After the move the processing happens at `old.`, and the
  apex is us. A privacy policy is the wrong place to be wrong about who holds
  an address.
- `subscribe/page.tsx` — "our existing Ghost publication".
- `listen/page.tsx` — links to the apex as an external "Website & blog"; becomes
  a self-link.

**4. Rebuild.** `NEXT_PUBLIC_SERVER_URL` is an `ENV` in the Dockerfile's builder
stage, so Next inlines it into the client bundles — the old hostname sits in 12
files under `.next`. A restart will not change the canonical domain. Note also
that `docker-compose.yml` sets it under `environment:`, which overrides
`env_file`, so editing `.env` alone does nothing.

## Known behaviour worth remembering

**Files added to `runtime/uploads` are not served until the next build.** The
standalone server resolves the public file set at build time, so a cover or
portrait copied in afterwards 404s even though it is present in the container.
Verified by probe. Every content import so far has been followed by a rebuild,
which hid this. Any future import needs one too.

## Left for you, outside this repo

- Cloudflare origin for the apex and `www`; certificates for both.
- Keep `stream.` as a 301 to the apex rather than retiring it.
- nginx: review `client_max_body_size` (the default will reject admin uploads
  over 1 MB) and the security headers. If you add rate limiting behind a CDN,
  key it on the forwarded client header rather than the peer address, or a
  single edge IP stands in for thousands of visitors.
- Analytics: Ghost ran Matomo via code injection. Nothing replaces it here. If
  you want it, it is a tracker, and the notice-only cookie banner would have to
  become a real consent gate.
- An external uptime check. `/api/health` now actually queries the database, so
  it is worth watching; nothing currently does.
