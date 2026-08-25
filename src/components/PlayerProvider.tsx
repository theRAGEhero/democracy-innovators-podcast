'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { ChevronUp, Gauge, List, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Undo2, Volume2, X } from 'lucide-react'

import { formatTimestamp, type Chapter } from '@/lib/chapters'

/** Seconds a single skip moves. Matches what podcast apps and OS controls use. */
const SKIP_SECONDS = 15
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]
/** How far the sheet has to be dragged down before it closes. */
const DRAG_TO_CLOSE = 80

export type PlayerEpisode = {
  id: number | string
  slug: string
  title: string
  audioUrl: string
  coverUrl?: string | null
  castopodUrl?: string | null
  /** Optional: enables the chapter picker in the player. */
  chapters?: Chapter[]
}

/** What was playing before the current episode, so a mis-click is undoable. */
type PreviousPlay = { episode: PlayerEpisode; time: number }

type PlayerContextValue = {
  episode: PlayerEpisode | null
  playing: boolean
  currentTime: number
  duration: number
  error: boolean
  chapters: Chapter[]
  currentChapter: number
  previous: PreviousPlay | null
  resumePrevious: () => void
  playEpisode: (episode: PlayerEpisode, startAt?: number) => void
  toggle: () => void
  seek: (seconds: number) => void
  skipSeconds: (delta: number) => void
  close: () => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

function formatTime(value: number) {
  if (!Number.isFinite(value)) return '0:00'
  const minutes = Math.floor(value / 60)
  return `${minutes}:${String(Math.floor(value % 60)).padStart(2, '0')}`
}

export function usePlayer() {
  const value = useContext(PlayerContext)
  if (!value) throw new Error('usePlayer must be used within PlayerProvider')
  return value
}

// --- pieces shared by the bar and the sheet -------------------------------

function PlayPause({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  return (
    <button className="player-play" type="button" onClick={onToggle} aria-label={playing ? 'Pause episode' : 'Play episode'}>
      {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
    </button>
  )
}

function Transport({ playing, onToggle, onSkip }: { playing: boolean; onToggle: () => void; onSkip: (delta: number) => void }) {
  return (
    <div className="player-transport">
      <button className="player-skip" type="button" onClick={() => onSkip(-SKIP_SECONDS)} aria-label={`Back ${SKIP_SECONDS} seconds`}>
        <RotateCcw aria-hidden="true" size={17} />
        <span>{SKIP_SECONDS}</span>
      </button>
      <PlayPause playing={playing} onToggle={onToggle} />
      <button className="player-skip" type="button" onClick={() => onSkip(SKIP_SECONDS)} aria-label={`Forward ${SKIP_SECONDS} seconds`}>
        <RotateCw aria-hidden="true" size={17} />
        <span>{SKIP_SECONDS}</span>
      </button>
    </div>
  )
}

function Timeline({
  currentTime,
  duration,
  chapters,
  onSeek,
}: {
  currentTime: number
  duration: number
  chapters: Chapter[]
  onSeek: (seconds: number) => void
}) {
  return (
    <div className="player-timeline">
      <span>{formatTime(currentTime)}</span>
      <div className="player-track">
        <input
          aria-label="Playback position"
          type="range"
          min="0"
          max={duration || 0}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
        {duration && chapters.length ? (
          <div className="player-ticks" aria-hidden="true">
            {chapters.map((chapter) => (
              <span key={chapter.startTime} style={{ left: `${Math.min(100, (chapter.startTime / duration) * 100)}%` }} />
            ))}
          </div>
        ) : null}
      </div>
      <span>{formatTime(duration)}</span>
    </div>
  )
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  // A seek requested before the audio has metadata (play from chapter N on an
  // episode that is not loaded yet); applied on loadedmetadata.
  const pendingSeekRef = useRef<number | null>(null)
  // Starting at a minute means seeking a remote file the moment it is loaded,
  // which re-issues the range request and can leave the element sitting there
  // having never begun. Remembering that playback was asked for lets the
  // element pick it up again once it is actually ready.
  const wantsPlayRef = useRef(false)
  const [episode, setEpisode] = useState<PlayerEpisode | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState(false)
  const [rate, setRate] = useState(1)
  const [expanded, setExpanded] = useState(false)
  const [chaptersOpen, setChaptersOpen] = useState(false)
  // Play buttons sit on every episode row, so switching episode by accident is
  // easy. Remember where the outgoing one was left so it can be resumed.
  const [previous, setPrevious] = useState<PreviousPlay | null>(null)
  const [dragY, setDragY] = useState(0)
  const dragRef = useRef<{ from: number; moved: number } | null>(null)

  const chapters = useMemo(() => episode?.chapters || [], [episode])
  const currentChapter = useMemo(() => {
    if (!chapters.length) return -1
    let index = -1
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].startTime <= currentTime + 0.25) index = i
      else break
    }
    return index
  }, [chapters, currentTime])

  /**
   * Start playback, treating a refusal for want of a user gesture as what it
   * is: normal. Opening a ?t= link is exactly that case, and showing an error
   * there would be wrong — the episode is loaded and sitting at the right
   * moment, a tap away. The intent is dropped too, so `canplay` does not keep
   * retrying something the browser will keep refusing. Any other refusal is a
   * real failure and still surfaces.
   */
  const startPlayback = useCallback((audio: HTMLAudioElement) => {
    wantsPlayRef.current = true
    void audio.play().catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'NotAllowedError') {
        wantsPlayRef.current = false
        return
      }
      setError(true)
    })
  }, [])

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(seconds)) return
    if (!audio.duration || Number.isNaN(audio.duration)) {
      pendingSeekRef.current = Math.max(0, seconds)
      return
    }
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration))
    setCurrentTime(audio.currentTime)
  }, [])

  // Reads the position off the element rather than state so a rapid double tap
  // moves 30 seconds, not 15 twice from the same stale value.
  const skipSeconds = useCallback((delta: number) => {
    const audio = audioRef.current
    if (!audio) return
    seek((audio.currentTime || 0) + delta)
  }, [seek])

  const playEpisode = useCallback((next: PlayerEpisode, startAt?: number) => {
    const audio = audioRef.current
    if (!audio) return
    setError(false)
    if (episode?.id === next.id) {
      if (typeof startAt === 'number') seek(startAt)
      if (audio.paused) startPlayback(audio)
      else if (typeof startAt !== 'number') audio.pause()
      return
    }
    if (episode) setPrevious({ episode, time: audio.currentTime || 0 })
    // Nothing playing means the player was closed, so `previous` is whatever
    // was closed — keep it, unless this call is the resume of that very thing.
    else if (previous?.episode.id === next.id) setPrevious(null)
    setEpisode(next)
    setCurrentTime(typeof startAt === 'number' ? startAt : 0)
    setDuration(0)
    pendingSeekRef.current = typeof startAt === 'number' ? startAt : null
    audio.src = next.audioUrl
    audio.load()
    startPlayback(audio)
  }, [episode, previous, seek, startPlayback])

  // Symmetric with playEpisode: going back stores the episode being left, so
  // the control flips between the two.
  const resumePrevious = useCallback(() => {
    if (previous) playEpisode(previous.episode, previous.time)
  }, [previous, playEpisode])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !episode) return
    if (audio.paused) {
      startPlayback(audio)
    } else {
      // Clear the intent too, so a buffering event does not restart what the
      // listener just stopped.
      wantsPlayRef.current = false
      audio.pause()
    }
  }, [episode, startPlayback])

  const close = useCallback(() => {
    const audio = audioRef.current
    // Read the position before dropping the source: load() resets currentTime.
    const at = audio?.currentTime || 0
    audio?.pause()
    if (audio) {
      audio.removeAttribute('src')
      audio.load()
    }
    pendingSeekRef.current = null
    // Closing is not discarding: remember the spot so the next thing played
    // still offers a way back to it.
    setPrevious(episode ? { episode, time: at } : null)
    setEpisode(null)
    setPlaying(false)
    setExpanded(false)
    setChaptersOpen(false)
    setError(false)
  }, [episode])

  // Jump to the start of a chapter. Going back mid-chapter restarts it first,
  // the way podcast apps behave.
  const skipChapter = useCallback((direction: 1 | -1) => {
    if (!chapters.length) return
    if (direction === 1) {
      const next = chapters[currentChapter + 1]
      if (next) seek(next.startTime)
      return
    }
    const here = chapters[currentChapter]
    if (here && currentTime - here.startTime > 3) {
      seek(here.startTime)
      return
    }
    const previousChapter = chapters[currentChapter - 1]
    seek(previousChapter ? previousChapter.startTime : 0)
  }, [chapters, currentChapter, currentTime, seek])

  useEffect(() => {
    document.body.toggleAttribute('data-player-active', Boolean(episode))
    return () => document.body.removeAttribute('data-player-active')
  }, [episode])

  // Share the one-overlay-at-a-time bus with the assistant drawer, the chapter
  // sheet and the mobile action sheet.
  useEffect(() => {
    const onOverlay = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail !== 'player-chapters') setChaptersOpen(false)
      if (detail !== 'player-sheet') setExpanded(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setChaptersOpen(false)
      setExpanded(false)
    }
    window.addEventListener('ui:overlay-open', onOverlay)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('ui:overlay-open', onOverlay)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    if (!episode || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.title,
      artist: 'Democracy Innovators Podcast',
      artwork: episode.coverUrl ? [{ src: episode.coverUrl }] : undefined,
    })
    navigator.mediaSession.setActionHandler('play', toggle)
    navigator.mediaSession.setActionHandler('pause', toggle)
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') seek(details.seekTime)
    })
    // Lock screen and desktop media keys get the same ±15s as the UI.
    navigator.mediaSession.setActionHandler('seekbackward', (details) => skipSeconds(-(details.seekOffset || SKIP_SECONDS)))
    navigator.mediaSession.setActionHandler('seekforward', (details) => skipSeconds(details.seekOffset || SKIP_SECONDS))
    const hasChapters = (episode.chapters || []).length > 0
    navigator.mediaSession.setActionHandler('nexttrack', hasChapters ? () => skipChapter(1) : null)
    navigator.mediaSession.setActionHandler('previoustrack', hasChapters ? () => skipChapter(-1) : null)
    return () => {
      for (const action of ['play', 'pause', 'seekto', 'seekbackward', 'seekforward', 'nexttrack', 'previoustrack'] as const) {
        navigator.mediaSession.setActionHandler(action, null)
      }
    }
  }, [episode, seek, toggle, skipChapter, skipSeconds])

  const value = useMemo(
    () => ({ episode, playing, currentTime, duration, error, chapters, currentChapter, previous, resumePrevious, playEpisode, toggle, seek, skipSeconds, close }),
    [episode, playing, currentTime, duration, error, chapters, currentChapter, previous, resumePrevious, playEpisode, toggle, seek, skipSeconds, close],
  )

  function applyRate(next: number) {
    setRate(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  function cycleRate() {
    applyRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])
  }

  function openOverlay(kind: 'player-sheet' | 'player-chapters') {
    window.dispatchEvent(new CustomEvent('ui:overlay-open', { detail: kind }))
    if (kind === 'player-sheet') setExpanded(true)
    else setChaptersOpen(true)
  }

  function onHandleDown(event: ReactPointerEvent<HTMLElement>) {
    dragRef.current = { from: event.clientY, moved: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onHandleMove(event: ReactPointerEvent<HTMLElement>) {
    if (!dragRef.current) return
    const moved = Math.max(0, event.clientY - dragRef.current.from)
    dragRef.current.moved = moved
    setDragY(moved)
  }

  function onHandleUp() {
    const moved = dragRef.current?.moved ?? 0
    dragRef.current = null
    setDragY(0)
    if (moved > DRAG_TO_CLOSE) setExpanded(false)
  }

  const chapterLabel = currentChapter >= 0 ? chapters[currentChapter].title : 'Chapters'

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget
          // A new source resets playbackRate in some browsers; keep the choice.
          audio.playbackRate = rate
          const pending = pendingSeekRef.current
          pendingSeekRef.current = null
          if (pending === null) return
          audio.currentTime = Math.max(0, Math.min(pending, audio.duration || pending))
          setCurrentTime(audio.currentTime)
          // The seek above can interrupt the play() issued when the source was
          // set, so ask again now that the position is right.
          if (wantsPlayRef.current && audio.paused) startPlayback(audio)
        }}
        onCanPlay={(event) => {
          const audio = event.currentTarget
          if (wantsPlayRef.current && audio.paused) startPlayback(audio)
        }}
        onEnded={() => setPlaying(false)}
        onError={() => { setError(true); setPlaying(false) }}
        onPause={() => setPlaying(false)}
        onPlay={() => { wantsPlayRef.current = false; setPlaying(true); setError(false) }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />
      {episode ? (
        <>
          <section className="persistent-player" aria-label="Podcast player">
            <div className="player-identity">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {episode.coverUrl ? <img alt="" src={episode.coverUrl} width={50} height={50} /> : <span aria-hidden="true" />}
              <div><small>Now playing</small><strong>{episode.title}</strong></div>
            </div>
            <Transport playing={playing} onToggle={toggle} onSkip={skipSeconds} />
            <Timeline currentTime={currentTime} duration={duration} chapters={chapters} onSeek={seek} />
            {chapters.length ? (
              <button
                className="player-chapter"
                type="button"
                onClick={() => (chaptersOpen ? setChaptersOpen(false) : openOverlay('player-chapters'))}
                aria-expanded={chaptersOpen}
                aria-label="Choose chapter"
              >
                <List aria-hidden="true" size={16} />
                <span className="player-chapter-label">{chapterLabel}</span>
              </button>
            ) : null}
            {previous ? (
              <button
                className="player-back"
                type="button"
                onClick={resumePrevious}
                title={`Back to “${previous.episode.title}” at ${formatTime(previous.time)}`}
                aria-label={`Back to ${previous.episode.title} at ${formatTime(previous.time)}`}
              >
                <Undo2 aria-hidden="true" size={16} />
                <span className="player-back-label">Back</span>
              </button>
            ) : null}
            <button className="player-rate" type="button" onClick={cycleRate} aria-label={`Playback speed ${rate} times`}><Gauge aria-hidden="true" size={16} /> {rate}×</button>
            <label className="player-volume"><Volume2 aria-hidden="true" size={17} /><span className="sr-only">Volume</span><input type="range" min="0" max="1" step="0.05" defaultValue="1" onChange={(event) => { if (audioRef.current) audioRef.current.volume = Number(event.target.value) }} /></label>
            <button
              className="player-expand"
              type="button"
              onClick={() => (expanded ? setExpanded(false) : openOverlay('player-sheet'))}
              aria-expanded={expanded}
              aria-label="Player settings"
            >
              <ChevronUp aria-hidden="true" />
            </button>
            <button className="player-close" type="button" onClick={close} aria-label="Close player"><X aria-hidden="true" /></button>
            {error ? <p className="player-error">Audio could not be played. <a href={episode.castopodUrl || 'https://podcast.democracyinnovators.com/@podcast'} target="_blank" rel="noreferrer">Open in Castopod ↗</a></p> : null}
            {chapters.length && chaptersOpen ? (
              <nav className="player-chapter-panel" aria-label="Chapters">
                <div className="player-chapter-panel-bar">
                  <p className="section-label">Chapters</p>
                  <span>
                    <button type="button" onClick={() => skipChapter(-1)} aria-label="Previous chapter"><SkipBack aria-hidden="true" size={15} /></button>
                    <button type="button" onClick={() => skipChapter(1)} disabled={currentChapter >= chapters.length - 1} aria-label="Next chapter"><SkipForward aria-hidden="true" size={15} /></button>
                  </span>
                </div>
                <ol>
                  {chapters.map((chapter, index) => (
                    <li key={chapter.startTime} className={index === currentChapter ? 'is-active' : undefined}>
                      <button
                        type="button"
                        aria-current={index === currentChapter ? 'true' : undefined}
                        onClick={() => {
                          seek(chapter.startTime)
                          setChaptersOpen(false)
                          if (audioRef.current?.paused) startPlayback(audioRef.current)
                        }}
                      >
                        <span className="chapter-index-time">{formatTimestamp(chapter.startTime)}</span>
                        <span className="chapter-index-title">{chapter.title}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}
          </section>

          {/* Advanced menu. A sheet rather than a taller bar, so it can size to
              its content and scroll — a 270px-tall bar left nothing on a phone
              held sideways. */}
          <div className={`player-sheet-scrim${expanded ? ' is-open' : ''}`} onClick={() => setExpanded(false)} aria-hidden="true" />
          <section
            className={`player-sheet${expanded ? ' is-open' : ''}`}
            style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
            role="dialog"
            aria-modal="true"
            aria-label="Player settings"
            aria-hidden={!expanded}
          >
            <div
              className="player-sheet-handle"
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
            >
              <span aria-hidden="true" />
              <button type="button" onClick={() => setExpanded(false)} aria-label="Close player settings"><X aria-hidden="true" size={18} /></button>
            </div>

            <div className="player-sheet-body">
              <div className="player-sheet-head">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {episode.coverUrl ? <img alt="" src={episode.coverUrl} width={128} height={128} /> : <span aria-hidden="true" />}
                <div>
                  <small>Now playing</small>
                  <strong>{episode.title}</strong>
                </div>
              </div>

              <Timeline currentTime={currentTime} duration={duration} chapters={chapters} onSeek={seek} />
              <Transport playing={playing} onToggle={toggle} onSkip={skipSeconds} />

              <div className="player-setting">
                <p className="section-label" id="player-speed-label">Speed</p>
                <div className="player-speeds" role="group" aria-labelledby="player-speed-label">
                  {RATES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={rate === value}
                      onClick={() => applyRate(value)}
                    >
                      {value}×
                    </button>
                  ))}
                </div>
              </div>

              {previous ? (
                <button className="player-sheet-back" type="button" onClick={() => { resumePrevious(); setExpanded(false) }}>
                  <Undo2 aria-hidden="true" size={16} />
                  <span>Back to “{previous.episode.title}”</span>
                  <span className="player-sheet-back-time">{formatTime(previous.time)}</span>
                </button>
              ) : null}

              {chapters.length ? (
                <div className="player-setting">
                  <p className="section-label">Chapters</p>
                  <ol className="player-sheet-chapters">
                    {chapters.map((chapter, index) => (
                      <li key={chapter.startTime} className={index === currentChapter ? 'is-active' : undefined}>
                        <button
                          type="button"
                          aria-current={index === currentChapter ? 'true' : undefined}
                          onClick={() => {
                            seek(chapter.startTime)
                            if (audioRef.current?.paused) startPlayback(audioRef.current)
                          }}
                        >
                          <span className="chapter-index-time">{formatTimestamp(chapter.startTime)}</span>
                          <span className="chapter-index-title">{chapter.title}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </PlayerContext.Provider>
  )
}
