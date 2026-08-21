import Link from 'next/link'

export function SiteFooter() {
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
      <p className="footer-year">Democracy Innovators Podcast © {new Date().getFullYear()}</p>
    </footer>
  )
}
