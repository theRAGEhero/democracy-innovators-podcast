// Turning a retrieved chunk into something a reader can act on: who was
// speaking, at what minute, in which chapter.
//
// None of this needs re-indexing. The stored transcripts keep their speaker
// cues ("Alessandro Oppo (00:00)") and the chunker preserves punctuation, so
// 388 of the 852 chunks carry at least one timestamp — 27 episodes. Where the
// transcript has no times, the 43 episodes with chapters still give a place to
// start listening. Between the two, 45 of the 57 episodes with audio can be
// opened at the right moment.

import { createClient } from '@libsql/client'

import { normalizeText } from '@/lib/archive-rag'
import { chapterAnchorId, normalizeChapters, parseTimestamp, type Chapter } from '@/lib/chapters'

export type SpeakerCue = { speaker: string | null; startTime: number; offset: number; /** End of the cue itself, where the speech begins. */ textStart: number }

export type CitationContext = {
  speaker?: string
  startTime?: number
  chapter?: { id: string; title: string; startTime: number }
}

/** Words the chunker advances between consecutive chunks (MAX_WORDS - OVERLAP). */
const CHUNK_STEP_WORDS = 460

/**
 * How far the governing cue may sit from the quote before we stop claiming to
 * know who said it.
 *
 * Since attribution runs against the whole transcript rather than a single
 * chunk, the preceding cue is genuinely the speaker: the 27 episodes with
 * labelled dialogue mark both sides and alternate throughout. Over their 1246
 * turns the length is 311 characters at the median, 1058 at the 75th
 * percentile and 3594 at the 95th, so the threshold sits at that 95th: long
 * enough for a real monologue, short enough to refuse an episode whose only cue
 * is the introduction, where the gap runs to tens of thousands.
 *
 * Naming the wrong person under a quote is worse than naming nobody, so past
 * the line the timestamp is kept and the name dropped.
 */
const CUE_ATTRIBUTION_LIMIT = 3600

// "Name (12:34)" / "Name [12:34]" and the reversed "[12:34] Name:" — the forms
// the archive actually uses. A bare timestamp with no name still gives a time.
const CUE = new RegExp(
  [
    String.raw`(?<name>\p{Lu}[\p{L}\p{M}'’.\-]*(?:\s+\p{Lu}[\p{L}\p{M}'’.\-]*){0,3})\s*[([](?<t1>\d{1,2}:\d{2}(?::\d{2})?)[)\]]`,
    String.raw`[([](?<t2>\d{1,2}:\d{2}(?::\d{2})?)[)\]]\s*(?<name2>\p{Lu}[\p{L}\p{M}'’.\-]*(?:\s+\p{Lu}[\p{L}\p{M}'’.\-]*){0,3})\s*:`,
  ].join('|'),
  'gu',
)

/** Filler and stray sentence ends get swept into the capitalised run before a
 *  timestamp ("Mm. Alessandro Oppo"). Keep only words that could be a name. */
function speakerName(raw: string): string | null {
  const words = raw.trim().split(/\s+/).filter(Boolean)
  // Drop leading fragments: anything ending in a full stop that is not an
  // initial is the tail of the previous sentence, not part of the name.
  while (words.length && /\.$/.test(words[0]) && !/^\p{Lu}\.$/u.test(words[0])) words.shift()
  const name = words.join(' ').trim()
  return name.length >= 2 ? name : null
}

/** Every timestamped cue in a chunk, with where it sits in the text. */
export function findCues(text: string): SpeakerCue[] {
  if (!text) return []
  const cues: SpeakerCue[] = []
  CUE.lastIndex = 0
  for (let match = CUE.exec(text); match; match = CUE.exec(text)) {
    const groups = match.groups || {}
    const seconds = parseTimestamp(groups.t1 || groups.t2)
    if (seconds === null) continue
    cues.push({
      speaker: speakerName(groups.name || groups.name2 || ''),
      startTime: seconds,
      offset: match.index,
      textStart: match.index + match[0].length,
    })
  }
  return cues
}

/**
 * The cue that governs a passage: the last one *before* it, not the first in
 * the chunk. A chunk spans several minutes and several people, so taking the
 * first would routinely credit a quote to the wrong speaker.
 */
export function cueForOffset(cues: SpeakerCue[], offset: number): SpeakerCue | null {
  let found: SpeakerCue | null = null
  for (const cue of cues) {
    if (cue.offset <= offset) found = cue
    else break
  }
  // No fallback to the first cue: a passage sitting *before* every cue in the
  // chunk belongs to a turn that began in the previous chunk, and the first cue
  // here is usually the host picking up afterwards. Falling back credited the
  // guest's answers to the interviewer.
  return found
}

/**
 * Where a chunk sits inside its own transcript.
 *
 * Speaker cues have to be looked for in the whole transcript, not in the chunk:
 * a turn of speech starts wherever it starts, and roughly half the retrieved
 * chunks open in the middle of one, with the cue that names the speaker sitting
 * in the previous chunk. Searching only the chunk left those passages
 * anonymous.
 *
 * The chunker cuts on word boundaries without rewriting the text, so the chunk
 * appears verbatim in the normalised transcript and a distinctive opening is
 * enough to find it. Returns null if it does not, and the caller falls back to
 * the chunk alone. A transcript that repeated the same 120 characters would
 * match the earlier copy, which in practice speech does not.
 */
export function locateChunk(transcript: string, chunkText: string, offsetInChunk: number): number | null {
  const probe = chunkText.slice(0, 120)
  if (probe.length < 20) return null
  const at = transcript.indexOf(probe)
  if (at < 0) return null
  return at + offsetInChunk
}

