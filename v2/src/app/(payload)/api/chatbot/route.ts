import config from '@payload-config'
import { getPayload } from 'payload'

import {
  EMBEDDING_MODEL,
  MIN_RETRIEVAL_SCORE,
  embedText,
  evidenceSnippet,
  questionEmbeddingInput,
  queryTerms,
  scoreChunks,
  selectEvidenceChunks,
} from '@/lib/archive-rag'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const WINDOW_MS = 60_000
const MAX_REQUESTS = 10
const MAX_CHUNKS_TO_SCAN = Number(process.env.CHATBOT_MAX_CHUNKS_TO_SCAN || 5000)
const requests = new Map<string, { count: number; resetAt: number }>()

type ArchiveChunkDoc = {
  id: number | string
  episodeTitle: string
  episodeSlug: string
  chunkIndex: number
  text: string
  embedding: unknown
}

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

function sourcePrompt(chunks: ReturnType<typeof selectEvidenceChunks>, question: string) {
  const terms = queryTerms(question)
  return chunks
    .map((chunk, index) => {
      const snippet = evidenceSnippet(chunk.text, terms, 1200)
      return `[S${index + 1}] ${chunk.episodeTitle}\nURL: /episode/${chunk.episodeSlug}\nEvidence: ${snippet}`
    })
    .join('\n\n')
}

export async function POST(request: Request) {
  if (isRateLimited(request)) return Response.json({ error: 'Too many questions. Please wait a minute.' }, { status: 429 })
  const body = await request.json().catch(() => ({}))
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : ''
  if (!question) return Response.json({ error: 'Question is required.' }, { status: 400 })
  if (!process.env.GEMINI_API_KEY) return Response.json({ error: 'The archive assistant is not configured.' }, { status: 503 })

  const payload = await getPayload({ config })
  const chunks = await payload.find({
    collection: 'archive-chunks',
    depth: 0,
    limit: MAX_CHUNKS_TO_SCAN,
    sort: '-updatedAt',
    where: { embeddingModel: { equals: EMBEDDING_MODEL } },
    overrideAccess: true,
  })

  if (!chunks.docs.length) {
    return Response.json({
      answer: 'The archive assistant has not been indexed yet. Build transcript embeddings first, then ask again.',
      citations: [],
    })
  }

  let questionVector: number[]
  try {
    questionVector = await embedText(questionEmbeddingInput(question), { model: EMBEDDING_MODEL, signal: AbortSignal.timeout(15_000) })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    return Response.json({ error: timedOut ? 'The archive assistant timed out.' : 'The archive assistant is temporarily unavailable.' }, { status: timedOut ? 504 : 502 })
  }

  const ranked = scoreChunks(chunks.docs as ArchiveChunkDoc[], questionVector, question)
  const evidence = selectEvidenceChunks(ranked.filter((chunk) => chunk.score >= MIN_RETRIEVAL_SCORE), 8)

  if (!evidence.length) {
    return Response.json({
      answer: 'I could not find strong enough evidence for that in the published archive.',
      citations: [],
    })
  }

  const sources = sourcePrompt(evidence, question)
  const prompt = `You are the Democracy Innovators Podcast archive assistant. Answer only from the supplied evidence. Cite factual claims with source markers like [S1]. If the evidence does not answer the question, say that clearly and do not infer beyond it. Keep the answer concise and precise.\n\nQuestion: ${question}\n\nEvidence:\n${sources}`

  let response: Response
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 900, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    return Response.json({ error: timedOut ? 'The archive assistant timed out.' : 'The archive assistant is temporarily unavailable.' }, { status: timedOut ? 504 : 502 })
  }

  if (!response.ok) return Response.json({ error: 'The model provider returned an error.' }, { status: 502 })
  const result = await response.json()
  const answer = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('\n').trim()
  const terms = queryTerms(question)

  return Response.json({
    answer: answer || 'No answer returned.',
    citations: evidence.map((chunk, index) => ({
      label: `S${index + 1}`,
      title: chunk.episodeTitle,
      url: `/episode/${chunk.episodeSlug}`,
      snippet: evidenceSnippet(chunk.text, terms),
      score: Number(chunk.score.toFixed(4)),
    })),
  })
}
