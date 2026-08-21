'use client'

import { BookOpen, Globe, Headphones, Heart, MoreHorizontal, Pause, Play, Send, Share2, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useArchiveAssistant } from './Chatbot'
import { usePlayer, type PlayerEpisode } from './PlayerProvider'

import { episodeListenPlatforms, fediverseProfile, shareTargets, supportUrl } from '@/lib/platforms'

const shareIcons: Record<string, typeof Share2> = { Telegram: Send, Fediverse: Globe }

export function MobileEpisodeBar({ episode, title, url }: { episode: PlayerEpisode | null; title: string; url: string }) {
  const assistant = useArchiveAssistant()
  const player = usePlayer()
  const [more, setMore] = useState(false)
  const active = episode && player.episode?.id === episode.id
  // The episode's own Castopod page when we have it, the show profile otherwise.
  const listen = episodeListenPlatforms.map((platform) =>
    platform.label.startsWith('Fediverse')
      ? { label: 'Fediverse (Castopod)', href: episode?.castopodUrl || fediverseProfile }
      : platform,
  )
  const shares = shareTargets(title, url)

  useEffect(() => {
    const onOverlay = (event: Event) => { if ((event as CustomEvent).detail !== 'episode-more') setMore(false) }
    window.addEventListener('ui:overlay-open', onOverlay)
    return () => window.removeEventListener('ui:overlay-open', onOverlay)
  }, [])

  function openMore() {
    window.dispatchEvent(new CustomEvent('ui:overlay-open', { detail: 'episode-more' }))
    setMore(true)
  }

  return (
    <>
      <nav aria-label="Episode actions" className="mobile-episode-bar contextual-dock">
        {episode ? <button type="button" onClick={() => player.playEpisode(episode)}>{active && player.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}<span>{active && player.playing ? 'Pause' : 'Play'}</span></button> : <a href="#episode-player"><Play aria-hidden="true" /><span>Listen</span></a>}
        <button type="button" onClick={() => window.dispatchEvent(new Event('episode:open-chapters'))}><BookOpen aria-hidden="true" /><span>Chapters</span></button>
        <button type="button" onClick={assistant.open}><Sparkles aria-hidden="true" /><span>Ask</span></button>
        <button type="button" onClick={openMore} aria-expanded={more}><MoreHorizontal aria-hidden="true" /><span>More</span></button>
      </nav>
      <div className={`action-sheet-scrim${more ? ' is-open' : ''}`} onClick={() => setMore(false)} aria-hidden="true" />
      <section className={`action-sheet${more ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="More episode actions" aria-hidden={!more}>
        <header><div><small>Episode tools</small><strong>Listen, share and support</strong></div><button type="button" onClick={() => setMore(false)} aria-label="Close"><X aria-hidden="true" /></button></header>
        <div className="action-sheet-links">
          <p className="section-label">Listen on</p>
          {listen.map((platform) => (
            <a href={platform.href} key={platform.label} target="_blank" rel="noreferrer">
              <Headphones aria-hidden="true" /> {platform.label} <span>↗</span>
            </a>
          ))}
          <p className="section-label">Share</p>
          {shares.map((target) => {
            const Icon = shareIcons[target.label] || Share2
            return (
              <a href={target.href} key={target.label} target="_blank" rel="noreferrer">
                <Icon aria-hidden="true" /> {target.label} <span>↗</span>
              </a>
            )
          })}
          <p className="section-label">Support</p>
          <a href={supportUrl} target="_blank" rel="noreferrer"><Heart aria-hidden="true" /> Support the podcast <span>↗</span></a>
        </div>
      </section>
    </>
  )
}
