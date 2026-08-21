import config from '@payload-config'
import { getPayload, type Where } from 'payload'

const emptyResult = { docs: [], totalDocs: 0, limit: 0, totalPages: 0, page: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null }

export async function getEpisodes(limit = 100, page = 1, topicSlug?: string) {
  const payload = await getPayload({ config })
  const filters: Where[] = [{ _status: { equals: 'published' } }]
  if (topicSlug) filters.push({ 'topics.slug': { equals: topicSlug } })
  return payload.find({
    collection: 'episodes',
    depth: 2,
    limit,
    page,
    sort: '-publishedAt',
    where: filters.length > 1 ? { and: filters } : filters[0],
  }).catch(() => emptyResult)
}

// Episodes sharing a topic or a guest with the given one, newest first, plus the
// adjacent episodes in the archive for previous/next navigation.
export async function getEpisodeContext(episode: {
  id: number | string
  publishedAt?: string | null
  topics?: unknown[] | null
  guests?: unknown[] | null
}) {
  const payload = await getPayload({ config })
  const idOf = (item: unknown) => (item && typeof item === 'object' ? (item as { id: number }).id : item)
  const topicIds = (episode.topics || []).map(idOf).filter(Boolean)
  const guestIds = (episode.guests || []).map(idOf).filter(Boolean)

  const relatedWhere: Where[] = []
  if (topicIds.length) relatedWhere.push({ topics: { in: topicIds } })
  if (guestIds.length) relatedWhere.push({ guests: { in: guestIds } })

  const [related, previous, next] = await Promise.all([
    relatedWhere.length
      ? payload
          .find({
            collection: 'episodes',
            depth: 0,
            limit: 4,
            sort: '-publishedAt',
            where: {
              and: [
                { _status: { equals: 'published' } },
                { id: { not_equals: episode.id } },
                { or: relatedWhere },
              ],
            },
          })
          .catch(() => emptyResult)
      : Promise.resolve(emptyResult),
    episode.publishedAt
      ? payload
          .find({
            collection: 'episodes',
            depth: 0,
            limit: 1,
            sort: '-publishedAt',
            where: {
              and: [
                { _status: { equals: 'published' } },
                { publishedAt: { less_than: episode.publishedAt } },
              ],
            },
          })
          .catch(() => emptyResult)
      : Promise.resolve(emptyResult),
    episode.publishedAt
      ? payload
          .find({
            collection: 'episodes',
            depth: 0,
            limit: 1,
            sort: 'publishedAt',
            where: {
              and: [
                { _status: { equals: 'published' } },
                { publishedAt: { greater_than: episode.publishedAt } },
              ],
            },
          })
          .catch(() => emptyResult)
      : Promise.resolve(emptyResult),
  ])

  return {
    related: related.docs.slice(0, 3),
    previous: previous.docs[0] ?? null,
    next: next.docs[0] ?? null,
  }
}

export async function getEpisode(slug: string) {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'episodes',
    depth: 2,
    limit: 1,
    where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] },
  }).catch(() => emptyResult)
  return result.docs[0] ?? null
}

export async function getGuests(limit = 100) {
  const payload = await getPayload({ config })
  return payload.find({
    collection: 'guests',
    depth: 2,
    limit,
    sort: 'name',
    where: { _status: { equals: 'published' } },
  }).catch(() => emptyResult)
}

export async function getGuest(slug: string) {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'guests',
    depth: 2,
    limit: 1,
    where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] },
  }).catch(() => emptyResult)
  return result.docs[0] ?? null
}

export async function getTopics() {
  const payload = await getPayload({ config })
  return payload.find({ collection: 'topics', limit: 100, sort: 'name' }).catch(() => emptyResult)
}
