'use client'

import { useEffect, useRef } from 'react'

import { usePlayer, type PlayerEpisode } from './PlayerProvider'

// Opens the player at the moment named in the URL, so a link copied from a
// citation in the archive assistant lands on the sentence it was copied for.
//
// `?t=<seconds>`, the convention people already know from YouTube. Draws
// nothing: it exists for the effect.
export function PlayFromQuery({ episode }: { episode: PlayerEpisode | null }) {
  const player = usePlayer()
  // Once per visit. Without this a re-render would drag a listener who has
  // moved on back to the minute the link named.
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !episode) return
    // Read from location rather than useSearchParams: that hook forces a
    // <Suspense> boundary and ties into static generation, and this is a purely
    // client-side concern.
    const raw = new URLSearchParams(window.location.search).get('t')
    if (raw === null) return
    done.current = true
    const seconds = Number(raw)
    // A nonsense value is not worth acting on, and not worth complaining about.
    if (!Number.isFinite(seconds) || seconds < 0) return
    // Browsers refuse playback without a gesture, so this may well end up
    // paused. That is fine: the episode is loaded and sitting at the right
    // moment, one tap away. See the NotAllowedError handling in PlayerProvider.
    player.playEpisode(episode, seconds)
  }, [episode, player])

  return null
}
