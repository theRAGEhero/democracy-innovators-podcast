import { getEpisodes, getGuests, getTopics } from '@/lib/content'
import { getServerSideURL } from '@/lib/getURL'
import type { MetadataRoute } from 'next'

// The Docker build runs against an empty build.db, so a statically generated
// sitemap would ship with only the fixed pages. Build it per request instead.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getServerSideURL()
  const [{ docs: episodes }, { docs: guests }, { docs: topics }] = await Promise.all([getEpisodes(), getGuests(), getTopics()])
  // Stable "site last updated" (newest episode) so fixed pages don't report a
  // fresh timestamp on every crawl.
  const siteUpdated = episodes.reduce<Date | undefined>((latest, item) => {
    const updated = new Date(item.updatedAt)
    return !latest || updated > latest ? updated : latest
  }, undefined)
  const fixed = ['', '/episodes', '/people', '/topics', '/map', '/listen', '/about', '/contact', '/subscribe', '/privacy'].map((path) => ({ url: `${origin}${path}`, lastModified: siteUpdated }))
  return [...fixed, ...episodes.map((item) => ({ url: `${origin}/episode/${item.slug}`, lastModified: new Date(item.updatedAt) })), ...guests.map((item) => ({ url: `${origin}/people/${item.slug}`, lastModified: new Date(item.updatedAt) })), ...topics.map((item) => ({ url: `${origin}/topics/${item.slug}`, lastModified: new Date(item.updatedAt) }))]
}
