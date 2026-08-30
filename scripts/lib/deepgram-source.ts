// The timed, diarised transcripts, read from the project that produced them.
//
// RSS-Analysis lives on this machine and transcribes the same Castopod feeds
// with Deepgram: every word carries a start, an end and a speaker. That is the
// material this archive needs and does not have — our own published transcripts
// are cleaned prose with no connection to the audio, and on nine episodes they
// are far shorter than what was actually said.
//
// 🔒 READ-ONLY, and not by convention. /root/RSS-Analysis is another project's
// database; nothing here may write to it. It is opened through the sqlite3
// command line with -readonly rather than the libsql client used elsewhere in
// this repo, because that client has no read-only mode and cannot make the
// guarantee. Same reasoning, and the same flag, as scripts/episode-status.ts.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const RSS_ANALYSIS_DB = '/root/RSS-Analysis/data/podcasts.sqlite'

/** One turn as Deepgram segmented it: a stretch of speech by one voice. */
export type Utterance = {
  start: number
  end: number
  /** Deepgram's cluster number, not a person. Names come from
   *  speaker-resolution.ts, which reads them out of the conversation. */
  speaker: number
  text: string
}

export type DeepgramEpisode = {
  /** The mp3 basename — see audioKey. */
  key: string
  title: string
  /** The feed's language, 'en' or 'it'. Three episodes are Italian, and their
   *  English titles must not be used to correct their Italian speech: without
   *  this the glossary rewrote "Fediverso" to "Fediverse" nine times. */
  language: string
  /** Seconds, as the feed declared them. Zero when the feed omitted it. */
  duration: number
  utterances: Utterance[]
}

/**
 * The join key between the two archives: the basename of the audio file.
 *
 * Titles diverge — ours are in English even for the Italian episodes, theirs
 * follow the feed — and ids are per-database. The mp3 filename is the one thing
 * both sides took from the same Castopod feed, and matching on it paired all
 * 61 of our episodes that have audio.
 */
export function audioKey(url: string | null | undefined): string | null {
  const match = /\/([^/]+?)\.mp3/i.exec(url || '')
  return match ? match[1].toLowerCase() : null
}

/**
 * Every Democracy Innovators episode RSS-Analysis has transcribed, keyed by
 * audio file.
 *
 * Returns null when the database is not reachable — no sqlite3, no file, no
 * read access. Callers are expected to carry on without it rather than fail:
 * the same rule the inventory script follows.
 *
 * Only four fields are pulled out of each utterance. The stored `utterances`
 * also nest the full word list, which makes the payload 72 MB for this archive;
 * projecting to start, end, speaker and text brings it to 4.7 MB, and the word
 * list adds nothing a turn does not already say.
 */
export function loadDeepgramEpisodes(): Map<string, DeepgramEpisode> | null {
  if (!fs.existsSync(RSS_ANALYSIS_DB)) return null

  // Both feeds: the main one and the Italian channel, which carries three
  // episodes whose audio our site uses under English titles.
  const query = `
    SELECT json_group_array(json_object(
             'audio', e.audio_url,
             'title', e.title,
             'language', coalesce(p.language, 'en'),
             'duration', coalesce(e.duration, 0),
             'turns', (SELECT json_group_array(json_object(
                         's', json_extract(u.value, '$.start'),
                         'e', json_extract(u.value, '$.end'),
                         'p', json_extract(u.value, '$.speaker'),
                         't', json_extract(u.value, '$.transcript')))
                       FROM json_each(t.raw_response, '$.results.utterances') u)))
    FROM episodes e
    JOIN transcripts t ON t.episode_id = e.id
    JOIN podcasts p ON p.id = e.podcast_id
    WHERE p.rss_url LIKE '%democracyinnovators%'`

  let raw: string
  try {
    raw = execFileSync('sqlite3', ['-readonly', RSS_ANALYSIS_DB, query], {
      encoding: 'utf8',
      maxBuffer: 64 << 20,
    })
  } catch {
    return null
  }

  const found = new Map<string, DeepgramEpisode>()
  let rows: { audio?: string; title?: string; language?: string; duration?: number; turns?: { s: number; e: number; p: number; t: string }[] }[]
  try {
    rows = JSON.parse(raw.trim() || '[]')
  } catch {
    return null
  }

  for (const row of rows) {
    const key = audioKey(row.audio)
    if (!key) continue
    const utterances = (row.turns || [])
      .filter((turn) => typeof turn.t === 'string' && turn.t.trim())
      .map((turn) => ({
        start: Number(turn.s) || 0,
        end: Number(turn.e) || 0,
        // A single-channel recording can leave the speaker null; treat it as
        // one voice rather than dropping the words.
        speaker: Number.isFinite(Number(turn.p)) ? Number(turn.p) : 0,
        text: turn.t.trim(),
      }))
    if (!utterances.length) continue
    found.set(key, {
      key,
      title: String(row.title || ''),
      language: String(row.language || 'en').slice(0, 2).toLowerCase(),
      duration: Number(row.duration) || 0,
      utterances,
    })
  }
  return found
}

/** Words per second of audio, the measure that exposed the nine thin
 *  transcripts: real speech runs 650-1000 characters a minute, and a summary
 *  presented as a transcript runs at 86. */
export function charsPerMinute(text: string, durationSeconds: number): number | null {
  if (!durationSeconds) return null
  return text.length / (durationSeconds / 60)
}
