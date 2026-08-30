import fs from 'node:fs'

import 'dotenv/config'
import { createClient } from '@libsql/client'

import { normalizeChapters } from '../src/lib/chapters'
import { computeAnchors, htmlToText, parseSrt, type AnchorMethod, type Cue } from './lib/chapter-anchors'
import { audioKey, loadDeepgramEpisodes } from './lib/deepgram-source'
import { fetchCastopodFeed, findCastopodEpisode } from './lib/castopod-feed'
import { FOLDER_ALIASES, scanSrtFolders } from './lib/nextcloud-srt'

// Chapters, and the anchors that make them clickable, taken from wherever the
// material already is.
//
// scripts/import-chapters.ts covers the episodes whose Nextcloud folder holds a
// chapter JSON. Plenty of folders have only the SRT, and some episodes have no
// folder at all, which is why 19 episodes ended up with chapters listed but no
// anchor: no anchor means the chapter title is not a link and leads nowhere.
//
// Here the two halves are fetched separately — chapters from the Castopod feed,
// which publishes them for every episode, and the SRT from the Nextcloud share
// or, failing that, from the feed's <podcast:transcript>. The anchor logic
// itself is the same one that produced the anchors already in the database.
//
// 🔒 Nextcloud is read, never written. See lib/nextcloud-srt.ts.
//
// Dry run unless --apply. Pass --refresh to redo episodes that already have
// anchors.

async function fetchText(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.text()
}

function slugify(value: string) {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

async function main() {
  const apply = process.argv.includes('--apply')
  const refresh = process.argv.includes('--refresh')
  const db = createClient({ url: process.env.DATABASE_URL || 'file:./runtime/database/payload.db' })

  const [feed, result] = await Promise.all([
    fetchCastopodFeed(),
    db.execute("SELECT id, title, slug, html, chapters, audio_url AS audioUrl, transcript_text AS transcriptText FROM episodes WHERE _status = 'published'"),
  ])
  const folders = scanSrtFolders().filter((folder) => folder.srt)
  // Read once for the whole run, not per episode: it is a single query against
  // another project's database and takes half a minute.
  const deepgram = loadDeepgramEpisodes()

  const counts: Record<AnchorMethod | 'skipped' | 'nochapters', number> = { inline: 0, srt: 0, none: 0, skipped: 0, nochapters: 0 }
  let updated = 0

  for (const row of result.rows) {
    const episode = {
      id: Number(row.id),
      title: String(row.title || ''),
      slug: String(row.slug || ''),
      html: String(row.html || ''),
      audioUrl: String(row.audioUrl || ''),
      transcriptText: String(row.transcriptText || ''),
    }
    const existing = normalizeChapters(typeof row.chapters === 'string' && row.chapters ? JSON.parse(row.chapters) : [])
    if (existing.some((chapter) => chapter.anchor) && !refresh) {
      counts.skipped += 1
      continue
    }

    const match = findCastopodEpisode(episode, feed)
    let chapters = existing
    if (!chapters.length && match?.item.chaptersUrl) {
      try {
        chapters = normalizeChapters(JSON.parse(await fetchText(match.item.chaptersUrl)))
      } catch (error) {
        console.log(`FAILED chapters ${episode.title}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (!chapters.length) {
      counts.nochapters += 1
      continue
    }

    // The share first: it holds the file that was uploaded, and reading it costs
    // no request. The feed is the fallback for episodes with no folder.
    let cues: Cue[] = []
    let source = ''
    const alias = Object.entries(FOLDER_ALIASES).find(([, slug]) => slug === episode.slug)?.[0]
    const folder = folders.find((candidate) => {
      const subject = candidate.subject.toLowerCase()
      if (alias && subject === alias) return false
      const key = slugify(candidate.subject)
      return episode.slug === key || episode.slug.startsWith(`${key}-`) || episode.title.toLowerCase().includes(subject)
    }) || (alias ? folders.find((candidate) => candidate.subject.toLowerCase() === alias) : undefined)

    if (folder?.srt) {
      try {
        cues = parseSrt(fs.readFileSync(folder.srt, 'utf8'))
        source = 'nextcloud'
      } catch {
        cues = []
      }
    }
    if (!cues.length && match?.item.transcriptUrl) {
      try {
        cues = parseSrt(await fetchText(match.item.transcriptUrl))
        source = 'feed'
      } catch (error) {
        console.log(`FAILED srt ${episode.title}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const rawText = htmlToText(episode.html || episode.transcriptText)
    let computed = computeAnchors(chapters, rawText, cues)

    // Deepgram's utterances are cues too, and for episodes whose SRT is missing
    // or does not match the published text they are the only ones that land:
    // Bruce Schneier went from no anchors at all to fourteen of fifteen.
    //
    // Tried alongside rather than instead. Measured over the archive, replacing
    // the SRT everywhere *loses* anchors on eleven episodes — Deepgram splits
    // speech differently, and where the SRT already works it works better — so
    // whichever finds more keeps the episode.
    const spoken = deepgram?.get(audioKey(episode.audioUrl) || '')
    if (spoken) {
      const alternative = computeAnchors(
        chapters,
        rawText,
        spoken.utterances.map((utterance) => ({ sec: utterance.start, text: utterance.text })),
      )
      if (alternative.anchored > computed.anchored) {
        computed = alternative
        source = source ? `${source}→deepgram` : 'deepgram'
      }
    }

    counts[computed.method] += 1
    if (!computed.anchored) {
      console.log(`NO ANCHOR ${episode.title.slice(0, 58)} (${computed.method}${source ? `/${source}` : ''})`)
      continue
    }

    updated += 1
    console.log(`${apply ? 'SET' : 'WOULD SET'} ${computed.anchored}/${chapters.length} anchored [${computed.method}${source ? `/${source}` : ''}] ${episode.title.slice(0, 52)}`)
    if (apply) {
      const payload = JSON.stringify(computed.chapters)
      await db.execute({
        sql: "UPDATE episodes SET chapters = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        args: [payload, episode.id],
      })
      await db.execute({ sql: 'UPDATE _episodes_v SET version_chapters = ? WHERE parent_id = ?', args: [payload, episode.id] })
    }
  }

  console.log(`\nFeed items: ${feed.length}; Nextcloud folders with an SRT: ${folders.length}`)
  console.log(`Anchored: ${updated}; already anchored: ${counts.skipped}; no chapters anywhere: ${counts.nochapters}`)
  console.log(`Method: inline ${counts.inline}, srt ${counts.srt}, none ${counts.none}`)
  if (!apply) console.log('Dry run only. Re-run with --apply after reviewing.')
  db.close()
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
