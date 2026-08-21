'use client'

import { Pause, Play } from 'lucide-react'
import { usePlayer, type PlayerEpisode } from './PlayerProvider'

export function PlayEpisodeButton({ episode, className = 'episode-play-button', label = 'Play episode' }: { episode: PlayerEpisode; className?: string; label?: string }) {
  const player = usePlayer()
  const active = player.episode?.id === episode.id
  const playing = active && player.playing
  return (
    <button className={className} type="button" onClick={() => player.playEpisode(episode)} aria-label={playing ? `Pause ${episode.title}` : `${label}: ${episode.title}`}>
      {playing ? <Pause aria-hidden="true" size={17} /> : <Play aria-hidden="true" size={17} />}
      <span>{playing ? 'Pause' : active ? 'Resume' : label}</span>
    </button>
  )
}
