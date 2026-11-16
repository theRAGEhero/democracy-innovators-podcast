import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'

import { verifyUnsubscribeToken } from '@/lib/newsletter-tokens'

import { UnsubscribeButton } from './UnsubscribeButton'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
}

/**
 * Deliberately a safe GET: it verifies the link, shows who it belongs to, and
 * changes nothing until the button is pressed.
 *
 * Gmail and mail-security scanners follow links in email without anybody
 * clicking. A destructive GET here would quietly unsubscribe readers who did
 * nothing — the failure would be invisible to us and look like indifference
 * from them. The mail client's own unsubscribe button is unaffected: RFC 8058
 * one-click is a POST, and it goes straight to the API route.
 */
export default async function NewsletterUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; t?: string }>
}) {
  const { s: id, t: token } = await searchParams
  const valid = Boolean(id && verifyUnsubscribeToken(id, token))

  let email: string | null = null
  let already = false
  if (valid && id) {
    const payload = await getPayload({ config })
    const subscriber = await payload
      .findByID({ collection: 'newsletter-subscribers', id, depth: 0, overrideAccess: true })
      .catch(() => null)
    email = subscriber?.email ?? null
    already = subscriber?.status === 'unsubscribed'
  }

  if (!valid) {
    return (
      <main className="inner-page">
        <header className="page-intro">
          <p className="section-label">Newsletter</p>
          <h1>That link is not valid.</h1>
          <p>
            It may have been truncated by your email client. You can also unsubscribe by replying to any
            of our emails, or by writing to <a href="mailto:ale@9minuti.it">ale@9minuti.it</a>.
          </p>
        </header>
      </main>
    )
  }

  if (already) {
    return (
      <main className="inner-page">
        <header className="page-intro">
          <p className="section-label">Newsletter</p>
          <h1>You are already unsubscribed.</h1>
          <p>{email ? `${email} is not on the list.` : 'That address is not on the list.'} Nothing more to do.</p>
        </header>
        <section className="about-next">
          <div className="hero-actions">
            <Link className="primary-button" href="/episodes">Browse the episodes</Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="inner-page">
      <header className="page-intro">
        <p className="section-label">Newsletter</p>
        <h1>Unsubscribe from the newsletter?</h1>
        <p>
          {email ? <>We will stop sending episode emails to <strong>{email}</strong>.</> : 'We will stop sending you episode emails.'}{' '}
          The archive stays open either way — every episode and transcript remains free to read.
        </p>
      </header>
      <section className="about-next">
        <UnsubscribeButton id={String(id)} token={String(token)} />
      </section>
    </main>
  )
}
