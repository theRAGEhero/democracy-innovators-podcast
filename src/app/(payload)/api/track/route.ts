import config from '@payload-config'
import { getPayload } from 'payload'

// Cookieless visit counter endpoint. Accepts a path, increments an aggregate
// per-path counter. Deliberately stores nothing that could identify a visitor
// (no cookies, no IP, no user agent) so it requires no consent. See /privacy.

const MAX_PATH_LENGTH = 512

function normalizePath(input: unknown): string | null {
  if (typeof input !== 'string') return null
  let path = input.trim()
  if (!path.startsWith('/')) return null
  // Drop query string and hash; keep only the pathname.
  path = path.split(/[?#]/)[0]
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  if (path.length === 0 || path.length > MAX_PATH_LENGTH) return null
  return path
}

export async function POST(request: Request) {
  let body: { path?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body.' }, { status: 400 })
  }

  const path = normalizePath(body?.path)
  if (!path) return Response.json({ error: 'Invalid path.' }, { status: 400 })

  try {
    const payload = await getPayload({ config })
    const existing = await payload.find({
      collection: 'page-views',
      where: { path: { equals: path } },
      limit: 1,
      overrideAccess: true,
    })

    if (existing.docs.length > 0) {
      const doc = existing.docs[0]
      await payload.update({
        collection: 'page-views',
        id: doc.id,
        data: { count: (doc.count || 0) + 1 },
        overrideAccess: true,
      })
    } else {
      await payload.create({
        collection: 'page-views',
        data: { path, count: 1 },
        overrideAccess: true,
      })
    }

    return Response.json({ ok: true })
  } catch {
    // Counting is best-effort; never surface an error to the visitor.
    return Response.json({ ok: false }, { status: 200 })
  }
}
