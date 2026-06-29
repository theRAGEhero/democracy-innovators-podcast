import type { Metadata } from 'next'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Subscribe',
  description: 'Get new Democracy Innovators conversations by email or follow the podcast.',
}

export default function SubscribePage() {
  return (
    <main className="inner-page subscribe-page">
      <Script
        data-api="https://democracyinnovators.com/ghost/api/content/"
        data-ghost="https://democracyinnovators.com/"
        data-i18n="true"
        data-key="aca0a8916a7d74049348f9d1c3"
        data-locale="en"
        src="https://cdn.jsdelivr.net/ghost/portal@~2.68/umd/portal.min.js"
        strategy="afterInteractive"
      />

      <header className="page-intro subscribe-intro">
        <p className="section-label">Stay connected</p>
        <h1>One useful conversation at a time.</h1>
        <p>New interviews and field notes about democratic innovation, delivered without a noisy publishing schedule.</p>
      </header>

      <section className="newsletter-signup" aria-labelledby="newsletter-heading">
        <div className="newsletter-copy">
          <p className="section-label">The newsletter</p>
          <h2 id="newsletter-heading">Follow the work, not an algorithm.</h2>
          <p>Receive new episodes and occasional notes from the Democracy Innovators archive. No advertising and no daily email.</p>
        </div>
        <form className="newsletter-form" data-members-form="subscribe">
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
          <p className="newsletter-fineprint">Managed through our existing Ghost publication. See the <a href="/privacy">privacy notice</a>.</p>
          <p aria-live="polite" className="newsletter-state newsletter-loading">Sending confirmation…</p>
          <p aria-live="polite" className="newsletter-state newsletter-success">Check your inbox to confirm your subscription.</p>
          <p aria-live="polite" className="newsletter-state newsletter-error" data-members-error>We could not start the subscription. Please try again.</p>
        </form>
      </section>

      <section className="subscribe-platforms" aria-labelledby="platforms-heading">
        <div className="section-heading">
          <div><p className="section-label">Listen elsewhere</p><h2 id="platforms-heading">Keep the podcast in your feed.</h2></div>
        </div>
        <div className="topics-grid">
          <a href="https://podcasts.apple.com/us/podcast/democracy-innovators-podcast/id1806614367" rel="noreferrer" target="_blank"><span>Apple Podcasts</span><span>Open ↗</span></a>
          <a href="https://open.spotify.com/show/7e1DjGuFaHZlgDc6e7xmnr" rel="noreferrer" target="_blank"><span>Spotify</span><span>Open ↗</span></a>
          <a href="/rss.xml"><span>RSS feed</span><span>Copy or open →</span></a>
          <a href="https://www.youtube.com/@DemocracyInnovatorsPodcast" rel="noreferrer" target="_blank"><span>YouTube</span><span>Open ↗</span></a>
        </div>
      </section>
    </main>
  )
}
