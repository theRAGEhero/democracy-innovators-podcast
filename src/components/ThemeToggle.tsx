'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

export const THEME_STORAGE_KEY = 'di-theme'

// Light/dark switch. Both icons are always rendered and CSS picks the right one
// (see .theme-toggle in globals.css), so the button is correct at first paint —
// the state below only exists to keep the label accurate and to flip the theme.
export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null)

  useEffect(() => {
    const attr = document.documentElement.dataset.theme
    if (attr === 'light' || attr === 'dark') {
      setTheme(attr)
      return
    }
    setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      /* private mode — the choice just doesn't survive the session */
    }
  }

  const label = theme ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme` : 'Switch theme'

  return (
    <button className="theme-toggle" type="button" onClick={toggle} aria-label={label} title={label}>
      <Moon aria-hidden="true" className="theme-toggle-dark" />
      <Sun aria-hidden="true" className="theme-toggle-light" />
    </button>
  )
}
