'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="inner-page">
      <header className="page-intro">
        <p className="section-label">Something went wrong</p>
        <h1>This page didn’t load.</h1>
        <p>
          The archive is still there — this was a temporary problem on our side. Try again, or head
          back to the episodes.
        </p>
      </header>
      <div className="hero-actions">
        <button className="primary-button" onClick={reset} type="button">
          Try again
        </button>
        <Link className="text-link" href="/episodes">
          All episodes <span aria-hidden="true">→</span>
        </Link>
      </div>
    </main>
  )
}
