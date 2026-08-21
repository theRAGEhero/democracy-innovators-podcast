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
  const legacyGhostRedirects = [
    { source: '/rss', destination: '/rss.xml', permanent: true },
    { source: '/rss/', destination: '/rss.xml', permanent: true },
    { source: '/tag/:slug*', destination: '/topics', permanent: true },
    { source: '/author/:slug*', destination: '/people', permanent: true },
  ]

  return [internetExplorerRedirect, ...legacyGhostRedirects]
}
