import { getEpisodes } from '@/lib/content'
import { getServerSideURL } from '@/lib/getURL'

const xml = (value: string) => value.replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] || char)

export async function GET() {
  const { docs } = await getEpisodes()
  const origin = getServerSideURL()
  const items = docs.map((episode) => `<item><title>${xml(episode.title)}</title><link>${origin}/episode/${episode.slug}</link><guid>${origin}/episode/${episode.slug}</guid><pubDate>${new Date(episode.publishedAt).toUTCString()}</pubDate><description>${xml(episode.excerpt || '')}</description></item>`).join('')
  const feed = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Democracy Innovators Podcast</title><link>${origin}</link><description>Conversations about democracy, governance and civic technology.</description><language>en</language>${items}</channel></rss>`
  return new Response(feed, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } })
}
