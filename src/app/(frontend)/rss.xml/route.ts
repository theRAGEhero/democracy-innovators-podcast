import { getEpisodes } from '@/lib/content'
import { getServerSideURL } from '@/lib/getURL'

const xml = (value: string) =>
  value.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] || char)

export async function GET() {
  const { docs } = await getEpisodes(100)
  const origin = getServerSideURL()
  const feedUrl = `${origin}/rss.xml`

  const items = docs
    .map((episode) => {
      const url = `${origin}/episode/${episode.slug}`
      const topics = (episode.topics || [])
        .map((topic) => (topic && typeof topic === 'object' && 'name' in topic ? topic.name : null))
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
        .map((name) => `<category>${xml(name)}</category>`)
        .join('')
      const image = episode.featureImageUrl
        ? `<media:content url="${xml(episode.featureImageUrl)}" medium="image"/><media:thumbnail url="${xml(episode.featureImageUrl)}"/>`
        : ''
      return (
        `<item>` +
        `<title>${xml(episode.title)}</title>` +
        `<link>${url}</link>` +
        `<guid isPermaLink="true">${url}</guid>` +
        `<pubDate>${new Date(episode.publishedAt).toUTCString()}</pubDate>` +
        `<description>${xml(episode.excerpt || '')}</description>` +
        topics +
        image +
        `</item>`
      )
    })
    .join('')

  const lastBuild = docs[0]?.publishedAt ? new Date(docs[0].publishedAt).toUTCString() : new Date().toUTCString()

  const feed =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">` +
    `<channel>` +
    `<title>Democracy Innovators Podcast</title>` +
    `<link>${origin}</link>` +
    `<atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>` +
    `<description>Independent conversations about democracy, governance and civic technology.</description>` +
    `<language>en</language>` +
    `<lastBuildDate>${lastBuild}</lastBuildDate>` +
    `<ttl>60</ttl>` +
    `<image><url>${origin}/logo.png</url><title>Democracy Innovators Podcast</title><link>${origin}</link></image>` +
    items +
    `</channel></rss>`

  return new Response(feed, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600',
    },
  })
}
