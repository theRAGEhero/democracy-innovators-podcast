import type { NextConfig } from 'next'

export const redirects: NextConfig['redirects'] = async () => {
  const internetExplorerRedirect = {
    destination: '/ie-incompatible.html',
    has: [
      {
        type: 'header' as const,
        key: 'user-agent',
        value: '(.*Trident.*)', // all ie browsers
      },
    ],
    permanent: false,
    source: '/:path((?!ie-incompatible.html$).*)', // all pages except the incompatibility page
  }

  // Preserve inbound links from the old Ghost site after the DNS cutover.
  //
  // Everything here answers 200 on Ghost today, so each one is a live URL
  // somewhere — in Google's index, in somebody's bookmarks, or in an email.
  // Episode slugs are not listed: they are handled in (frontend)/[slug], which
  // looks the slug up and 308s to /episode/<slug>.
  const legacyGhostRedirects = [
    { source: '/rss', destination: '/rss.xml', permanent: true },
    { source: '/rss/', destination: '/rss.xml', permanent: true },
    { source: '/tag/:slug*', destination: '/topics', permanent: true },
    { source: '/author/:slug*', destination: '/people', permanent: true },
    // Ghost's home pagination ran to /page/14.
    { source: '/page/:n', destination: '/episodes', permanent: true },
    // Ghost's sitemap index named four children, so they are indexed too.
    { source: '/sitemap-:kind(pages|posts|authors|tags).xml', destination: '/sitemap.xml', permanent: true },
    { source: '/sitemap.xsl', destination: '/sitemap.xml', permanent: true },
    // Where the editor used to log in.
    { source: '/ghost', destination: '/admin', permanent: false },
    { source: '/ghost/:path*', destination: '/admin', permanent: false },
    // Still served by Ghost, now at its own hostname. The members paths matter
    // most: every confirmation and unsubscribe link Ghost has already emailed
    // carries the apex, and those live in inboxes indefinitely.
    { source: '/members/:path*', destination: 'https://old.democracyinnovators.com/members/:path*', permanent: false },
    { source: '/content/images/:path*', destination: 'https://old.democracyinnovators.com/content/images/:path*', permanent: true },
    // The MCP page moved to match the label in the navigation.
    { source: '/developers', destination: '/mcp', permanent: true },
  ]

  return [internetExplorerRedirect, ...legacyGhostRedirects]
}
