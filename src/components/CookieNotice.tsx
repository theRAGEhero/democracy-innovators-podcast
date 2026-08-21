'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'cookie-notice-dismissed'

// Notice-only banner. The site sets no analytics or marketing cookies, so there
// is nothing to gate — this simply informs and links to the full policy. The
// dismissal flag lives in localStorage, not a cookie.
export function CookieNotice() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== 'true') setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // Ignore storage failures; the banner just reappears next visit.
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie-notice" role="region" aria-label="Cookie notice">
      <p>
        We use essential cookies for admin sign-in, remember your theme, and count visits
        without tracking you. Newsletter and podcast embeds are third-party services.{' '}
        <Link href="/privacy">Learn more</Link>.
      </p>
      <button type="button" onClick={dismiss} className="cookie-notice-ok">
        OK
      </button>
    </div>
  )
}
