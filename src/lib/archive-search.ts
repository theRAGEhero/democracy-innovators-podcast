import { createClient } from '@libsql/client'

import {
  EMBEDDING_MODEL,
  MIN_RETRIEVAL_SCORE,
  embedText,
  loadEmbeddedChunks,
  locateEvidenceSnippet,
  questionEmbeddingInput,
  queryTerms,
  scoreChunks,
  selectEvidenceChunks,
  timeForOffset,
} from '@/lib/archive-rag'
import { chapterForTime, findCues, turnBoundedQuote } from '@/lib/citation-context'
import { chapterAnchorId, normalizeChapters, type Chapter } from '@/lib/chapters'

// Search over the archive, in two modes with one answer shape.
//
// Keyword goes to an FTS5 index and costs nothing, which is what makes it
// safe to offer publicly. Semantic embeds the query, which is one Gemini call
// against a daily budget that took three days to index this archive — so it
// lives behind a key and is not the default.

export type Passage = {
  text: string
  episodeTitle: string
  episodeSlug: string
  /** Seconds into the episode where the quoted words begin, when known. */
  startTime: number | null
  speaker: string | null
  chapter: { id: string; title: string; startTime: number } | null
  /** Path on this site that opens the episode at that second. */
  url: string
  score: number
}

let client: ReturnType<typeof createClient> | null = null

function db() {
  if (!client) client = createClient({ url: process.env.DATABASE_URL || 'file:./runtime/database/payload.db' })
  return client
}

/** Testing seam, mirroring clearChunkCache in archive-rag. */
export function closeSearchClient() {
  client = null
  indexReady = null
}

let indexReady: Promise<void> | null = null

function countOf(row: unknown): number {
  return Number((row as { n?: unknown } | undefined)?.n ?? 0)
}

/**
 * Build the keyword index if it is not already there.
 *
 * This is derived data — every row can be rebuilt from archive_chunks — so it
 * lives here rather than in a migration. A migration would have to be applied
 * by hand on a server where the deploy is already fragile, and would be absent
 * from the test database, which builds its schema by push.
 */
export async function ensureSearchIndex(): Promise<void> {
  if (!indexReady) indexReady = buildIndex().catch((error) => {
    // A failed build must not be cached as done, or every later search sees a
    // table that is not there.
    indexReady = null
    throw error
  })
  return indexReady
}

