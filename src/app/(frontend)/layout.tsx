import type { Metadata } from 'next'

import React from 'react'

import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { CookieNotice } from '@/components/CookieNotice'
import { VisitCounter } from '@/components/VisitCounter'
import { FrontendExperience } from '@/components/FrontendExperience'

import './globals.css'
import { getServerSideURL } from '@/lib/getURL'

// The Docker build pre-renders against an empty throwaway DB (build.db), so
// static/ISR pages would bake in an empty site. Render frontend pages
// dynamically against the real database at request time.
export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta content="#fbfbfa" media="(prefers-color-scheme: light)" name="theme-color" />
        <meta content="#14171c" media="(prefers-color-scheme: dark)" name="theme-color" />
        {/* Applies the stored theme before first paint. Anything later — a
            provider, an effect — repaints the page in the wrong palette
            first. Mirrors THEME_STORAGE_KEY in components/ThemeToggle.tsx. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('di-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}",
          }}
        />
        <link href="/favicon.ico" rel="icon" sizes="any" />
        <link href="/favicon-32x32.png" rel="icon" type="image/png" sizes="32x32" />
        <link href="/favicon-16x16.png" rel="icon" type="image/png" sizes="16x16" />
        <link href="/apple-touch-icon.png" rel="apple-touch-icon" />
        <link href="/rss.xml" rel="alternate" type="application/rss+xml" title="Democracy Innovators Podcast — Episodes (web)" />
        <link
          href="https://podcast.democracyinnovators.com/@podcast/feed.xml"
          rel="alternate"
          type="application/rss+xml"
          title="Democracy Innovators Podcast — Audio feed"
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <FrontendExperience>
          <div className="page-shell">
            <SiteHeader />
            <CookieNotice />
            <div id="main-content">{children}</div>
            <SiteFooter />
            <VisitCounter />
          </div>
        </FrontendExperience>
      </body>
    </html>
  )
}

export const metadata: Metadata = {
  metadataBase: new URL(getServerSideURL()),
  title: {
    default: 'Democracy Innovators Podcast',
    template: '%s | Democracy Innovators Podcast',
  },
  description: 'Independent conversations about democracy, governance and civic technology.',
  openGraph: {
    siteName: 'Democracy Innovators Podcast',
    type: 'website',
    images: [{ url: '/og-default.jpg', width: 1200, height: 630, alt: 'Democracy Innovators Podcast' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og-default.jpg'],
  },
}
