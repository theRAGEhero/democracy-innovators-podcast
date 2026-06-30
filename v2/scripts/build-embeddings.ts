import 'dotenv/config'

import config from '@payload-config'
import { getPayload } from 'payload'

import type { Episode } from '@/payload-types'
import { chunkHash, chunkTranscript, documentEmbeddingInput, EMBEDDING_DIMENSION, EMBEDDING_MODEL, embedText } from '@/lib/archive-rag'

const REQUEST_DELAY_MS = Number(process.env.GEMINI_EMBEDDING_DELAY_MS || 150)
const MAX_EPISODES = Number(process.env.EMBEDDINGS_MAX_EPISODES || 1000)

type ExistingChunk = {
  id: number | string
  textHash?: string | null
  episode?: number | Episode | null
  embeddingModel?: string | null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

    const chunks = chunkTranscript(transcript)
    const desiredHashes = new Set(
      chunks.map((text, chunkIndex) => chunkHash({ episodeId: episode.id, chunkIndex, model: EMBEDDING_MODEL, text })),
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

    for (const [chunkIndex, text] of chunks.entries()) {
      const textHash = chunkHash({ episodeId: episode.id, chunkIndex, model: EMBEDDING_MODEL, text })
      if (existingHashes.has(textHash)) {
        skipped += 1
        continue
      }

      const embedding = await embedText(documentEmbeddingInput(episode.title, text), {
        model: EMBEDDING_MODEL,
        dimension: EMBEDDING_DIMENSION,
        signal: AbortSignal.timeout(30_000),
      })

      await payload.create({
        collection: 'archive-chunks',
        data: {
          episode: episode.id,
          episodeTitle: episode.title,
          episodeSlug: episode.slug,
          sourceType: 'transcript',
          chunkIndex,
          text,
          textHash,
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
  console.error(error)
  process.exit(1)
})
