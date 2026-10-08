import Image from 'next/image'
import Link from 'next/link'

type EpisodeLink = {
  id: number | string
  slug: string
  title: string
  excerpt?: string | null
  featureImageUrl?: string | null
}

// "Keep listening" block: episodes sharing a topic or guest, plus previous/next
// navigation through the archive. Gives every episode page onward links.
export function RelatedEpisodes({
  related,
  previous,
  next,
}: {
  related: EpisodeLink[]
  previous: EpisodeLink | null
  next: EpisodeLink | null
}) {
  if (!related.length && !previous && !next) return null

  return (
    <section className="related-episodes" aria-labelledby="related-heading">
      {related.length ? (
        <>
          <p className="section-label">Keep listening</p>
          <h2 id="related-heading">Related conversations</h2>
          <div className="related-grid">
            {related.map((episode) => (
              <Link className="related-card" href={`/episode/${episode.slug}`} key={episode.id}>
                {/* A div, not a link: the whole card is already the anchor, and
                    <a> takes transparent content so block elements are valid
                    here. Shares .episode-image with the archive rows so covers
                    get the same crop and dark-mode treatment everywhere. */}
                <div className="related-card-media">
                  {episode.featureImageUrl ? (
                    <Image
                      alt={`${episode.title} cover art`}
                      className="episode-image"
                      src={episode.featureImageUrl}
                      width={640}
                      height={360}
                      sizes="(max-width: 900px) 100vw, 380px"
                    />
                  ) : (
                    <span aria-hidden="true" className="image-fallback" />
                  )}
                </div>
                <div className="related-card-body">
                  <h3>{episode.title}</h3>
                  {episode.excerpt ? <p>{episode.excerpt.slice(0, 140)}…</p> : null}
                  <span className="text-link">Open conversation →</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {previous || next ? (
        <nav className="episode-pager" aria-label="Episode navigation">
          {previous ? (
            <Link className="episode-pager-prev" href={`/episode/${previous.slug}`} rel="prev">
              <span>← Previous episode</span>
              <strong>{previous.title}</strong>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link className="episode-pager-next" href={`/episode/${next.slug}`} rel="next">
              <span>Next episode →</span>
              <strong>{next.title}</strong>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  )
}
