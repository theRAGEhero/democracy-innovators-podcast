import Link from 'next/link'

import { HeaderNav } from './HeaderNav'
import { ThemeToggle } from './ThemeToggle'

const navItems = [
  { href: '/episodes', label: 'Episodes' },
  { href: '/people', label: 'People' },
  { href: '/topics', label: 'Topics' },
  { href: '/map', label: 'Map' },
  { href: '/listen', label: 'Listen' },
  { href: '/about', label: 'About', secondary: true },
  { href: '/contact', label: 'Contact', secondary: true },
]

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wordmark-logo" src="/logo.png" alt="" width={40} height={40} />
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
        <Link className="support-link" href="/subscribe">
          Subscribe
        </Link>
      </div>
    </header>
  )
}
