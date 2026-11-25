import config from '@payload-config'
import { getPayload } from 'payload'

import { verifyUnsubscribeToken } from '@/lib/newsletter-tokens'

/**
 * The only thing that actually unsubscribes anybody.
 *
 * POST, and POST only, for two reasons. RFC 8058 one-click is a POST, so this is
 * what a mail client's own unsubscribe button calls. And Gmail and security
 * scanners prefetch links in email, which means a destructive GET would
 * silently unsubscribe people who never clicked anything.
 *
 * No cookie, no CSRF token: the capability is the signed token in the URL, and
 * a mail client posting on the subscriber's behalf has no session to present.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  let id = url.searchParams.get('s')
  let token = url.searchParams.get('t')

  // Our own page posts JSON. A mail client posts the query string with
  // "List-Unsubscribe=One-Click" in a form-encoded body, so the parameters stay
  // in the URL — but accept them from the body too rather than depend on it.
  if (!id || !token) {
    const type = request.headers.get('content-type') || ''
    if (type.includes('application/json')) {
      const body = await request.json().catch(() => ({}))
      id = id || (typeof body.s === 'string' ? body.s : null)
      token = token || (typeof body.t === 'string' ? body.t : null)
    } else if (type.includes('application/x-www-form-urlencoded')) {
      const body = new URLSearchParams(await request.text().catch(() => ''))
      id = id || body.get('s')
      token = token || body.get('t')
    }
  }

  if (!id || !token) {
    return Response.json({ error: 'That unsubscribe link is not valid.' }, { status: 400 })
  }

  const payload = await getPayload({ config })
  const subscriber = await payload
    .findByID({ collection: 'newsletter-subscribers', id, depth: 0, overrideAccess: true })
    .catch(() => null)

  // A link for a row that no longer exists is already the outcome it requested.
  if (!subscriber) return Response.json({ ok: true })
  if (!verifyUnsubscribeToken(subscriber, token)) {
    return Response.json({ error: 'That unsubscribe link is not valid.' }, { status: 400 })
  }

  if (subscriber.status !== 'unsubscribed') {
    await payload.update({
      collection: 'newsletter-subscribers',
      id: subscriber.id,
      data: {
        status: 'unsubscribed',
        unsubscribedAt: new Date().toISOString(),
        confirmTokenHash: null,
        confirmTokenExpiresAt: null,
      },
      overrideAccess: true,
    })
  }

  // Idempotent on purpose: a mail client may retry, and "you were already
  // unsubscribed" is a success, not an error.
  return Response.json({ ok: true })
}
