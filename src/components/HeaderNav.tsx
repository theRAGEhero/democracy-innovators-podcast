'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

type NavItem = { href: string; label: string; secondary?: boolean }

// Primary navigation. On desktop it is a plain row; on mobile it collapses into
// a disclosure menu so links are not hidden in a horizontal scroll strip.
export function HeaderNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Close the menu after navigating.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    const onOverlay = (event: Event) => {
      if ((event as CustomEvent).detail !== 'navigation') setOpen(false)
    }
    window.addEventListener('ui:overlay-open', onOverlay)
    return () => window.removeEventListener('ui:overlay-open', onOverlay)
  }, [])

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="primary-navigation"
        onClick={() => setOpen((value) => {
          if (!value) window.dispatchEvent(new CustomEvent('ui:overlay-open', { detail: 'navigation' }))
          return !value
        })}
      >
        <span className="nav-toggle-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="nav-toggle-label">{open ? 'Close' : 'Menu'}</span>
      </button>

      <nav
        id="primary-navigation"
        aria-label="Primary navigation"
        className={`site-nav${open ? ' is-open' : ''}`}
      >
        {items.map((item) => (
          <Link className={item.secondary ? 'site-nav-secondary' : undefined} key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
            {item.label}
          </Link>
        ))}
        <Link className="site-nav-search" href="/search" aria-current={isActive('/search') ? 'page' : undefined}>
          Search
        </Link>
      </nav>
    </>
  )
}
