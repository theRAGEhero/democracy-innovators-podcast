import config from '@payload-config'
import { getPayload } from 'payload'

import { isRateLimitError, recordApiLimit } from '@/lib/api-limits'
import { activeModel, activeProvider, generateAnswer, isConfigured } from '@/lib/chat-provider'
import { SYSTEM_PROMPT, buildUserTurn, looksLikePromptLeak } from '@/lib/chat-prompt'
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

function evidenceItems(chunks: ReturnType<typeof selectEvidenceChunks>, question: string) {
  const terms = queryTerms(question)
  return chunks.map((chunk, index) => ({
    label: `S${index + 1}`,
    title: chunk.episodeTitle,
    url: `/episode/${chunk.episodeSlug}`,
    snippet: evidenceSnippet(chunk.text, terms, 1200),
  }))
}

export async function POST(request: Request) {
  if (isRateLimited(request)) return Response.json({ error: 'Too many questions. Please wait a minute.' }, { status: 429 })
  const body = await request.json().catch(() => ({}))
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : ''
  if (!question) return Response.json({ error: 'Question is required.' }, { status: 400 })
  // Embeddings are always Gemini; the answer comes from whichever provider is
  // selected. Both keys have to be present for the assistant to work.
  if (!process.env.GEMINI_API_KEY || !isConfigured()) {
    return Response.json({ error: 'The archive assistant is not configured.' }, { status: 503 })
  }

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
    if (!timedOut && isRateLimitError(error)) {
      await recordApiLimit({
        provider: 'gemini',
        operation: 'embedding',
        model: EMBEDDING_MODEL,
        status: 429,
        message: error instanceof Error ? error.message : String(error),
      })
      return Response.json({ error: 'The archive assistant has reached its usage limit. Please try again later.' }, { status: 429 })
    }
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

  const turn = { system: SYSTEM_PROMPT, user: buildUserTurn(question, evidenceItems(evidence, question)) }

  let generated: Awaited<ReturnType<typeof generateAnswer>>
  try {
    generated = await generateAnswer(turn, { signal: AbortSignal.timeout(30_000) })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    return Response.json({ error: timedOut ? 'The archive assistant timed out.' : 'The archive assistant is temporarily unavailable.' }, { status: timedOut ? 504 : 502 })
  }

  if (!generated.ok) {
    // Keep the upstream status: a 429 (quota) must be distinguishable from a
    // genuine provider failure, both for the visitor and for the admin tally.
    if (generated.status === 429 || isRateLimitError(generated.detail)) {
      await recordApiLimit({
        provider: activeProvider(),
        operation: 'chat',
        model: activeModel(),
        status: generated.status,
        message: generated.detail,
      })
      return Response.json({ error: 'The archive assistant has reached its usage limit. Please try again later.' }, { status: 429 })
    }
    return Response.json({ error: 'The model provider returned an error.' }, { status: 502 })
  }
  // Asking the model not to repeat its instructions is advice, and models do
  // comply with a direct request to. This is the part that does not depend on
  // the model behaving.
  const answer = looksLikePromptLeak(generated.answer)
    ? 'I can only answer questions about the published podcast archive.'
    : generated.answer
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
