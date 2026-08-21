'use client'

import { Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePlayer, type PlayerEpisode } from './PlayerProvider'

import { formatTimestamp, type TocEntry } from '@/lib/chapters'

// Transcript table of contents. On desktop it renders as a sticky sidebar list
// (styled by CSS); on mobile the same list becomes a bottom sheet opened by a
// live "current chapter" pill. A scroll-spy highlights the section in view and
// drives the pill label.
export function ChapterIndex({ toc, episode = null }: { toc: TocEntry[]; episode?: PlayerEpisode | null }) {
  const player = usePlayer()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const anchoredIds = toc.filter((t) => t.anchored).map((t) => t.id)

  useEffect(() => {
    if (!anchoredIds.length) return
    const headings = anchoredIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (!headings.length) return

    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const firstVisible = anchoredIds.find((id) => visible.has(id))
        if (firstVisible) setActiveId(firstVisible)
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    )
    headings.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toc])

  useEffect(() => {
    const openChapters = () => {
      window.dispatchEvent(new CustomEvent('ui:overlay-open', { detail: 'chapters' }))
      setOpen(true)
    }
    const onOverlay = (event: Event) => { if ((event as CustomEvent).detail !== 'chapters') setOpen(false) }
    window.addEventListener('episode:open-chapters', openChapters)
    window.addEventListener('ui:overlay-open', onOverlay)
    return () => {
      window.removeEventListener('episode:open-chapters', openChapters)
      window.removeEventListener('ui:overlay-open', onOverlay)
    }
  }, [])

  // The anchor scrolls the transcript; this starts the audio at that point,
  // loading the episode first if it is not the one in the player.
  function playFrom(startTime: number) {
    if (!episode) return
    if (player.episode?.id === episode.id) {
      player.seek(startTime)
      if (!player.playing) player.playEpisode(episode, startTime)
    } else {
      player.playEpisode(episode, startTime)
    }
    setOpen(false)
  }

  if (!toc.length) return null

  const current = toc.find((t) => t.id === activeId) || toc.find((t) => t.anchored) || toc[0]

  return (
    <>
      {/* Mobile-only trigger pill (hidden on desktop via CSS). */}
      <button
        type="button"
        className="chapter-index-fab"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          window.dispatchEvent(new CustomEvent('ui:overlay-open', { detail: 'chapters' }))
          setOpen(true)
        }}
      >
        <span className="chapter-index-fab-label">Chapters</span>
        <span className="chapter-index-fab-current">{current?.title}</span>
      </button>

      <div
        className={`chapter-index-scrim${open ? ' is-open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <nav className={`chapter-index${open ? ' is-open' : ''}`} aria-label="Chapters">
        <div className="chapter-index-bar">
          <p className="section-label">Chapters</p>
          <button
            type="button"
            className="chapter-index-close"
            onClick={() => setOpen(false)}
            aria-label="Close chapters"
          >
            ×
          </button>
        </div>
        <ol>
          {toc.map((entry) => (
            <li key={entry.id} className={entry.id === activeId ? 'is-active' : undefined}>
              {entry.anchored ? (
                <a
                  href={`#${entry.id}`}
                  aria-current={entry.id === activeId ? 'true' : undefined}
                  onClick={() => { player.seek(entry.startTime); setOpen(false) }}
                >
                  <span className="chapter-index-time">{formatTimestamp(entry.startTime)}</span>
                  <span className="chapter-index-title">{entry.title}</span>
                </a>
              ) : (
                <span className="chapter-index-plain">
                  <span className="chapter-index-time">{formatTimestamp(entry.startTime)}</span>
                  <span className="chapter-index-title">{entry.title}</span>
                </span>
              )}
              {episode ? (
                <button
                  className="chapter-index-play"
                  type="button"
                  onClick={() => playFrom(entry.startTime)}
                  aria-label={`Play from ${entry.title}`}
                >
                  <Play aria-hidden="true" size={13} />
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </nav>
    </>
  )
}
