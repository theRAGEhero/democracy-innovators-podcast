import 'dotenv/config'

import { createClient } from '@libsql/client'

// One sentence, on every episode, saying the same thing.
//
// The archive had accumulated thirty-one wordings of the same disclaimer across
// fifty pages — "it can have errors", "it may contain errors", "there could be
// errors", "it could contain errors:", each in a different heading level. And
// the thirteen episodes whose transcript was replaced lost theirs entirely,
// because it lived inside the text that was swapped out.
//
// The notice is rewritten in place where one exists, and inserted just above
// the first speaker cue where it does not.

const NOTICE = 'This episode was automatically transcribed, there could be errors.'
/** One episode publishes the English translation with the Italian original
 *  below it, and that is worth saying rather than flattening away. */
const TRANSLATED_NOTICE =
  'This episode was automatically transcribed and translated, there could be errors. '
  + 'The original Italian transcription is after the English one.'

const MARKERS = [
  'transcript of the conversation',
  'full transcription of the interview',
  'automatic transcription',
  'automatic transcript',
  'ai made transcription',
  'interview transcription',
]

/** The block that carries the disclaimer today, if there is one. */
function existingNotice(html: string): { start: number; end: number } | null {
  const lower = html.toLowerCase()
  for (const marker of MARKERS) {
    const found = lower.indexOf(marker)
    if (found < 0) continue
    // The enclosing block: back to its opening tag, forward to its closing one.
    const open = Math.max(
      lower.lastIndexOf('<p', found),
      lower.lastIndexOf('<h1', found),
      lower.lastIndexOf('<h2', found),
      lower.lastIndexOf('<h3', found),
    )
    if (open < 0) continue
    const tag = /^<(h[1-6]|p)/.exec(lower.slice(open))?.[1]
    if (!tag) continue
    const close = lower.indexOf(`</${tag}>`, found)
    if (close < 0) continue
    return { start: open, end: close + `</${tag}>`.length }
  }
  return null
}

/**
 * Where the transcript's first turn begins.
 *
 * Every shape the archive uses to open a turn: "Name (12:34)", "[12:34] Name:",
 * and "<strong>Name:</strong>". Without one of these there is nothing to put a
 * notice above, and the episode is left alone.
 */
function firstCue(html: string): number | null {
  const patterns = [
    /<p[^>]*>[^<]{2,60}\(\d{1,2}:\d{2}(?::\d{2})?\)/i,
    /<p[^>]*>\s*\[\d{1,2}:\d{2}(?::\d{2})?\]/i,
    /<p[^>]*>\s*<strong>[^<]{2,60}:\s*<\/strong>/i,
  ]
  const hits = patterns.map((pattern) => pattern.exec(html)?.index ?? -1).filter((at) => at >= 0)
  return hits.length ? Math.min(...hits) : null
}

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient({ url: process.env.DATABASE_URL || 'file:./runtime/database/payload.db' })
  const rows = (await db.execute(
    `SELECT id, title, html FROM episodes WHERE html IS NOT NULL AND html <> ''`,
  )).rows

  let rewritten = 0
  let inserted = 0
  let untouched = 0
  let skipped = 0

  for (const row of rows) {
    const html = String(row.html || '')
    const translated = /original italian transcription/i.test(html)
    const notice = `<h3>${translated ? TRANSLATED_NOTICE : NOTICE}</h3>`

    const existing = existingNotice(html)
    let next: string
    let what: string

    if (existing) {
      const current = html.slice(existing.start, existing.end)
      if (current === notice) {
        untouched += 1
        continue
      }
      next = html.slice(0, existing.start) + notice + html.slice(existing.end)
      what = `riscrivo  ${current.replace(/<[^>]+>/g, '').trim().slice(0, 62)}`
      rewritten += 1
    } else {
      const cue = firstCue(html)
      if (cue === null) {
        skipped += 1
        continue
      }
      next = html.slice(0, cue) + notice + html.slice(cue)
      what = `inserisco (non ne aveva)`
      inserted += 1
    }

    console.log(`${apply ? '✓' : '·'} ${String(row.title).slice(0, 44).padEnd(46)} ${what}`)
    if (apply) {
      await db.execute({
        sql: "UPDATE episodes SET html = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        args: [next, row.id as number],
      })
    }
  }

  console.log(
    `\n${apply ? 'Fatto' : 'Prova a vuoto'}: ${rewritten} riscritti, ${inserted} inseriti, `
      + `${untouched} già a posto, ${skipped} senza battute riconoscibili.`
      + (apply ? '' : '\nRilancia con --apply.'),
  )
  db.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
