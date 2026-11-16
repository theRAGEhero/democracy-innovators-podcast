import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'

import { hashConfirmToken } from '@/lib/newsletter-tokens'

// Reads a token out of a link, so it can never be cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Confirm your subscription',
  robots: { index: false, follow: false },
}

type Outcome = 'confirmed' | 'spent' | 'expired'

/**
 * A state-changing GET, which is not ideal — but a link in an email is a GET by
 * construction. The one-shot token and the 48-hour expiry are the mitigation.
 *
 * Mail scanners do prefetch links and will sometimes confirm on the subscriber's
 * behalf. That is acceptable here, because it can only ever confirm an address
 * that has just asked to subscribe. Unsubscribe is the opposite case and is
 * handled differently.
 */
async function confirm(token: string | undefined): Promise<Outcome> {
  if (!token) return 'spent'

  const payload = await getPayload({ config })
  const found = await payload.find({
    collection: 'newsletter-subscribers',
    where: { confirmTokenHash: { equals: hashConfirmToken(token) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const subscriber = found.docs[0]
  // Confirming clears the hash, so a used link is indistinguishable from a
  // forged one. Both get the same answer, which is also the honest one.
  if (!subscriber) return 'spent'

  const expiresAt = subscriber.confirmTokenExpiresAt
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return 'expired'

  const now = new Date().toISOString()
  await payload.update({
    collection: 'newsletter-subscribers',
    id: subscriber.id,
    data: {
      status: 'confirmed',
      confirmedAt: now,
      consentAt: subscriber.consentAt || now,
      confirmTokenHash: null,
      confirmTokenExpiresAt: null,
    },
    overrideAccess: true,
  })
  return 'confirmed'
}

const COPY: Record<Outcome, { heading: string; body: string }> = {
  confirmed: {
    heading: 'You are subscribed.',
    body:
      'From now on you will get one email per episode: the cover, what it is about, and the opening of '
      + 'the transcript. Every one of them carries an unsubscribe link.',
  },
  spent: {
    heading: 'This link has already been used.',
    body:
      'Confirmation links work once. If you have already confirmed, you are subscribed and there is '
      + 'nothing more to do. Otherwise, sign up again and we will send a fresh link.',
  },
  expired: {
    heading: 'This link has expired.',
    body: 'Confirmation links last 48 hours. Sign up again and we will send you a new one.',
  },
}

export default async function NewsletterConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>
}) {
  const outcome = await confirm((await searchParams).t)
  const copy = COPY[outcome]

  return (
    <main className="inner-page">
      <header className="page-intro">
        <p className="section-label">Newsletter</p>
        <h1>{copy.heading}</h1>
        <p>{copy.body}</p>
      </header>
      <section className="about-next">
        <p className="section-label">While you are here</p>
        <div className="hero-actions">
          <Link className="primary-button" href="/episodes">Browse the episodes</Link>
          {outcome === 'confirmed' ? null : (
            <Link className="text-link" href="/listen#newsletter">Sign up again →</Link>
          )}
        </div>
      </section>
    </main>
  )
}
