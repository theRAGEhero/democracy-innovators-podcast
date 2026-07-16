import config from '@payload-config'
import { getPayload } from 'payload'

function isMissingMapTable(error: unknown) {
  let current = error

  while (current instanceof Error) {
    if (/no such table:\s*map_points\b/i.test(current.message)) return true
    current = current.cause
  }

  return false
}

export async function getMapPoints(limit = 500) {
  const payload = await getPayload({ config })
  try {
    return await payload.find({
      collection: 'map-points',
      depth: 1,
      limit,
      sort: ['kind', 'title'],
    })
  } catch (error) {
    if (!isMissingMapTable(error)) throw error

    return {
      docs: [],
      hasNextPage: false,
      hasPrevPage: false,
      limit,
      nextPage: null,
      page: 1,
      pagingCounter: 1,
      prevPage: null,
      totalDocs: 0,
      totalPages: 0,
    }
  }
}
