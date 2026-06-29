'use client'

import { Headphones, Heart, Share2 } from 'lucide-react'
import type { MouseEvent } from 'react'

const supportUrl = 'https://www.paypal.com/ncp/payment/7KCR9XBSCQVMG'

export function MobileEpisodeBar({ title, url }: { title: string; url: string }) {
  const shareText = `${title} ${url}`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
  const blueskyUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`
  const fediverseUrl = `https://mastodonshare.com/?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`

  async function share(event: MouseEvent<HTMLElement>) {
    if (!navigator.share) return
    event.preventDefault()

    try {
      await navigator.share({ title, url })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      event.currentTarget.parentElement?.setAttribute('open', '')
    }
  }

  return (
    <nav aria-label="Episode actions" className="mobile-episode-bar">
      <details className="mobile-share-menu">
        <summary onClick={share}>
          <Share2 aria-hidden="true" size={19} strokeWidth={1.8} />
          <span>Share</span>
        </summary>
        <div className="mobile-share-panel">
          <p>Share this episode</p>
          <a href={whatsappUrl} rel="noopener noreferrer" target="_blank">WhatsApp <span>↗</span></a>
          <a href={telegramUrl} rel="noopener noreferrer" target="_blank">Telegram <span>↗</span></a>
          <a href={linkedinUrl} rel="noopener noreferrer" target="_blank">LinkedIn <span>↗</span></a>
          <a href={blueskyUrl} rel="noopener noreferrer" target="_blank">Bluesky <span>↗</span></a>
          <a href={fediverseUrl} rel="noopener noreferrer" target="_blank">Fediverse <span>↗</span></a>
        </div>
      </details>
      <a href="#episode-player">
        <Headphones aria-hidden="true" size={20} strokeWidth={1.8} />
        <span>Listen</span>
      </a>
      <a href={supportUrl} rel="noopener noreferrer" target="_blank">
        <Heart aria-hidden="true" size={19} strokeWidth={1.8} />
        <span>Support</span>
      </a>
    </nav>
  )
}
