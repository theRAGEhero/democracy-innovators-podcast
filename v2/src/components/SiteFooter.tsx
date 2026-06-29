import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>Independent conversations about democracy, governance and civic technology.</p>
      <nav aria-label="Footer navigation">
        <Link href="/rss.xml">RSS</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/admin">Admin</Link>
      </nav>
      <p className="footer-year">Democracy Innovators Podcast © {new Date().getFullYear()}</p>
    </footer>
  )
}
