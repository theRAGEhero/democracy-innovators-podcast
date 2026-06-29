import config from '@payload-config'
import { getPayload } from 'payload'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const WINDOW_MS = 60_000
const MAX_REQUESTS = 10
const requests = new Map<string, { count: number; resetAt: number }>()
const stopWords = new Set(['about', 'discuss', 'discussed', 'does', 'from', 'guest', 'guests', 'have', 'said', 'says', 'that', 'their', 'this', 'what', 'when', 'where', 'which', 'with'])

function isRateLimited(request: Request) {
  const client = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown'
  const now = Date.now()
  const current = requests.get(client)
  if (!current || current.resetAt <= now) {
    requests.set(client, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  current.count += 1
  return current.count > MAX_REQUESTS
}

export async function POST(request: Request) {
  if (isRateLimited(request)) return Response.json({ error: 'Too many questions. Please wait a minute.' }, { status: 429 })
  const body = await request.json().catch(() => ({}))
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : ''
  if (!question) return Response.json({ error: 'Question is required.' }, { status: 400 })
  if (!process.env.GEMINI_API_KEY) return Response.json({ error: 'The archive assistant is not configured.' }, { status: 503 })

  const payload = await getPayload({ config })
  const terms = (question.toLowerCase().match(/[a-z0-9]+/g) || []).filter((term) => term.length > 2 && !stopWords.has(term)).slice(0, 6)
  const queries = terms.length ? terms : [question]
  const [episodes, guests] = await Promise.all([
    payload.find({ collection: 'episodes', limit: 5, where: { or: queries.flatMap((query) => [{ title: { like: query } }, { excerpt: { like: query } }, { transcriptText: { like: query } }]) } }),
    payload.find({ collection: 'guests', limit: 3, where: { or: queries.flatMap((query) => [{ name: { like: query } }, { summary: { like: query } }, { conversationSummary: { like: query } }]) } }),
  ])
  const citations = [...episodes.docs.map((episode) => ({ title: episode.title, url: `/episode/${episode.slug}`, text: episode.transcriptText?.slice(0, 3500) || episode.excerpt || '' })), ...guests.docs.map((guest) => ({ title: guest.name, url: `/people/${guest.slug}`, text: `${guest.summary || ''}\n${guest.conversationSummary || ''}` }))]
  if (!citations.length) return Response.json({ answer: 'I could not find relevant material in the published archive.', citations: [] })
  const sources = citations.map((source, index) => `[S${index + 1}] ${source.title}\n${source.text}`).join('\n\n')
  const prompt = `Answer only from the supplied podcast archive sources. Cite factual statements with [S1], [S2], and say clearly when the archive does not contain an answer. Keep the response concise.\n\nQuestion: ${question}\n\nSources:\n${sources}`
  let response: Response
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } } }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    return Response.json({ error: timedOut ? 'The archive assistant timed out.' : 'The archive assistant is temporarily unavailable.' }, { status: timedOut ? 504 : 502 })
  }
  if (!response.ok) return Response.json({ error: 'The model provider returned an error.' }, { status: 502 })
  const result = await response.json()
  const answer = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('\n').trim()
  return Response.json({ answer: answer || 'No answer returned.', citations: citations.map(({ title, url }) => ({ title, url })) })
}
