import { createClient } from '@libsql/client'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearChunkCache, loadEmbeddedChunks } from '@/lib/archive-rag'

// A throwaway database per test: the retrieval cache is the thing under test,
// so it must never see the real archive.
let dir: string
let url: string

async function seed(rows: { id: number; model: string; vector: number[]; text?: string; updated?: string }[]) {
  const db = createClient({ url })
  await db.execute(`CREATE TABLE IF NOT EXISTS archive_chunks (
    id integer PRIMARY KEY, episode_id integer, episode_title text, episode_slug text,
    chunk_index integer, text text, embedding text, embedding_model text, updated_at text)`)
  for (const row of rows) {
    await db.execute({
      sql: `INSERT OR REPLACE INTO archive_chunks
            (id, episode_id, episode_title, episode_slug, chunk_index, text, embedding, embedding_model, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      args: [row.id, 1, 'An episode', 'an-episode', row.id, row.text ?? 'some text',
             JSON.stringify(row.vector), row.model, row.updated ?? '2026-01-01T00:00:00.000Z'],
    })
  }
  db.close()
}

describe('embedded chunk loading', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rag-'))
    url = `file:${join(dir, 'test.db')}`
    vi.stubEnv('DATABASE_URL', url)
    clearChunkCache()
  })

  afterEach(() => {
    clearChunkCache()
    vi.unstubAllEnvs()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns the stored vectors, already parsed', async () => {
    await seed([{ id: 1, model: 'model-a', vector: [0.1, 0.2, 0.3] }])
    const chunks = await loadEmbeddedChunks('model-a')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].vector).toEqual([0.1, 0.2, 0.3])
    expect(chunks[0].episodeSlug).toBe('an-episode')
  })

  it('never mixes vectors from another embedding model', async () => {
    // Comparing across models produces plausible nonsense rather than an error,
    // which is exactly why this has a test.
    await seed([
      { id: 1, model: 'model-a', vector: [1, 0] },
      { id: 2, model: 'model-b', vector: [0, 1] },
    ])
    expect(await loadEmbeddedChunks('model-a')).toHaveLength(1)
    clearChunkCache()
    expect(await loadEmbeddedChunks('model-b')).toHaveLength(1)
  })

  it('serves the same array on a second call instead of re-reading', async () => {
    await seed([{ id: 1, model: 'model-a', vector: [0.5] }])
    const first = await loadEmbeddedChunks('model-a')
    const second = await loadEmbeddedChunks('model-a')
    expect(second).toBe(first)
  })

  it('notices a new chunk without needing a restart', async () => {
    await seed([{ id: 1, model: 'model-a', vector: [0.5] }])
    expect(await loadEmbeddedChunks('model-a')).toHaveLength(1)
    await seed([{ id: 2, model: 'model-a', vector: [0.6] }])
    expect(await loadEmbeddedChunks('model-a')).toHaveLength(2)
  })

  it('notices a rebuilt chunk, where the count does not change', async () => {
    await seed([{ id: 1, model: 'model-a', vector: [0.5], updated: '2026-01-01T00:00:00.000Z' }])
    expect((await loadEmbeddedChunks('model-a'))[0].vector).toEqual([0.5])
    await seed([{ id: 1, model: 'model-a', vector: [0.9], updated: '2026-02-02T00:00:00.000Z' }])
    expect((await loadEmbeddedChunks('model-a'))[0].vector).toEqual([0.9])
  })

  it('skips rows whose embedding cannot be parsed', async () => {
    await seed([{ id: 1, model: 'model-a', vector: [0.5] }])
    const db = createClient({ url })
    await db.execute("UPDATE archive_chunks SET embedding = 'not json' WHERE id = 1")
    db.close()
    clearChunkCache()
    expect(await loadEmbeddedChunks('model-a')).toHaveLength(0)
  })
})
