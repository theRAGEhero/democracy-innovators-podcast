import type { Metadata } from 'next'
import Link from 'next/link'
import Script from 'next/script'

import { listenPlatforms, socialPlatforms, supportUrl, type PlatformLink } from '@/lib/platforms'

export const metadata: Metadata = {
  title: 'Listen & Follow',
  description:
    'Every place to listen to and follow the Democracy Innovators Podcast — Apple Podcasts, Spotify, YouTube, the Fediverse, RSS, newsletter, Bluesky, LinkedIn and more.',
  alternates: { canonical: '/listen' },
}

// A link-in-bio page: one narrow centred column, one tap target per row. It is
// the URL handed out on social profiles, so it stays scannable on a phone
// rather than reusing the wide editorial grid of the rest of the site.
//
// The newsletter used to live on its own /subscribe page, whose other half was
// a platform list this page already carried in full. Only the signup form was
// unique, so it moved here and /subscribe now redirects to #newsletter.
const groups: { title: string; links: (PlatformLink & { internal?: boolean })[] }[] = [
  { title: 'Listen', links: listenPlatforms },
  { title: 'Social', links: socialPlatforms },
  { title: 'Elsewhere', links: [{ label: 'Website & blog', href: 'https://old.democracyinnovators.com', hint: 'Long reads' }] },
  { title: 'Support', links: [{ label: 'Donate via PayPal', href: supportUrl, hint: 'Keep it independent' }] },
]

function Row({ label, hint, arrow }: { label: string; hint?: string; arrow: string }) {
  return (
    <>
      <span className="linktree-label">{label}</span>
      {hint ? <span className="linktree-hint">{hint}</span> : null}
      <span aria-hidden="true" className="linktree-arrow">{arrow}</span>
    </>
  )
}

export default function ListenPage() {
  return (
    <main className="linktree">
      <header className="linktree-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" className="linktree-logo" src="/logo.png" width={96} height={96} />
        <h1>Democracy Innovators Podcast</h1>
        <p>Independent conversations about democracy, governance and civic technology.</p>
      </header>

      {groups.map((group) => (
        <section className="linktree-group" key={group.title}>
          <h2 className="section-label">{group.title}</h2>
          {group.links.map((link) =>
            link.internal ? (
              <Link className="linktree-link" href={link.href} key={link.href}>
                <Row label={link.label} hint={link.hint} arrow="→" />
              </Link>
            ) : (
              <a className="linktree-link" href={link.href} key={link.href} rel="noreferrer" target="_blank">
                <Row label={link.label} hint={link.hint} arrow="↗" />
              </a>
            ),
          )}
        </section>
      ))}

      <section className="linktree-group" id="newsletter">
        <h2 className="section-label">Newsletter</h2>
        <form className="newsletter-form linktree-newsletter" data-members-form="subscribe">
          <input data-members-label type="hidden" value="Stream newsletter signup 2026-06" />
          <label htmlFor="newsletter-email">Email address</label>
          <div className="newsletter-fields">
            <input
              autoComplete="email"
              data-members-email
              id="newsletter-email"
              name="email"
              placeholder="you@example.org"
              required
              type="email"
            />
            <button type="submit">Subscribe</button>
          </div>
          <label className="newsletter-consent">
            <input required type="checkbox" />
            <span>I want to receive the Democracy Innovators newsletter by email. I can unsubscribe at any time.</span>
          </label>
          <p className="newsletter-fineprint">Managed through our Ghost publication at old.democracyinnovators.com. See the <Link href="/privacy">privacy notice</Link>.</p>
          <p aria-live="polite" className="newsletter-state newsletter-loading">Sending confirmation…</p>
          <p aria-live="polite" className="newsletter-state newsletter-success">Check your inbox to confirm your subscription.</p>
          <p aria-live="polite" className="newsletter-state newsletter-error" data-members-error>We could not start the subscription. Please try again.</p>
        </form>
      </section>

      <p className="linktree-foot">
        <Link href="/episodes">Browse every episode →</Link>
      </p>

      {/* Ghost Portal drives the form above. It is the only third-party script
          on this page, and it loads after the page is interactive. */}
      <Script
        data-api="https://old.democracyinnovators.com/ghost/api/content/"
        data-ghost="https://old.democracyinnovators.com/"
        data-i18n="true"
        data-key="aca0a8916a7d74049348f9d1c3"
        data-locale="en"
        src="https://cdn.jsdelivr.net/ghost/portal@~2.68/umd/portal.min.js"
        strategy="afterInteractive"
      />
    </main>
  )
}
