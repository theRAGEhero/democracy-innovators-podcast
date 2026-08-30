import 'dotenv/config'

import fs from 'node:fs'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import type { Episode } from '@/payload-types'
import {
  chunkHash,
  chunkTranscript,
  chunkTurns,
  documentEmbeddingInput,
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL,
  embedText,
  type Turn,
  type TurnChunk,
} from '@/lib/archive-rag'
import { isRateLimitError, recordApiLimit } from '@/lib/api-limits'

// Gemini's free embedding tier caps requests per minute, so pace the calls and
// back off on 429 instead of aborting the whole run.
const REQUEST_DELAY_MS = Number(process.env.GEMINI_EMBEDDING_DELAY_MS || 800)
const MAX_EPISODES = Number(process.env.EMBEDDINGS_MAX_EPISODES || 1000)
const RATE_LIMIT_RETRIES = Number(process.env.GEMINI_EMBEDDING_RETRIES || 5)
const RATE_LIMIT_BACKOFF_MS = Number(process.env.GEMINI_EMBEDDING_BACKOFF_MS || 30_000)

/** Where import-deepgram.ts leaves the timed turns. */
const TURNS_DIR = 'runtime/deepgram'

type Passage = Partial<TurnChunk> & { text: string; sourceType: 'transcript' | 'deepgram' }

/**
 * The passages to index for one episode.
 *
 * Deepgram's turns when they exist, which is all 61 episodes with audio: those
 * cut on changes of speaker and carry the seconds they were said. The old fixed
 * window survives only as the fallback for an episode with a transcript and no
 * audio, where there is nothing to line the text up against.
 */
function passagesFor(slug: string, transcript: string): Passage[] {
  const file = path.join(TURNS_DIR, `${slug}.json`)
  if (fs.existsSync(file)) {
    try {
      const record = JSON.parse(fs.readFileSync(file, 'utf8')) as { turns?: Turn[] }
      const turns = record.turns || []
      if (turns.length) {
        return chunkTurns(turns).map((chunk) => ({ ...chunk, sourceType: 'deepgram' as const }))
      }
    } catch {
      // A damaged cache file should not stop the build; the window still works.
    }
  }
  return chunkTranscript(transcript).map((text) => ({ text, sourceType: 'transcript' as const }))
}

type ExistingChunk = {
  id: number | string
  textHash?: string | null
  episode?: number | Episode | null
  embeddingModel?: string | null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const isRateLimit = isRateLimitError

// Embed with exponential backoff so a per-minute quota pauses the run instead of
// killing it. Throws QUOTA_EXHAUSTED once the retries are spent.
async function embedWithRetry(
  input: string,
  log: (message: string) => void,
): Promise<number[]> {
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await embedText(input, {
        model: EMBEDDING_MODEL,
        dimension: EMBEDDING_DIMENSION,
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      if (!isRateLimit(error) || attempt === RATE_LIMIT_RETRIES) {
        if (isRateLimit(error)) throw new Error('QUOTA_EXHAUSTED')
        throw error
      }
      await recordApiLimit({
        provider: 'gemini',
        operation: 'embedding',
        model: EMBEDDING_MODEL,
        status: 429,
        message: error instanceof Error ? error.message : String(error),
      })
      const wait = RATE_LIMIT_BACKOFF_MS * (attempt + 1)
      log(`Rate limited by Gemini; waiting ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${RATE_LIMIT_RETRIES})`)
      await sleep(wait)
    }
  }
  throw new Error('QUOTA_EXHAUSTED')
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.')

  const payload = await getPayload({ config })
  const episodes = await payload.find({
    collection: 'episodes',
    depth: 0,
    limit: MAX_EPISODES,
    sort: 'publishedAt',
    where: { _status: { equals: 'published' } },
  })

  let created = 0
  let skipped = 0
  let removed = 0

  for (const episode of episodes.docs) {
    const transcript = episode.transcriptText?.trim()
    if (!transcript) continue

    const chunks = passagesFor(String(episode.slug || ''), transcript)
    const desiredHashes = new Set(
      chunks.map((chunk, chunkIndex) =>
        chunkHash({ episodeId: episode.id, chunkIndex, model: EMBEDDING_MODEL, text: chunk.text }),
      ),
    )

    const existing = await payload.find({
      collection: 'archive-chunks',
      depth: 0,
      limit: 1000,
      where: {
        and: [{ episode: { equals: episode.id } }, { embeddingModel: { equals: EMBEDDING_MODEL } }],
      },
    })
    const existingChunks = existing.docs as ExistingChunk[]
    const existingHashes = new Set(existingChunks.map((chunk) => chunk.textHash).filter(Boolean))

    for (const chunk of existingChunks) {
      if (!chunk.textHash || desiredHashes.has(chunk.textHash)) continue
      await payload.delete({ collection: 'archive-chunks', id: chunk.id, overrideAccess: true })
      removed += 1
    }

    for (const [chunkIndex, chunk] of chunks.entries()) {
      const textHash = chunkHash({ episodeId: episode.id, chunkIndex, model: EMBEDDING_MODEL, text: chunk.text })
      if (existingHashes.has(textHash)) {
        skipped += 1
        continue
      }

      const embedding = await embedWithRetry(
        documentEmbeddingInput(episode.title, chunk.text, chunk.speakerName),
        (message) => payload.logger.warn(message),
      )

      await payload.create({
        collection: 'archive-chunks',
        data: {
          episode: episode.id,
          episodeTitle: episode.title,
          episodeSlug: episode.slug,
          sourceType: chunk.sourceType,
          chunkIndex,
          text: chunk.text,
          textHash,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          speakerName: chunk.speakerName,
          timeline: chunk.timeline,
          embeddingModel: EMBEDDING_MODEL,
          embeddingDimension: embedding.length,
          embedding,
        },
        overrideAccess: true,
      })
      created += 1
      await sleep(REQUEST_DELAY_MS)
    }
  }

  payload.logger.info(`Embedding index complete: ${created} created, ${skipped} unchanged, ${removed} removed.`)
  process.exit(0)
}

main().catch((error) => {
  if (error instanceof Error && error.message === 'QUOTA_EXHAUSTED') {
    // Progress is persisted per chunk, so re-running later resumes where this
    // stopped. Exit 0 so scheduled runs don't look like hard failures.
    console.error('Gemini quota exhausted. Progress saved — re-run this command later to continue.')
    process.exit(0)
  }
  console.error(error)
  process.exit(1)
})
