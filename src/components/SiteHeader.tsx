import { HeaderNav } from './HeaderNav'
import { ThemeToggle } from './ThemeToggle'
import Link from 'next/link'
import { supportUrl } from '@/lib/platforms'

// The map is a way of reading the topics, not a section of its own, so it sits
// under Topics rather than beside it. People is still published and still linked
// from every episode; it just no longer competes for a slot in the top bar.
//
// Donate is listed as `secondary`, which hides it above 620px and shows it in
// the mobile sheet — the exact inverse of .support-link below. Between the two,
// the donation link is reachable at every width without ever appearing twice.
const navItems = [
  { href: '/episodes', label: 'Episodes' },
  { href: '/topics', label: 'Topics', children: [{ href: '/map', label: 'Map' }] },
  { href: '/listen', label: 'Listen' },
  { href: '/about', label: 'About' },
  { href: '/mcp', label: 'MCP' },
  { href: supportUrl, label: 'Donate', secondary: true, external: true },
]

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wordmark-logo" src="/logo.png" alt="" width={54} height={54} />
        <span className="wordmark-text">
          <span>Democracy</span>
          <span>Innovators</span>
        </span>
      </Link>

      <HeaderNav items={navItems} />

      <div className="header-actions">
        <Link className="header-search-link" href="/search" aria-label="Search the archive">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <span>Search</span>
        </Link>
        <ThemeToggle />
        {/* A plain anchor, not <Link>: /paypal is a route handler that answers
            with a redirect, so there is no RSC payload for Next to prefetch. */}
        <a className="support-link" href={supportUrl} rel="noreferrer" target="_blank">
          Donate
        </a>
      </div>
    </header>
  )
}
