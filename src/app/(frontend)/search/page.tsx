import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'
import { ArchiveSearchTabs } from '@/components/ArchiveSearchTabs'

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search episodes, guests and full transcripts across the Democracy Innovators archive.',
  alternates: { canonical: '/search' },
}

const RESULT_LIMIT = 60

// Pull a short window of transcript text around the first match so a result
// explains *why* it matched, not just that it did.
function snippetAround(text: string | null | undefined, query: string): string | null {
  if (!text) return null
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) return null
  const start = Math.max(0, index - 90)
  const end = Math.min(text.length, index + query.length + 130)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

// Split a snippet on the query so the matched words can be marked.
function highlight(snippet: string, query: string) {
  const lower = snippet.toLowerCase()
  const needle = query.toLowerCase()
  const parts: Array<{ text: string; match: boolean }> = []
  let cursor = 0
  let found = lower.indexOf(needle, cursor)
  while (found >= 0) {
    if (found > cursor) parts.push({ text: snippet.slice(cursor, found), match: false })
    parts.push({ text: snippet.slice(found, found + query.length), match: true })
    cursor = found + query.length
    found = lower.indexOf(needle, cursor)
  }
  if (cursor < snippet.length) parts.push({ text: snippet.slice(cursor), match: false })
  return parts
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = (await searchParams).q?.trim() || ''
  const payload = await getPayload({ config })

  const [episodes, guests] = query
    ? await Promise.all([
        payload
          .find({
            collection: 'episodes',
            limit: RESULT_LIMIT,
            sort: '-publishedAt',
            // Skip relationship hydration and unused columns: results only need
            // enough to render a title and a snippet.
            depth: 0,
            select: { title: true, slug: true, excerpt: true, transcriptText: true },
            where: {
              and: [
                { _status: { equals: 'published' } },
                { or: [{ title: { like: query } }, { excerpt: { like: query } }, { transcriptText: { like: query } }] },
              ],
            },
          })
          .catch(() => ({ docs: [], totalDocs: 0 })),
        payload
          .find({
            collection: 'guests',
            limit: RESULT_LIMIT,
            sort: 'name',
            depth: 0,
            select: { name: true, slug: true, summary: true },
            where: {
              and: [
                { _status: { equals: 'published' } },
                { or: [{ name: { like: query } }, { summary: { like: query } }, { conversationSummary: { like: query } }] },
              ],
            },
          })
          .catch(() => ({ docs: [], totalDocs: 0 })),
      ])
    : [
        { docs: [], totalDocs: 0 },
        { docs: [], totalDocs: 0 },
      ]

  const total = (episodes.totalDocs || 0) + (guests.totalDocs || 0)

  return (
    <main className="inner-page">
      <header className="page-intro">
        <p className="section-label">Archive search</p>
        <h1>Find an idea</h1>
        <ArchiveSearchTabs query={query} />
      </header>

      {query ? (
        total > 0 ? (
          <div className="search-results">
            <p className="section-label">
              {total} result{total === 1 ? '' : 's'} for “{query}”
            </p>

            {guests.docs.map((guest) => (
              <Link href={`/people/${guest.slug}`} key={`g-${guest.id}`}>
                <span>Person</span>
                <strong>{guest.name}</strong>
                {guest.summary ? <em className="search-snippet">{guest.summary.slice(0, 180)}</em> : null}
              </Link>
            ))}

            {episodes.docs.map((episode) => {
              const snippet =
                snippetAround(episode.transcriptText, query) || (episode.excerpt ? episode.excerpt.slice(0, 200) : null)
              return (
                <Link href={`/episode/${episode.slug}`} key={`e-${episode.id}`}>
                  <span>Episode</span>
                  <strong>{episode.title}</strong>
                  {snippet ? (
                    <em className="search-snippet">
                      {highlight(snippet, query).map((part, index) =>
                        part.match ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
                      )}
                    </em>
                  ) : null}
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="search-empty">
            <h2>No results for “{query}”</h2>
            <p>
              Try a broader term, a guest’s name, or browse the{' '}
              <Link href="/topics">topics</Link>, <Link href="/episodes">episodes</Link> or{' '}
              <Link href="/people">people</Link> instead.
            </p>
          </div>
        )
      ) : (
        <div className="search-empty">
          <p>
            Search across every episode title, guest profile and full transcript. Or start from the{' '}
            <Link href="/topics">topics</Link>.
          </p>
        </div>
      )}
    </main>
  )
}
