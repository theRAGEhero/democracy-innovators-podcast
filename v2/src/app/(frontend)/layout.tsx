import type { Metadata } from 'next'

import React from 'react'

import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { Chatbot } from '@/components/Chatbot'

import './globals.css'
import { getServerSideURL } from '@/utilities/getURL'

export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="/favicon.ico" rel="icon" sizes="32x32" />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body>
        <div className="page-shell">
          <SiteHeader />
          {children}
          <SiteFooter />
          <Chatbot />
          <script defer src="/chatbot.js" />
        </div>
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
  },
  twitter: {
    card: 'summary_large_image',
  },
}
