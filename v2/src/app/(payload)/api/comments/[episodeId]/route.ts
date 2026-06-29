import config from '@payload-config'
import { getPayload } from 'payload'

const attempts = new Map<string, number>()

export async function GET(_request: Request, { params }: { params: Promise<{ episodeId: string }> }) {
  const episodeId = Number((await params).episodeId)
  if (!Number.isInteger(episodeId)) return Response.json({ error: 'Invalid episode.' }, { status: 400 })
  const payload = await getPayload({ config })
  const result = await payload.find({ collection: 'comments', limit: 100, sort: 'createdAt', where: { and: [{ episode: { equals: episodeId } }, { status: { equals: 'approved' } }] } })
  return Response.json({ comments: result.docs.map(({ id, name, message, createdAt }) => ({ id, name, message, createdAt })) })
}

export async function POST(request: Request, { params }: { params: Promise<{ episodeId: string }> }) {
  const episodeId = Number((await params).episodeId)
  const body = await request.json().catch(() => ({}))
  if (body.website) return Response.json({ ok: true })
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 1200) : ''
  if (!Number.isInteger(episodeId) || !name || message.length < 8) return Response.json({ error: 'Name and a comment of at least 8 characters are required.' }, { status: 400 })
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const lastAttempt = attempts.get(ip) || 0
  if (Date.now() - lastAttempt < 30_000) return Response.json({ error: 'Please wait before submitting another comment.' }, { status: 429 })
  attempts.set(ip, Date.now())
  const payload = await getPayload({ config })
  const episode = await payload.findByID({ collection: 'episodes', id: episodeId }).catch(() => null)
  if (!episode) return Response.json({ error: 'Episode not found.' }, { status: 404 })
  await payload.create({ collection: 'comments', data: { episode: episodeId, name, message, status: 'pending' } })
  return Response.json({ ok: true }, { status: 201 })
}
