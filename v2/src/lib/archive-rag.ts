import { createHash } from 'node:crypto'

export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2'
export const EMBEDDING_DIMENSION = Number(process.env.GEMINI_EMBEDDING_DIMENSION || 768)
export const MIN_RETRIEVAL_SCORE = Number(process.env.CHATBOT_MIN_RETRIEVAL_SCORE || 0.22)

const MAX_WORDS = 560
const OVERLAP_WORDS = 100
const WORD_RE = /[a-z0-9]+/gi

export type EmbeddedChunk = {
  id: number | string
  episodeTitle: string
  episodeSlug: string
  chunkIndex: number
  text: string
  embedding: unknown
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
      const vector = parseEmbedding(chunk.embedding)
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

export function evidenceSnippet(text: string, terms: string[], maxLength = 280) {
  const clean = normalizeText(text)
  const lower = clean.toLowerCase()
  const firstMatch = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(0, firstMatch - 90)
  const snippet = clean.slice(start, start + maxLength).trim()
  return `${start > 0 ? '...' : ''}${snippet}${start + maxLength < clean.length ? '...' : ''}`
}
