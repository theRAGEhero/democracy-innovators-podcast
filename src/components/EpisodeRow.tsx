import type { Episode } from '@/payload-types'
import Image from 'next/image'
import Link from 'next/link'
import { PlayEpisodeButton } from './PlayEpisodeButton'
import { extractCastopodEpisodeUrl } from '@/lib/embeds'
import { normalizeChapters } from '@/lib/chapters'

const dateFormatter = new Intl.DateTimeFormat('en', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function EpisodeRow({ episode, index }: { episode: Episode; index: number }) {
  const playerEpisode = episode.audioUrl ? {
    id: episode.id,
    slug: episode.slug,
    title: episode.title,
    audioUrl: episode.audioUrl,
    coverUrl: episode.squareCoverUrl || episode.featureImageUrl,
    castopodUrl: extractCastopodEpisodeUrl(episode.html),
    chapters: normalizeChapters(episode.chapters),
  } : null
  return (
    <article className="episode-row">
      <span className="index-number">{String(index + 1).padStart(2, '0')}</span>
      <Link className="episode-image-link" href={`/episode/${episode.slug}`}>
        {episode.featureImageUrl ? (
          <Image
            alt={`${episode.title} cover art`}
            className="episode-image"
            src={episode.featureImageUrl}
            width={640}
            height={360}
            sizes="(max-width: 620px) 100vw, (max-width: 900px) 170px, 230px"
          />
        ) : (
          <span aria-hidden="true" className="image-fallback" />
        )}
      </Link>
      <div className="episode-row-copy">
        <p className="meta-line">
          {episode.publishedAt ? dateFormatter.format(new Date(episode.publishedAt)) : 'Archive'}
        </p>
        <h2>
          <Link href={`/episode/${episode.slug}`}>{episode.title}</Link>
        </h2>
        {episode.excerpt ? <p>{episode.excerpt}</p> : null}
        <div className="episode-row-actions">
          {playerEpisode ? <PlayEpisodeButton episode={playerEpisode} label="Play" /> : null}
          <Link className="text-link" href={`/episode/${episode.slug}`}>Open conversation <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </article>
  )
}
