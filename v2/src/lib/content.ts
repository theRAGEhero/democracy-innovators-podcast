import config from '@payload-config'
import { getPayload } from 'payload'

export async function getEpisodes(limit = 100) {
  const payload = await getPayload({ config })
  return payload.find({
    collection: 'episodes',
    depth: 2,
    limit,
    sort: '-publishedAt',
    where: { _status: { equals: 'published' } },
  })
}

export async function getEpisode(slug: string) {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'episodes',
    depth: 2,
    limit: 1,
    where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] },
  })
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
  })
}

export async function getGuest(slug: string) {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'guests',
    depth: 2,
    limit: 1,
    where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] },
  })
  return result.docs[0] ?? null
}

export async function getTopics() {
  const payload = await getPayload({ config })
  return payload.find({ collection: 'topics', limit: 100, sort: 'name' })
}
