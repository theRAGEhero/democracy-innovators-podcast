import 'dotenv/config'
import { createClient } from '@libsql/client'

import { normalizeChapters } from '../src/lib/chapters'
import { fetchCastopodFeed, findCastopodEpisode } from './lib/castopod-feed'

// Chapters, taken from where they already are.
//
// scripts/import-chapters.ts reads JSON and SRT files handed over by hand, and
// that is why 15 of the 58 episodes have no chapters at all: nobody produced
// the files for them. Castopod, meanwhile, declares <podcast:chapters> for
// every episode, and the JSON behind it is already in the shape
// normalizeChapters accepts.
//
// This fills the gaps from the feed. It deliberately leaves alone any episode
// that already has chapters: those came from the other script with an `anchor`
// per chapter, computed from the SRT so the transcript can show a heading in
// the right place, and the feed has nothing to rebuild that with. Chapters
// without an anchor still list and still play from their minute — the chapter
// index draws them as plain entries and keeps the play button.
//
// Dry run unless --apply, like sync-castopod-audio.ts. Pass --refresh to
// replace chapters that are already there.

async function fetchChapters(url: string) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Chapters returned ${response.status}: ${url}`)
  return normalizeChapters(await response.json())
}

async function main() {
  const apply = process.argv.includes('--apply')
  const refresh = process.argv.includes('--refresh')
  const db = createClient({ url: process.env.DATABASE_URL || 'file:./runtime/database/payload.db' })

  const [feed, result] = await Promise.all([
    fetchCastopodFeed(),
    db.execute("SELECT id, title, slug, html, chapters FROM episodes WHERE _status = 'published'"),
  ])

  let filled = 0
  let skipped = 0
  const unmatched: string[] = []

  for (const row of result.rows) {
    const episode = {
      id: Number(row.id),
      title: String(row.title || ''),
      slug: String(row.slug || ''),
      html: String(row.html || ''),
    }
    const existing = normalizeChapters(typeof row.chapters === 'string' && row.chapters ? JSON.parse(row.chapters) : [])
    if (existing.length && !refresh) {
      skipped += 1
      continue
    }

    const match = findCastopodEpisode(episode, feed)
    if (!match?.item.chaptersUrl) {
      unmatched.push(episode.title)
      continue
    }

    let chapters
    try {
      chapters = await fetchChapters(match.item.chaptersUrl)
    } catch (error) {
      // One unreachable file must not stop the rest of the run.
      console.log(`FAILED ${episode.title}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    if (!chapters.length) {
      unmatched.push(episode.title)
      continue
    }

    filled += 1
    console.log(`${apply ? 'SET' : 'WOULD SET'} ${chapters.length} chapters [${match.matchedBy}] ${episode.title}`)
    if (apply) {
      const payload = JSON.stringify(chapters)
      await db.execute({
        sql: "UPDATE episodes SET chapters = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        args: [payload, episode.id],
      })
      await db.execute({ sql: 'UPDATE _episodes_v SET version_chapters = ? WHERE parent_id = ?', args: [payload, episode.id] })
    }
  }

  console.log(`Feed items: ${feed.length}; filled: ${filled}; already had chapters: ${skipped}; without chapters in the feed: ${unmatched.length}`)
  for (const title of unmatched) console.log(`NO CHAPTERS ${title}`)
  if (!apply) console.log('Dry run only. Re-run with --apply after reviewing.')
  db.close()
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