async function buildIndex() {
  const connection = db()
  // External content: the FTS table holds only the terms and points back at
  // archive_chunks by rowid, so the transcript is not stored twice.
  await connection.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS archive_chunks_fts USING fts5(
      text, episode_title,
      content='archive_chunks', content_rowid='id', tokenize='unicode61'
    )`)

  for (const trigger of [
    `CREATE TRIGGER IF NOT EXISTS archive_chunks_fts_ai AFTER INSERT ON archive_chunks BEGIN
       INSERT INTO archive_chunks_fts(rowid, text, episode_title) VALUES (new.id, new.text, new.episode_title);
     END`,
    `CREATE TRIGGER IF NOT EXISTS archive_chunks_fts_ad AFTER DELETE ON archive_chunks BEGIN
       INSERT INTO archive_chunks_fts(archive_chunks_fts, rowid, text, episode_title)
       VALUES ('delete', old.id, old.text, old.episode_title);
     END`,
    `CREATE TRIGGER IF NOT EXISTS archive_chunks_fts_au AFTER UPDATE ON archive_chunks BEGIN
       INSERT INTO archive_chunks_fts(archive_chunks_fts, rowid, text, episode_title)
       VALUES ('delete', old.id, old.text, old.episode_title);
       INSERT INTO archive_chunks_fts(rowid, text, episode_title) VALUES (new.id, new.text, new.episode_title);
     END`,
  ]) {
    await connection.execute(trigger)
  }

  if (await needsRebuild(connection)) {
    await connection.execute(`INSERT INTO archive_chunks_fts(archive_chunks_fts) VALUES ('rebuild')`)
  }
}

/**
 * Does the index need building?
 *
 * Not by `count(*) FROM archive_chunks_fts`: on an external-content table that
 * reads through to the content table, so it equals the row count whether or
 * not a single term has been indexed. Trusting it meant the rebuild never ran
 * and every search quietly found nothing.
 *
 * `_docsize` holds one row per indexed document, so it answers exactly — and
 * comparing it against the passages also repairs an index left half-built.
 */
async function needsRebuild(connection: ReturnType<typeof db>): Promise<boolean> {
  const rows = await connection.execute('SELECT count(*) AS n FROM archive_chunks')
  const indexed = await connection.execute('SELECT count(*) AS n FROM archive_chunks_fts_docsize')
  return countOf(rows.rows[0]) !== countOf(indexed.rows[0])
}

/** Force a rebuild even when the counts happen to agree. */
export async function rebuildSearchIndex(): Promise<number> {
  indexReady = null
  await ensureSearchIndex()
  const connection = db()
  await connection.execute(`INSERT INTO archive_chunks_fts(archive_chunks_fts) VALUES ('rebuild')`)
  const indexed = await connection.execute('SELECT count(*) AS n FROM archive_chunks_fts')
  return countOf(indexed.rows[0])
}

/**
 * Turn what a person typed into something FTS5 will accept.
 *
 * MATCH has its own grammar: an apostrophe or a lone double quote is a syntax
 * error, and OR / NOT / NEAR are operators. Every term is therefore quoted,
 * which makes it a literal, and the terms are joined with AND. A question can
 * then never be a malformed query, and never reach the parser as an operator.
 */
export function toMatchQuery(input: string): string | null {
  const terms = String(input || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1)
    .slice(0, 12)
  if (!terms.length) return null
  return terms.map((term) => `"${term}"`).join(' AND ')
}

function chapterFor(chapters: Chapter[], seconds: number | null) {
  if (seconds === null || !chapters.length) return null
  const found = chapterForTime(chapters, seconds)
  if (!found) return null
  return {
    id: chapterAnchorId(found.index, found.chapter.title),
    title: found.chapter.title,
    startTime: found.chapter.startTime,
  }
}

/** The deep link convention the site already uses, from citation-share. */
function linkFor(slug: string, seconds: number | null) {
  return seconds === null ? `/episode/${slug}` : `/episode/${slug}?t=${Math.floor(seconds)}`
}

async function chaptersBySlug(slugs: string[]): Promise<Map<string, Chapter[]>> {
  const unique = [...new Set(slugs)].filter(Boolean)
  if (!unique.length) return new Map()
  const placeholders = unique.map(() => '?').join(',')
  const result = await db().execute({
    sql: `SELECT slug, chapters FROM episodes WHERE slug IN (${placeholders})`,
    args: unique,
  })
  const map = new Map<string, Chapter[]>()
  for (const row of result.rows) {
    let raw: unknown = row.chapters
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw)
      } catch {
        raw = null
      }
    }
    map.set(String(row.slug), normalizeChapters(raw))
  }
  return map
}

export async function searchKeyword(query: string, limit = 8): Promise<Passage[]> {
  const match = toMatchQuery(query)
  if (!match) return []
  await ensureSearchIndex()

  const result = await db().execute({
    // bm25 returns a smaller number for a better match; negating it puts the
    // score on the same "higher is better" footing as the semantic path.
    sql: `SELECT c.text, c.episode_title, c.episode_slug, c.start_time, c.speaker_name, c.timeline,
                 bm25(archive_chunks_fts) AS rank
          FROM archive_chunks_fts
          JOIN archive_chunks c ON c.id = archive_chunks_fts.rowid
          WHERE archive_chunks_fts MATCH ?
          ORDER BY rank
          LIMIT ?`,
    args: [match, Math.max(1, Math.min(limit, 25))],
  })

  const chapters = await chaptersBySlug(result.rows.map((row) => String(row.episode_slug)))
  const terms = queryTerms(query)

  return result.rows.map((row) => {
    const text = String(row.text || '')
    const { snippet, matchAt, clean } = locateEvidenceSnippet(text, terms, 280)
    let timeline: [number, number, string | null][] = []
    try {
      timeline = row.timeline ? JSON.parse(String(row.timeline)) : []
    } catch {
      timeline = []
    }
    const timed = timeline.length ? timeForOffset(timeline, matchAt) : null
    const seconds = timed?.seconds ?? (row.start_time === null ? null : Number(row.start_time))
    const slug = String(row.episode_slug || '')
    return {
      text: turnBoundedQuote(clean, matchAt) ?? snippet,
      episodeTitle: String(row.episode_title || ''),
      episodeSlug: slug,
      startTime: seconds,
      speaker: timed?.speaker ?? (row.speaker_name ? String(row.speaker_name) : null),
      chapter: chapterFor(chapters.get(slug) || [], seconds),
      url: linkFor(slug, seconds),
      score: Number((-Number(row.rank)).toFixed(4)),
    }
  })
}

export async function searchSemantic(
  query: string,
  limit = 8,
  options: { vector?: number[] } = {},
): Promise<Passage[]> {
  const vector = options.vector
    ?? (await embedText(questionEmbeddingInput(query), {
      model: EMBEDDING_MODEL,
      signal: AbortSignal.timeout(8_000),
    }))

  const chunks = await loadEmbeddedChunks(EMBEDDING_MODEL)
  const ranked = scoreChunks(chunks, vector, query)
  const chosen = selectEvidenceChunks(
    ranked.filter((chunk) => chunk.score >= MIN_RETRIEVAL_SCORE),
    Math.max(1, Math.min(limit, 25)),
  )

  const chapters = await chaptersBySlug(chosen.map((chunk) => chunk.episodeSlug))
  const terms = queryTerms(query)

  return chosen.map((chunk) => {
    const { snippet, matchAt, clean } = locateEvidenceSnippet(chunk.text, terms, 280)
    const timed = chunk.timeline?.length ? timeForOffset(chunk.timeline, matchAt) : null
    const seconds = timed?.seconds ?? chunk.startTime ?? null
    return {
      text: turnBoundedQuote(clean, matchAt) ?? snippet,
      episodeTitle: chunk.episodeTitle,
      episodeSlug: chunk.episodeSlug,
      startTime: seconds,
      speaker: timed?.speaker ?? chunk.speakerName ?? null,
      chapter: chapterFor(chapters.get(chunk.episodeSlug) || [], seconds),
      url: linkFor(chunk.episodeSlug, seconds),
      score: Number(chunk.score.toFixed(4)),
    }
  })
}

// --- episode reads, for callers that want more than a passage ---------------

export type EpisodeSummary = {
  slug: string
  title: string
  publishedAt: string | null
  excerpt: string | null
  guests: string[]
  topics: string[]
  url: string
}

export type Turn = { startTime: number; speaker: string | null; text: string }

async function related(slugs: string[], table: 'guests' | 'topics'): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (!slugs.length) return map
  const placeholders = slugs.map(() => '?').join(',')
  // episodes_rels carries one column per related collection; the path column
  // names the field, which is what separates guests from topics.
  const result = await db().execute({
    sql: `SELECT e.slug AS episode_slug, r.name AS name
          FROM episodes e
          JOIN episodes_rels rel ON rel.parent_id = e.id
          JOIN ${table} r ON r.id = rel.${table}_id
          WHERE e.slug IN (${placeholders}) AND rel.${table}_id IS NOT NULL
          ORDER BY rel."order"`,
    args: slugs,
  })
  for (const row of result.rows) {
    const slug = String(row.episode_slug)
    map.set(slug, [...(map.get(slug) || []), String(row.name)])
  }
  return map
}

export async function listEpisodes(
  options: { topic?: string; guest?: string; limit?: number } = {},
): Promise<EpisodeSummary[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100))
  const filters: string[] = [`e._status = 'published'`]
  const args: (string | number)[] = []

  for (const [table, value] of [['topics', options.topic], ['guests', options.guest]] as const) {
    if (!value) continue
    filters.push(`EXISTS (SELECT 1 FROM episodes_rels rel JOIN ${table} r ON r.id = rel.${table}_id
                          WHERE rel.parent_id = e.id AND lower(r.name) LIKE ?)`)
    args.push(`%${value.toLowerCase()}%`)
  }

  const result = await db().execute({
    sql: `SELECT e.slug, e.title, e.published_at, e.excerpt FROM episodes e
          WHERE ${filters.join(' AND ')} ORDER BY e.published_at DESC LIMIT ?`,
    args: [...args, limit],
  })

  const slugs = result.rows.map((row) => String(row.slug))
  const [guests, topics] = await Promise.all([related(slugs, 'guests'), related(slugs, 'topics')])

  return result.rows.map((row) => {
    const slug = String(row.slug)
    return {
      slug,
      title: String(row.title || ''),
      publishedAt: row.published_at ? String(row.published_at) : null,
      excerpt: row.excerpt ? String(row.excerpt) : null,
      guests: guests.get(slug) || [],
      topics: topics.get(slug) || [],
      url: `/episode/${slug}`,
    }
  })
}

export async function getEpisode(slug: string) {
  const result = await db().execute({
    sql: `SELECT slug, title, published_at, excerpt, audio_url, chapters
          FROM episodes WHERE slug = ? AND _status = 'published' LIMIT 1`,
    args: [slug],
  })
  const row = result.rows[0]
  if (!row) return null

  const [guests, topics] = await Promise.all([related([slug], 'guests'), related([slug], 'topics')])
  let rawChapters: unknown = row.chapters
  if (typeof rawChapters === 'string') {
    try {
      rawChapters = JSON.parse(rawChapters)
    } catch {
      rawChapters = null
    }
  }

  return {
    slug: String(row.slug),
    title: String(row.title || ''),
    publishedAt: row.published_at ? String(row.published_at) : null,
    excerpt: row.excerpt ? String(row.excerpt) : null,
    audioUrl: row.audio_url ? String(row.audio_url) : null,
    guests: guests.get(slug) || [],
    topics: topics.get(slug) || [],
    chapters: normalizeChapters(rawChapters),
    url: `/episode/${slug}`,
  }
}

/**
 * The published transcript, cut into turns.
 *
 * Reuses findCues rather than parsing again: the archive writes speaker lines
 * as "Name (12:34)", and that regex is already the thing that knows every shape
 * the archive actually uses.
 */
export async function getTranscript(
  slug: string,
  options: { from?: number; to?: number } = {},
): Promise<{ slug: string; title: string; turns: Turn[] } | null> {
  const result = await db().execute({
    sql: `SELECT slug, title, transcript_text FROM episodes
          WHERE slug = ? AND _status = 'published' LIMIT 1`,
    args: [slug],
  })
  const row = result.rows[0]
  if (!row) return null

  const text = String(row.transcript_text || '')
  const cues = findCues(text)
  const turns: Turn[] = cues.map((cue, index) => ({
    startTime: cue.startTime,
    speaker: cue.speaker,
    text: text.slice(cue.textStart, cues[index + 1]?.offset ?? text.length).trim(),
  })).filter((turn) => turn.text.length > 0)

  const from = options.from
  const to = options.to
  // A turn that began before the window is still being spoken inside it, so
  // the last one starting at or before `from` belongs in the answer too —
  // filtering on start alone silently drops the speech the caller asked for.
  const windowed = from === undefined && to === undefined
    ? turns
    : turns.filter((turn, index) => {
        const ends = turns[index + 1]?.startTime ?? Infinity
        return (to === undefined || turn.startTime <= to) && (from === undefined || ends > from)
      })

  return { slug: String(row.slug), title: String(row.title || ''), turns: windowed }
}

/** What a footnote needs: who said it, when, where, and a link that proves it. */
export async function cite(slug: string, seconds: number) {
  const episode = await getEpisode(slug)
  if (!episode) return null
  const transcript = await getTranscript(slug)
  const turn = transcript?.turns.filter((item) => item.startTime <= seconds).at(-1) ?? null
  const chapter = chapterFor(episode.chapters, seconds)
  const year = episode.publishedAt ? new Date(episode.publishedAt).getFullYear() : null

  return {
    speaker: turn?.speaker ?? null,
    episodeTitle: episode.title,
    startTime: seconds,
    chapter: chapter?.title ?? null,
    url: linkFor(slug, seconds),
    reference: [
      turn?.speaker,
      `“${episode.title}”`,
      'Democracy Innovators Podcast',
      year,
      `at ${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`,
    ].filter(Boolean).join(', '),
  }
}
