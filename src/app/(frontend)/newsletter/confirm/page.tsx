import type { Metadata } from 'next'
import Link from 'next/link'

import { confirmSubscription, type ConfirmationOutcome } from '@/lib/newsletter-confirm'

// Reads a token out of a link, so it can never be cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Confirm your subscription',
  robots: { index: false, follow: false },
}

const COPY: Record<ConfirmationOutcome, { heading: string; body: string }> = {
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
  const outcome = await confirmSubscription((await searchParams).t)
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
