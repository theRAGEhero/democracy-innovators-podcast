import type { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <main className="inner-page">
      <header className="page-intro">
        <p className="section-label">404</p>
        <h1>This page doesn’t exist.</h1>
        <p>
          The page may have moved, or the link may be out of date. The archive is still here —
          start from one of these.
        </p>
      </header>
      <div className="hero-actions">
        <Link className="primary-button" href="/episodes">
          Browse episodes
        </Link>
        <Link className="text-link" href="/search">
          Search the archive <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="topics-grid not-found-links">
        <Link href="/">
          <span>Home</span>
          <span>Open →</span>
        </Link>
        <Link href="/people">
          <span>People</span>
          <span>Open →</span>
        </Link>
        <Link href="/topics">
          <span>Topics</span>
          <span>Open →</span>
        </Link>
        <Link href="/listen">
          <span>Listen &amp; follow</span>
          <span>Open →</span>
        </Link>
      </div>
    </main>
  )
}
