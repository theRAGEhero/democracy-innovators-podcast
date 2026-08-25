export type CastopodFeedEpisode = {
  slug: string
  title: string
  audioUrl: string
  pageUrl: string
  coverUrl: string
  /** Podcasting 2.0 <podcast:chapters>. Castopod publishes one per episode, so
   *  chapters can be read from the feed instead of from files handed over by
   *  hand — see scripts/import-castopod-chapters.ts. */
  chaptersUrl: string
}

const FEED_URLS = [
  'https://podcast.democracyinnovators.com/@podcast/feed.xml',
  'https://podcast.democracyinnovators.com/@democracyinnovatorspodcastITA/feed.xml',
]

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function tag(item: string, name: string) {
  return decodeXml(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '')
}

export function parseCastopodFeed(xml: string): CastopodFeedEpisode[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap((match) => {
    const item = match[1]
    const audioUrl = decodeXml(item.match(/<enclosure\b[^>]*\burl=["']([^"']+)["'][^>]*>/i)?.[1] || '')
    const pageUrl = tag(item, 'link') || tag(item, 'guid')
    const slug = pageUrl.match(/\/@[^/]+\/episodes\/([^/?#<]+)/i)?.[1] || ''
    const title = tag(item, 'title')
    // Castopod ships a square cover per episode; the site's own feature image
    // is 16:9, which is the wrong shape for a player tile or an OS media card.
    const coverUrl = decodeXml(item.match(/<itunes:image\b[^>]*\bhref=["']([^"']+)["']/i)?.[1] || '')
    const chaptersUrl = decodeXml(item.match(/<podcast:chapters\b[^>]*\burl=["']([^"']+)["']/i)?.[1] || '')
    return audioUrl && slug && title ? [{ slug, title, audioUrl, pageUrl, coverUrl, chaptersUrl }] : []
  })
}

export async function fetchCastopodFeed() {
  const feeds = await Promise.all(FEED_URLS.map(async (url) => {
    const response = await fetch(url, { headers: { Accept: 'application/rss+xml, application/xml;q=0.9' } })
    if (!response.ok) throw new Error(`Castopod feed returned ${response.status}: ${url}`)
    return parseCastopodFeed(await response.text())
  }))
  return feeds.flat()
}

function normalizedTitle(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function findCastopodEpisode(episode: { slug?: string | null; title: string; html?: string | null }, feed: CastopodFeedEpisode[]) {
  const embeddedSlug = (episode.html || '').match(/podcast\.democracyinnovators\.com\/@[^/]+\/episodes\/([^"'/?#]+)/i)?.[1]
  const slugMatch = feed.find((item) => item.slug === embeddedSlug) || feed.find((item) => item.slug === episode.slug)
  if (slugMatch) return { item: slugMatch, matchedBy: 'slug' as const }
  const title = normalizedTitle(episode.title)
  const matches = feed.filter((item) => normalizedTitle(item.title) === title)
  return matches.length === 1 ? { item: matches[0], matchedBy: 'title' as const } : null
}
