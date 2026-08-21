'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

// Fires a single cookieless beacon per path so the server can keep an
// aggregate visit count. Uses no cookies or persistent identifiers.
export function VisitCounter() {
  const pathname = usePathname()
  const lastSent = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || lastSent.current === pathname) return
    lastSent.current = pathname

    // Do not count the Payload admin panel.
    if (pathname.startsWith('/admin')) return

    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {
      // Best-effort; ignore failures.
    })
  }, [pathname])

  return null
}
