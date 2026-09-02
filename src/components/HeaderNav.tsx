'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type NavItem = { href: string; label: string; secondary?: boolean; children?: NavItem[] }

// Primary navigation. On desktop it is a plain row; on mobile it collapses into
// a disclosure menu so links are not hidden in a horizontal scroll strip.
//
// An item may carry children. On desktop they sit in a small panel opened from
// a chevron beside the parent; on mobile they are simply indented beneath it,
// because a floating panel inside a full-screen sheet has nothing to float over.
export function HeaderNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const navRef = useRef<HTMLElement>(null)

  // Close the menu after navigating.
  useEffect(() => {
    setOpen(false)
    setOpenGroup(null)
  }, [pathname])

  useEffect(() => {
    if (!open && !openGroup) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      setOpenGroup(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, openGroup])

  // A press anywhere outside closes an open submenu, which otherwise stays over
  // the page after attention has moved on.
  useEffect(() => {
    if (!openGroup) return
    const onDown = (event: MouseEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenGroup(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openGroup])

  useEffect(() => {
    const onOverlay = (event: Event) => {
      if ((event as CustomEvent).detail === 'navigation') return
      setOpen(false)
      setOpenGroup(null)
    }
    window.addEventListener('ui:overlay-open', onOverlay)
    return () => window.removeEventListener('ui:overlay-open', onOverlay)
  }, [])

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const link = (item: NavItem, className?: string) => (
    <Link
      className={className}
      key={item.href}
      href={item.href}
      aria-current={isActive(item.href) ? 'page' : undefined}
    >
      {item.label}
    </Link>
  )

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
        ref={navRef}
        aria-label="Primary navigation"
        className={`site-nav${open ? ' is-open' : ''}`}
      >
        {items.map((item) =>
          item.children?.length ? (
            <span
              className={`site-nav-group${openGroup === item.href ? ' is-open' : ''}`}
              key={item.href}
            >
              {link(item)}
              <button
                type="button"
                className="site-nav-disclosure"
                aria-expanded={openGroup === item.href}
                aria-controls={`nav-under-${item.label.toLowerCase()}`}
                aria-label={`More under ${item.label}`}
                onClick={() => setOpenGroup((value) => (value === item.href ? null : item.href))}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m5 9 7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="site-nav-submenu" id={`nav-under-${item.label.toLowerCase()}`}>
                {item.children.map((child) => link(child))}
              </span>
            </span>
          ) : (
            link(item, item.secondary ? 'site-nav-secondary' : undefined)
          ),
        )}
        <Link className="site-nav-search" href="/search" aria-current={isActive('/search') ? 'page' : undefined}>
          Search
        </Link>
      </nav>
    </>
  )
}
