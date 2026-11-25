import config from '@payload-config'
import { getPayload } from 'payload'

import { sendNewsletterConfirmation } from '@/lib/contact-mail'
import { getServerSideURL } from '@/lib/getURL'
import { confirmUrl, createConfirmToken } from '@/lib/newsletter-tokens'
import { isRateLimited } from '@/lib/rate-limit'

const RATE_LIMIT = { scope: 'newsletter', limit: 3, windowMs: 60_000 }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Re-sending a confirmation is useful (people lose the email) and is also a
 *  way to have us mail a stranger repeatedly. Five minutes is the compromise. */
const RESEND_AFTER_MS = 5 * 60 * 1000

type Subscription = { email: string; name: string }

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : ''
}

function validate(body: Record<string, unknown>): Subscription | Response {
  // A filled honeypot is answered exactly like a success and dropped.
  if (clean(body.website, 120)) return Response.json({ ok: true })

  const email = clean(body.email, 180).toLowerCase()
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }
  // Consent is the lawful basis, so the positive act has to be recorded rather
  // than assumed from the act of typing an address.
  if (!body.consent) {
    return Response.json({ error: 'Please tick the box to confirm you want the newsletter.' }, { status: 400 })
  }

  return { email, name: clean(body.name, 120) }
}

export async function POST(request: Request) {
  if (isRateLimited(request, RATE_LIMIT)) {
    return Response.json({ error: 'Too many attempts. Please wait a minute.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const validated = validate(body)
  if (validated instanceof Response) return validated

  const payload = await getPayload({ config })
  const origin = getServerSideURL()
  const now = new Date()

  const existing = await payload.find({
    collection: 'newsletter-subscribers',
    where: { email: { equals: validated.email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const current = existing.docs[0]

  // Whether to send, decided per state. The response below does not vary with
  // it: telling the caller "already subscribed" would turn this endpoint into a
  // way to test whether an address is on the list.
  let token: string | null = null

  if (!current) {
    const fresh = createConfirmToken(now)
    token = fresh.token
    await payload.create({
      collection: 'newsletter-subscribers',
      draft: false,
      data: {
        email: validated.email,
        name: validated.name || undefined,
        status: 'pending',
        source: 'web',
        consentAt: now.toISOString(),
        confirmSentAt: now.toISOString(),
        confirmTokenHash: fresh.hash,
        confirmTokenExpiresAt: fresh.expiresAt,
        signupIp:
          request.headers.get('x-real-ip')
          || request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
          || undefined,
        signupUserAgent: request.headers.get('user-agent') || undefined,
      },
      overrideAccess: true,
    })
  } else if (current.status === 'confirmed') {
    // Nothing to do, and nothing to say.
  } else {
    // The throttle governs the *email*, not the record. Conflating the two meant
    // someone who unsubscribed and changed their mind within five minutes was
    // told to check their inbox while nothing happened at all and their row
    // stayed unsubscribed.
    const lastSent = current.confirmSentAt ? new Date(current.confirmSentAt).getTime() : 0
    const fresh = now.getTime() - lastSent >= RESEND_AFTER_MS ? createConfirmToken(now) : null
    token = fresh?.token ?? null

    await payload.update({
      collection: 'newsletter-subscribers',
      id: current.id,
      data: {
        // Asking again is a fresh act of consent, so the date moves with it.
        // `pending` is never mailed, so moving an unsubscribed row here cannot
        // put anybody back on the list — only their own click can do that.
        status: 'pending',
        consentAt: now.toISOString(),
        name: validated.name || current.name,
        // unsubscribedAt is deliberately left in place: it is the record that
        // this person once objected, and `status` already says where they are
        // now.
        ...(fresh
          ? {
              confirmSentAt: now.toISOString(),
              confirmTokenHash: fresh.hash,
              confirmTokenExpiresAt: fresh.expiresAt,
            }
          : {}),
      },
      overrideAccess: true,
    })
    // Inside the throttle window a pending row keeps its earlier token, which is
    // valid for 48 hours, so the first email still works. An unsubscribed row
    // has none and the person has to try again in a few minutes — the price of
    // not letting this endpoint mail a stranger on demand.
  }

  if (!token) return Response.json({ ok: true })

  try {
    const mailed = await sendNewsletterConfirmation({
      to: validated.email,
      confirmUrl: confirmUrl(origin, token),
    })
    // `mailed: false` says our mail is down, which is true for everyone and so
    // reveals nothing about this address.
    if (!mailed) {
      payload.logger.warn({ message: 'Newsletter confirmation not sent: SMTP is not configured' })
      return Response.json({ ok: true, mailed: false })
    }
  } catch (error) {
    payload.logger.error({ err: error, message: 'Newsletter confirmation delivery failed' })
    return Response.json({ ok: true, mailed: false })
  }

  return Response.json({ ok: true })
}
