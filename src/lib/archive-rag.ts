import { createHash } from 'node:crypto'
import { createClient } from '@libsql/client'

export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2'
export const EMBEDDING_DIMENSION = Number(process.env.GEMINI_EMBEDDING_DIMENSION || 768)
export const MIN_RETRIEVAL_SCORE = Number(process.env.CHATBOT_MIN_RETRIEVAL_SCORE || 0.22)

const MAX_WORDS = 560
const OVERLAP_WORDS = 100
const WORD_RE = /[a-z0-9]+/gi

export type EmbeddedChunk = {
  id: number | string
  episodeId?: number | string
  episodeTitle: string
  episodeSlug: string
  chunkIndex: number
  text: string
  /** The stored JSON, when the chunk came from Payload. Chunks from
   *  loadEmbeddedChunks() arrive parsed and carry `vector` instead. */
  embedding?: unknown
  vector?: number[]
}

export type ScoredChunk = EmbeddedChunk & {
  score: number
  semanticScore: number
  lexicalScore: number
  vector: number[]
}

export function normalizeText(value = '') {
  return value.replace(/\s+/g, ' ').trim()
}

export function wordsFor(value: string) {
  return normalizeText(value).match(/\S+/g) || []
}

export function chunkTranscript(transcript: string, maxWords = MAX_WORDS, overlapWords = OVERLAP_WORDS) {
  const words = wordsFor(transcript)
  if (!words.length) return []
  if (words.length <= maxWords) return [words.join(' ')]

  const chunks: string[] = []
  const step = Math.max(maxWords - overlapWords, 1)
  for (let start = 0; start < words.length; start += step) {
    const chunk = words.slice(start, start + maxWords).join(' ')
    if (chunk) chunks.push(chunk)
    if (start + maxWords >= words.length) break
  }
  return chunks
}

export function chunkHash(input: { episodeId: number | string; chunkIndex: number; model: string; text: string }) {
  return createHash('sha256')
    .update(`${input.model}\n${input.episodeId}\n${input.chunkIndex}\n${normalizeText(input.text)}`)
    .digest('hex')
}

export function documentEmbeddingInput(title: string, text: string) {
  return `title: ${title || 'none'} | text: ${normalizeText(text)}`
}

export function questionEmbeddingInput(question: string) {
  return `task: question answering | query: ${normalizeText(question)}`
}

