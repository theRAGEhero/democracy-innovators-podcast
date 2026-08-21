import Link from 'next/link'

type EpisodeLink = { id: number | string; slug: string; title: string; excerpt?: string | null }

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
                <h3>{episode.title}</h3>
                {episode.excerpt ? <p>{episode.excerpt.slice(0, 140)}…</p> : null}
                <span className="text-link">Open conversation →</span>
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