/** Shortest quote worth showing. Below this the turn is an interjection —
 *  "Yeah", "Mm-hm" — and the reader is better served by the wider passage. */
const MIN_QUOTE_LENGTH = 60

/**
 * The quoted words, cut to the turn they belong to.
 *
 * A fixed window around the match runs straight through changes of speaker, so
 * a card headed with one name would show two people talking — the opposite of
 * showing exactly what someone said. Bounding the window by the surrounding
 * cues keeps the quotation honest, and lets the name stay.
 *
 * Returns `null` when the turn is too short to quote from, leaving the caller
 * to fall back to its own unbounded snippet.
 */
export function turnBoundedQuote(text: string, matchAt: number, maxLength = 280): string | null {
  const cues = findCues(text)
  const cue = cueForOffset(cues, matchAt)
  const turnStart = cue ? cue.textStart : 0
  const next = cues.find((other) => other.offset > matchAt)
  const turnEnd = next ? next.offset : text.length
  if (turnEnd - turnStart < MIN_QUOTE_LENGTH) return null

  // Keep the same 90 characters of lead-in as the unbounded snippet, so the
  // quote starts a little before the matched word rather than on top of it.
  const start = Math.max(turnStart, Math.min(matchAt - 90, turnEnd - maxLength))
  const end = Math.min(turnEnd, start + maxLength)
  const body = text.slice(start, end).trim()
  if (body.length < MIN_QUOTE_LENGTH) return null
  return `${start > turnStart ? '...' : ''}${body}${end < turnEnd ? '...' : ''}`
}

export function chapterForTime(chapters: Chapter[], seconds: number) {
  let index = -1
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i].startTime <= seconds + 0.25) index = i
    else break
  }
  return index < 0 ? null : { index, chapter: chapters[index] }
}

/**
 * Where a chunk sits when the transcript carries no timestamps: chunk N starts
 * around word N * step, so comparing that against the chapters' own word
 * offsets still lands in the right section.
 */
export function chapterForChunkIndex(chapters: Chapter[], chunkIndex: number, totalWords: number) {
  if (!chapters.length || !totalWords) return null
  const startWord = chunkIndex * CHUNK_STEP_WORDS
  const progress = Math.min(1, startWord / totalWords)
  const lastStart = chapters[chapters.length - 1].startTime
  if (!lastStart) return null
  // Chapters are spread over the episode; progress through the words is the
  // best proxy available for progress through the audio.
  return chapterForTime(chapters, progress * lastStart)
}

export function describeCitation(input: {
  text: string
  /** Where the matched passage sits in the chunk (`matchAt` from
   *  locateEvidenceSnippet, not `start`): the snippet's own beginning includes
   *  90 characters of lead-in that can fall inside the previous speaker's turn,
   *  which credited quotes to the host. */
  snippetStart: number
  chunkIndex: number
  chapters: Chapter[]
  transcriptWords?: number
}): CitationContext {
  const { text, snippetStart, chunkIndex, chapters, transcriptWords } = input
  const cues = findCues(text)
  const cue = cueForOffset(cues, snippetStart)

  const context: CitationContext = {}
  if (cue?.speaker && snippetStart - cue.offset <= CUE_ATTRIBUTION_LIMIT) context.speaker = cue.speaker
  // The time survives the distance check: it is still the last known anchor,
  // and it lands inside the right stretch of audio even when the name does not.
  if (cue) context.startTime = cue.startTime

  const located = cue
    ? chapterForTime(chapters, cue.startTime)
    : chapterForChunkIndex(chapters, chunkIndex, transcriptWords || 0)
  if (located) {
    context.chapter = {
      id: chapterAnchorId(located.index, located.chapter.title),
      title: located.chapter.title,
      startTime: located.chapter.startTime,
    }
  }
  // Without a cue the chapter start is the only honest place to begin playback.
  if (context.startTime === undefined && context.chapter) context.startTime = context.chapter.startTime

  return context
}

export type CitedEpisode = {
  id: number
  slug: string
  title: string
  audioUrl: string | null
  coverUrl: string | null
  chapters: Chapter[]
  /** Normalised, so offsets line up with the snippets cut from the chunks. */
  transcript: string
  transcriptWords: number
}

/**
 * The player needs audio and artwork, which the chunk does not carry. Read once
 * per cited episode — three to five per answer — and straight from SQLite, for
 * the same reason retrieval does (see loadEmbeddedChunks).
 */
export async function loadCitedEpisodes(ids: number[]): Promise<Map<number, CitedEpisode>> {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))]
  const found = new Map<number, CitedEpisode>()
  if (!unique.length) return found

  const client = createClient({ url: process.env.DATABASE_URL || 'file:./runtime/database/payload.db' })
  try {
    const result = await client.execute({
      sql: `SELECT id, slug, title, audio_url, square_cover_url, feature_image_url, chapters, transcript_text
            FROM episodes WHERE id IN (${unique.map(() => '?').join(',')})`,
      args: unique,
    })
    for (const row of result.rows) {
      let chapters: Chapter[] = []
      try {
        chapters = normalizeChapters(typeof row.chapters === 'string' ? JSON.parse(row.chapters) : row.chapters)
      } catch {
        chapters = []
      }
      const transcript = normalizeText(String(row.transcript_text || ''))
      found.set(Number(row.id), {
        id: Number(row.id),
        slug: String(row.slug || ''),
        title: String(row.title || ''),
        audioUrl: row.audio_url ? String(row.audio_url) : null,
        coverUrl: String(row.square_cover_url || row.feature_image_url || '') || null,
        chapters,
        transcript,
        // Only used to place a chunk when the transcript has no timestamps.
        transcriptWords: transcript ? transcript.split(' ').length : 0,
      })
    }
    return found
  } finally {
    client.close()
  }
}
