import { isRateLimitError, recordApiLimit } from '@/lib/api-limits'
import { activeModel, activeProvider, isConfigured, streamAnswer } from '@/lib/chat-provider'
import { SYSTEM_PROMPT, buildUserTurn, looksLikePromptLeak, sanitizeHistory } from '@/lib/chat-prompt'
import { describeCitation, loadCitedEpisodes, locateChunk, turnBoundedQuote } from '@/lib/citation-context'
import {
  EMBEDDING_MODEL,
  MIN_RETRIEVAL_SCORE,
  embedText,
  evidenceSnippet,
  locateEvidenceSnippet,
  loadEmbeddedChunks,
  questionEmbeddingInput,
  queryTerms,
  scoreChunks,
  selectEvidenceChunks,
} from '@/lib/archive-rag'

const WINDOW_MS = 60_000
const MAX_REQUESTS = 10
const requests = new Map<string, { count: number; resetAt: number }>()

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
  // Retrieval stays keyed to the current question: the history is there to
  // resolve what a follow-up refers to, not to widen the search.
  const history = sanitizeHistory(body.history)
  // Embeddings are always Gemini; the answer comes from whichever provider is
  // selected. Both keys have to be present for the assistant to work.
  if (!process.env.GEMINI_API_KEY || !isConfigured()) {
    return Response.json({ error: 'The archive assistant is not configured.' }, { status: 503 })
  }

  // Straight from SQLite and cached: the ORM charged ~20s per question to hand
  // back vectors the cosine then used for 89ms. See loadEmbeddedChunks().
  const chunks = await loadEmbeddedChunks(EMBEDDING_MODEL)

  if (!chunks.length) {
    return Response.json({
      answer: 'The archive assistant has not been indexed yet. Build transcript embeddings first, then ask again.',
      citations: [],
    })
  }

  let questionVector: number[]
  try {
    // The call normally answers in a second or two; fifteen only meant a slow
    // day at the provider froze the visitor before anything appeared.
    questionVector = await embedText(questionEmbeddingInput(question), { model: EMBEDDING_MODEL, signal: AbortSignal.timeout(8_000) })
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

  const ranked = scoreChunks(chunks, questionVector, question)
  const evidence = selectEvidenceChunks(ranked.filter((chunk) => chunk.score >= MIN_RETRIEVAL_SCORE), 8)

  if (!evidence.length) {
    return Response.json({
      answer: 'I could not find strong enough evidence for that in the published archive.',
      citations: [],
    })
  }

  const terms = queryTerms(question)
  const episodes = await loadCitedEpisodes(evidence.map((chunk) => Number(chunk.episodeId)))
  const citations = evidence.map((chunk, index) => {
    const episode = episodes.get(Number(chunk.episodeId))
    // `clean`, not `chunk.text`: matchAt indexes the normalised text, and the
    // raw text still has its line breaks, so mixing the two put the offsets in
    // the wrong place and attributed quotes to whoever happened to be nearby.
    const { snippet, matchAt, clean } = locateEvidenceSnippet(chunk.text, terms)
    // Prefer the quote cut to its own turn: it is the only version that can
    // carry a name honestly. Where the turn is too short to quote, the wider
    // passage is still shown, but anonymously.
    // Attribute against the whole transcript where we can find the chunk in it:
    // the cue naming the speaker is often in the chunk before this one.
    const absolute = episode?.transcript ? locateChunk(episode.transcript, clean, matchAt) : null
    const source = absolute === null ? clean : episode!.transcript
    const offset = absolute ?? matchAt
    const quote = turnBoundedQuote(source, offset)
    const context = describeCitation({
      text: source,
      snippetStart: offset,
      chunkIndex: chunk.chunkIndex,
      chapters: episode?.chapters || [],
      transcriptWords: episode?.transcriptWords,
    })
    return {
      label: `S${index + 1}`,
      title: chunk.episodeTitle,
      url: `/episode/${chunk.episodeSlug}`,
      snippet: quote ?? snippet,
      score: Number(chunk.score.toFixed(4)),
      ...context,
      speaker: quote ? context.speaker : undefined,
      // Only sent when there is something to play; the client uses its presence
      // to decide whether to offer "listen".
      episode: episode?.audioUrl
        ? {
            id: episode.id,
            slug: episode.slug,
            title: episode.title,
            audioUrl: episode.audioUrl,
            coverUrl: episode.coverUrl,
            chapters: episode.chapters,
          }
        : undefined,
    }
  })

  const turn = {
    system: SYSTEM_PROMPT,
    user: buildUserTurn(question, evidenceItems(evidence, question)),
    history,
  }

  let stream: Awaited<ReturnType<typeof streamAnswer>>
  try {
    stream = await streamAnswer(turn, { signal: AbortSignal.timeout(30_000) })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    return Response.json({ error: timedOut ? 'The archive assistant timed out.' : 'The archive assistant is temporarily unavailable.' }, { status: timedOut ? 504 : 502 })
  }

  if (!stream.ok) {
    // Keep the upstream status: a 429 (quota) must be distinguishable from a
    // genuine provider failure, both for the visitor and for the admin tally.
    if (stream.status === 429 || isRateLimitError(stream.detail)) {
      await recordApiLimit({
        provider: activeProvider(),
        operation: 'chat',
        model: activeModel(),
        status: stream.status,
        message: stream.detail,
      })
      return Response.json({ error: 'The archive assistant has reached its usage limit. Please try again later.' }, { status: 429 })
    }
    return Response.json({ error: 'The model provider returned an error.' }, { status: 502 })
  }

  const deltas = stream.deltas
  const encoder = new TextEncoder()
  const event = (name: string, data: unknown) => encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)

  const sseBody = new ReadableStream({
    async start(controller) {
      // Citations first: they were ready before the model was called, so the
      // visitor can be reading the sources while the answer is still arriving.
      controller.enqueue(event('citations', { citations, provider: activeProvider(), model: activeModel() }))
      let answer = ''
      try {
        for await (const delta of deltas) {
          answer += delta
          // Checked on the accumulated text, not at the end: by then the
          // instructions would already be on screen. Advice to the model is not
          // the guarantee — this is.
          if (looksLikePromptLeak(answer)) {
            controller.enqueue(event('replace', { answer: 'I can only answer questions about the published podcast archive.' }))
            answer = ''
            break
          }
          controller.enqueue(event('token', { text: delta }))
        }
        controller.enqueue(event('done', {}))
      } catch {
        controller.enqueue(event('error', { error: 'The archive assistant was interrupted.' }))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(sseBody, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform matters behind the proxy: buffering the stream would undo
      // the point of streaming it.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
