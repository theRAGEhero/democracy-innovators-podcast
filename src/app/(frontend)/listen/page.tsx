import type { Metadata } from 'next'
import Link from 'next/link'

import { NewsletterForm } from '@/components/NewsletterForm'
import { listenPlatforms, socialPlatforms, supportUrl, type PlatformLink } from '@/lib/platforms'

export const metadata: Metadata = {
  title: 'Listen & Follow',
  description:
    'Every place to listen to and follow the Democracy Innovators Podcast — Apple Podcasts, Spotify, YouTube, the Fediverse, RSS, newsletter, Bluesky, LinkedIn, Telegram and more.',
  alternates: { canonical: '/listen' },
}

// A link-in-bio page: one narrow centred column, one tap target per row. It is
// the URL handed out on social profiles, so it stays scannable on a phone
// rather than reusing the wide editorial grid of the rest of the site.
//
// The newsletter used to live on its own /subscribe page, whose other half was
// a platform list this page already carried in full. Only the signup form was
// unique, so it moved here and /subscribe now redirects to #newsletter. The form
// itself was Ghost's until the list moved into this site.
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
        <NewsletterForm />
      </section>

      <p className="linktree-foot">
        <Link href="/episodes">Browse every episode →</Link>
      </p>
    </main>
  )
}
