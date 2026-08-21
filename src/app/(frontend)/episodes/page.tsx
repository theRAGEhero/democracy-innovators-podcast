import { EpisodeRow } from '@/components/EpisodeRow'
import { getEpisodes, getTopics } from '@/lib/content'
import { getServerSideURL } from '@/lib/getURL'
import { collectionJsonLd } from '@/lib/seo'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Episodes',
  description: 'Browse every Democracy Innovators Podcast conversation and transcript.',
  alternates: { canonical: '/episodes' },
}

export const revalidate = 3600

const PER_PAGE = 12

export default async function EpisodesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; topic?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const topicSlug = params.topic?.trim() || ''

  const [{ docs: allTopics }, result] = await Promise.all([
    getTopics(),
    getEpisodes(PER_PAGE, page, topicSlug || undefined),
  ])

  const episodes = result.docs
  const total = result.totalDocs || 0
  const totalPages = result.totalPages || 1
  const activeTopic = allTopics.find((topic) => topic.slug === topicSlug)
  const origin = getServerSideURL()
  const jsonLd = collectionJsonLd({
    url: `${origin}/episodes`,
    name: 'Episodes',
    items: episodes.map((episode) => ({ name: episode.title, url: `${origin}/episode/${episode.slug}` })),
  })

  const hrefFor = (targetPage: number) => {
    const query = new URLSearchParams()
    if (topicSlug) query.set('topic', topicSlug)
    if (targetPage > 1) query.set('page', String(targetPage))
    const qs = query.toString()
    return `/episodes${qs ? `?${qs}` : ''}`
  }

  return (
    <main className="inner-page">
      <script dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} type="application/ld+json" />
      <header className="page-intro">
        <p className="section-label">
          Archive · {total} conversation{total === 1 ? '' : 's'}
          {activeTopic ? ` in ${activeTopic.name}` : ''}
        </p>
        <h1>Episodes</h1>
        <p>Interviews and field notes from people building new forms of democratic practice.</p>
      </header>

      <nav className="episode-filters" aria-label="Filter episodes by topic">
        <Link href="/episodes" aria-current={!topicSlug ? 'true' : undefined} className={!topicSlug ? 'is-active' : undefined}>
          All
        </Link>
        {allTopics.map((topic) => (
          <Link
            key={topic.id}
            href={`/episodes?topic=${topic.slug}`}
            aria-current={topicSlug === topic.slug ? 'true' : undefined}
            className={topicSlug === topic.slug ? 'is-active' : undefined}
          >
            {topic.name}
          </Link>
        ))}
      </nav>
      <div className="archive-search-callout"><span>Looking for a guest, project, or phrase from a transcript?</span><Link href="/search">Search the archive →</Link></div>

      {episodes.length ? (
        <>
          <div className="episode-list archive-list">
            {episodes.map((episode, index) => (
              <EpisodeRow episode={episode} index={(page - 1) * PER_PAGE + index} key={episode.id} />
            ))}
          </div>

          {totalPages > 1 ? (
            <nav className="archive-pager" aria-label="Pagination">
              {page > 1 ? (
                <Link href={hrefFor(page - 1)} rel="prev">
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="archive-pager-status">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={hrefFor(page + 1)} rel="next">
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      ) : (
        <div className="search-empty">
          <h2>No episodes here yet</h2>
          <p>
            {topicSlug ? (
              <>
                Nothing filed under this topic yet. <Link href="/episodes">See all episodes</Link>.
              </>
            ) : (
              <>
                The archive could not be loaded. Try again, or <Link href="/contact">let us know</Link>.
              </>
            )}
          </p>
        </div>
      )}
    </main>
  )
}
