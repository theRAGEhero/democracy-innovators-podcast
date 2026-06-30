import config from '@payload-config'
import { getPayload } from 'payload'

export async function getMapPoints(limit = 500) {
  const payload = await getPayload({ config })
  return payload.find({
    collection: 'map-points',
    depth: 1,
    limit,
    sort: ['kind', 'title'],
  })
}
