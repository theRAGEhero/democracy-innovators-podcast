import { getEpisodes, getGuests, getTopics } from '@/lib/content'
import { getServerSideURL } from '@/utilities/getURL'
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getServerSideURL()
  const [{ docs: episodes }, { docs: guests }, { docs: topics }] = await Promise.all([getEpisodes(), getGuests(), getTopics()])
  const fixed = ['', '/episodes', '/people', '/topics', '/about', '/subscribe', '/privacy'].map((path) => ({ url: `${origin}${path}`, lastModified: new Date() }))
  return [...fixed, ...episodes.map((item) => ({ url: `${origin}/episode/${item.slug}`, lastModified: new Date(item.updatedAt) })), ...guests.map((item) => ({ url: `${origin}/people/${item.slug}`, lastModified: new Date(item.updatedAt) })), ...topics.map((item) => ({ url: `${origin}/topics/${item.slug}`, lastModified: new Date(item.updatedAt) }))]
}
