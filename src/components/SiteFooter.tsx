import Link from 'next/link'
import type { CSSProperties } from 'react'

import { listenPlatforms } from '@/lib/platforms'

export function SiteFooter() {
  // Driven by the same list the /listen page and the episode sheet use, so a
  // channel added there shows up here without a second edit.
  const channels = listenPlatforms.filter((platform) => platform.brand)

  return (
    <footer className="site-footer">
      <p>Independent conversations about democracy, governance and civic technology.</p>
      <nav aria-label="Footer navigation">
        <Link href="/episodes">Episodes</Link>
        <Link href="/people">People</Link>
        <Link href="/topics">Topics</Link>
        <Link href="/search">Search</Link>
        <Link href="/listen">Listen</Link>
        <Link href="/rss.xml">RSS</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/privacy">Privacy &amp; Cookies</Link>
      </nav>

      <section className="footer-platforms" aria-labelledby="footer-listen-on">
        <p className="section-label" id="footer-listen-on">Listen on</p>
        <div>
          {channels.map((platform) => (
            <a
              key={platform.href}
              href={platform.href}
              rel="noreferrer"
              target="_blank"
              // The link's only content is an icon, so it needs a name of its
              // own — otherwise a screen reader announces an unlabelled link.
              aria-label={platform.short || platform.label}
              style={{ '--brand': platform.brand!.color, '--brand-dark': platform.brand!.dark } as CSSProperties}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d={platform.brand!.path} />
              </svg>
            </a>
          ))}
        </div>
      </section>

      <p className="footer-year">Democracy Innovators Podcast © {new Date().getFullYear()}</p>
    </footer>
  )
}
