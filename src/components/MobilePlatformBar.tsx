'use client'

import Link from 'next/link'
import { Headphones, ListMusic, Search, Send } from 'lucide-react'
import { usePlayer, type PlayerEpisode } from './PlayerProvider'

export function MobilePlatformBar({ latest }: { latest: PlayerEpisode | null }) {
  const player = usePlayer()
  return (
    <nav aria-label="Home actions" className="mobile-platform-bar contextual-dock">
      {latest ? <button type="button" onClick={() => player.playEpisode(latest)}><Headphones aria-hidden="true" /><span>{player.episode?.id === latest.id && player.playing ? 'Pause' : 'Latest'}</span></button> : <Link href="/episodes"><Headphones aria-hidden="true" /><span>Latest</span></Link>}
      <Link href="/episodes"><ListMusic aria-hidden="true" /><span>Episodes</span></Link>
      <Link href="/search"><Search aria-hidden="true" /><span>Search</span></Link>
      <Link href="/listen"><Send aria-hidden="true" /><span>Follow</span></Link>
    </nav>
  )
}
