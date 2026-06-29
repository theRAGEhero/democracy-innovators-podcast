import type { Episode } from '@/payload-types'
import Link from 'next/link'

const dateFormatter = new Intl.DateTimeFormat('en', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function EpisodeRow({ episode, index }: { episode: Episode; index: number }) {
  return (
    <article className="episode-row">
      <span className="index-number">{String(index + 1).padStart(2, '0')}</span>
      <Link className="episode-image-link" href={`/episode/${episode.slug}`}>
        {episode.featureImageUrl ? (
          // Remote legacy artwork remains external until it is copied into Payload media.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="episode-image" loading="lazy" src={episode.featureImageUrl} />
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
        <Link className="text-link" href={`/episode/${episode.slug}`}>
          Open conversation <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  )
}