export async function embedText(input: string, options: { apiKey?: string; model?: string; dimension?: number; signal?: AbortSignal } = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.')

  const model = options.model || EMBEDDING_MODEL
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text: input }] },
      outputDimensionality: options.dimension || EMBEDDING_DIMENSION,
    }),
    signal: options.signal,
  })

  if (!response.ok) throw new Error(`Gemini embedding returned ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const result = await response.json()
  const vector = result?.embedding?.values || result?.embeddings?.[0]?.values || result?.embeddings?.[0]?.embedding?.values
  if (!Array.isArray(vector) || !vector.length) throw new Error('Gemini embedding response did not contain a vector.')
  return vector.map((value: unknown) => Number(value)).filter(Number.isFinite)
}

// Retrieval reads every chunk on every question. Going through the Payload ORM
// costs about 24ms per hydrated document — some twenty seconds for the 852
// chunks here — while the cosine that actually uses them takes 89ms. So the
// vectors are read straight from SQLite and kept parsed in memory.
//
// The cache lives in the process: with more than one instance each would hold
// its own copy, which is fine at this size but worth knowing.
type LoadedChunk = Required<Pick<EmbeddedChunk, 'id' | 'episodeId' | 'episodeTitle' | 'episodeSlug' | 'chunkIndex' | 'text' | 'vector'>>

let chunkCache: { key: string; chunks: LoadedChunk[] } | null = null

// One client for the process: opening a connection per question cost more than
// the invalidation query it was opened for.
let client: ReturnType<typeof createClient> | null = null

function db() {
  if (!client) client = createClient({ url: process.env.DATABASE_URL || 'file:./runtime/database/payload.db' })
  return client
}

/** Count plus latest edit: changes whenever embeddings:build touches the table,
 *  so a rebuild is picked up without restarting the container. */
async function cacheKey(client: ReturnType<typeof db>, model: string) {
  const result = await client.execute({
    sql: 'SELECT count(*) AS n, max(updated_at) AS latest FROM archive_chunks WHERE embedding_model = ?',
    args: [model],
  })
  const row = result.rows[0] as { n?: unknown; latest?: unknown }
  return `${String(row?.n ?? 0)}:${String(row?.latest ?? '')}`
}

export async function loadEmbeddedChunks(model = EMBEDDING_MODEL): Promise<LoadedChunk[]> {
  const connection = db()
  const key = `${model}|${await cacheKey(connection, model)}`
  if (chunkCache?.key === key) return chunkCache.chunks

  // The model filter is not optional: vectors from different models live in
  // the same table and comparing across them yields plausible nonsense.
  const result = await connection.execute({
    sql: `SELECT id, episode_id, episode_title, episode_slug, chunk_index, text, embedding
          FROM archive_chunks WHERE embedding_model = ?`,
    args: [model],
  })
  const chunks = result.rows.flatMap((row) => {
    const vector = parseEmbedding(row.embedding)
    if (!vector.length) return []
    return [{
      id: Number(row.id),
      episodeId: Number(row.episode_id),
      episodeTitle: String(row.episode_title || ''),
      episodeSlug: String(row.episode_slug || ''),
      chunkIndex: Number(row.chunk_index || 0),
      text: String(row.text || ''),
      vector,
    }]
  })
  chunkCache = { key, chunks }
  return chunks
}

/** Testing seam: forces the next load to reconnect and re-read. */
export function clearChunkCache() {
  chunkCache = null
  client = null
}

export function parseEmbedding(value: unknown) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(Number).filter(Number.isFinite)
    } catch {
      return []
    }
  }
  return []
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index]
    magA += a[index] * a[index]
    magB += b[index] * b[index]
  }
  if (!magA || !magB) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

export function queryTerms(question: string) {
  const stopWords = new Set(['about', 'after', 'also', 'does', 'from', 'guest', 'guests', 'have', 'into', 'said', 'says', 'that', 'their', 'this', 'what', 'when', 'where', 'which', 'with'])
  return (question.toLowerCase().match(WORD_RE) || []).filter((term) => term.length > 2 && !stopWords.has(term)).slice(0, 12)
}

export function lexicalMatchScore(chunk: EmbeddedChunk, terms: string[]) {
  if (!terms.length) return 0
  const haystack = `${chunk.episodeTitle} ${chunk.text}`.toLowerCase()
  const matches = terms.filter((term) => haystack.includes(term)).length
  return matches / terms.length
}

export function scoreChunks(chunks: EmbeddedChunk[], questionVector: number[], question: string) {
  const terms = queryTerms(question)
  return chunks
    .map((chunk) => {
      // Already parsed when it came from loadEmbeddedChunks(); parsing it again
      // per question is what the cache exists to avoid.
      const vector = chunk.vector ?? parseEmbedding(chunk.embedding)
      const semanticScore = cosineSimilarity(questionVector, vector)
      const lexicalScore = lexicalMatchScore(chunk, terms)
      const score = semanticScore + lexicalScore * 0.08
      return { ...chunk, vector, score, semanticScore, lexicalScore }
    })
    .filter((chunk) => chunk.vector.length === questionVector.length)
    .sort((a, b) => b.score - a.score)
}

export function selectEvidenceChunks(chunks: ScoredChunk[], limit = 8) {
  const selected: ScoredChunk[] = []
  const perEpisode = new Map<string, number>()

  for (const chunk of chunks) {
    const count = perEpisode.get(chunk.episodeSlug) || 0
    if (count >= 2) continue
    selected.push(chunk)
    perEpisode.set(chunk.episodeSlug, count + 1)
    if (selected.length >= limit) break
  }

  for (const chunk of chunks) {
    if (selected.length >= limit) break
    if (selected.some((selectedChunk) => selectedChunk.id === chunk.id)) continue
    selected.push(chunk)
  }

  return selected.sort((a, b) => b.score - a.score)
}

/** Occurrences to consider before giving up on precision: chunks run to a few
 *  thousand characters, so this is far above any real count. */
const MAX_TERM_HITS = 200

/**
 * Where the passage that actually answers the question begins.
 *
 * Taking the first occurrence of any single query word put the window on the
 * chunk's opening sentence almost every time — one incidental word, none of the
 * others, and the substance further down left out. Worse, that position sits
 * before the first speaker cue, so nothing could be attributed either.
 *
 * Instead, score each occurrence by how many *distinct* query words fall within
 * a window starting there, and take the densest.
 */
function densestWindow(lower: string, terms: string[], maxLength: number) {
  const hits: { term: string; index: number }[] = []
  for (const term of terms) {
    for (let index = lower.indexOf(term); index >= 0; index = lower.indexOf(term, index + term.length)) {
      hits.push({ term, index })
      if (hits.length >= MAX_TERM_HITS) break
    }
    if (hits.length >= MAX_TERM_HITS) break
  }
  if (!hits.length) return 0
  hits.sort((a, b) => a.index - b.index)

  let best = { index: hits[0].index, distinct: 0, count: 0 }
  for (const hit of hits) {
    const end = hit.index + maxLength
    const inside = hits.filter((other) => other.index >= hit.index && other.index < end)
    const distinct = new Set(inside.map((other) => other.term)).size
    // Ties go to the denser window, then to the earlier one — earlier text is
    // more likely to be the start of the thought rather than its tail.
    if (distinct > best.distinct || (distinct === best.distinct && inside.length > best.count)) {
      best = { index: hit.index, distinct, count: inside.length }
    }
  }
  return best.index
}

/** The snippet plus where it was cut from, so callers can tell which speaker
 *  turn the quote belongs to without searching for it again. */
export function locateEvidenceSnippet(text: string, terms: string[], maxLength = 280) {
  const clean = normalizeText(text)
  const lower = clean.toLowerCase()
  const firstMatch = densestWindow(lower, terms, maxLength)
  const start = Math.max(0, firstMatch - 90)
  const body = clean.slice(start, start + maxLength).trim()
  const snippet = `${start > 0 ? '...' : ''}${body}${start + maxLength < clean.length ? '...' : ''}`
  // `start` backs up 90 characters to give the quote some lead-in, which can
  // cross back over a speaker change. `matchAt` is where the answer actually
  // is, and it is the one to use when deciding who was talking.
  return { snippet, start, matchAt: firstMatch, clean }
}

export function evidenceSnippet(text: string, terms: string[], maxLength = 280) {
  return locateEvidenceSnippet(text, terms, maxLength).snippet
}
