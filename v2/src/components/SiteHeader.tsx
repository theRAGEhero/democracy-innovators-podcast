import Link from 'next/link'

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/">
        <span>Democracy</span>
        <span>Innovators</span>
      </Link>
      <nav aria-label="Primary navigation" className="site-nav">
        <Link href="/episodes">Episodes</Link>
        <Link href="/people">People</Link>
        <Link href="/topics">Topics</Link>
        <Link href="/about">About</Link>
      </nav>
      <Link className="support-link" href="/subscribe">
        Subscribe
      </Link>
    </header>
  )
}
