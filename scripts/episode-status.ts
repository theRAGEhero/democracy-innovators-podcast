import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import 'dotenv/config'
import { createClient } from '@libsql/client'

import { normalizeChapters } from '../src/lib/chapters'
import { fetchCastopodFeed, findCastopodEpisode, type CastopodFeedEpisode } from './lib/castopod-feed'
import { scanSrtFolders, subjectFromFolder, NEXTCLOUD_ROOT, SUBDIRS } from './lib/nextcloud-srt'
import { audioKey } from './lib/deepgram-source'

// What every episode has, and what it is missing.
//
// An episode is assembled from a dozen pieces arriving from different places —
// Ghost, Castopod, the Nextcloud share, the scripts in this repo — and until
// now the only way to know what was missing was to query the database by hand,
// one question at a time. That is how the recent gaps surfaced one by one: 15
// episodes with no chapters, 19 with no anchors, four never published, a cover
// two months stale.
//
// Writes episodes/status.md. Re-run it rather than editing the file: an
// inventory kept by hand is out of date by the third episode.
//
// 🔒 Two sources are read and never written: the Nextcloud share (see
// lib/nextcloud-srt.ts) and /root/RSS-Analysis, another project's database,
// opened read-only. Neither is required — when one is unreachable its columns
// read "?" and the rest of the inventory is still produced.

const OUTPUT = 'episodes/status.md'
const RSS_ANALYSIS_DB = '/root/RSS-Analysis/data/podcasts.sqlite'

type Row = {
  slug: string
  title: string
  published: string
  audio: boolean
  cover: boolean
  image: boolean
  video: boolean
  chapters: number
  anchored: number
  transcript: number
  chunks: number
  guests: number
  guestLinks: number
  topics: number
  srt: string
  deepgram: string
  /** Whether the source that would fill a gap exists at all. Without this the
   *  inventory lists a command beside a gap no command can close. */
  inFeed: boolean
  feedChapters: boolean
  hasSrt: boolean
}

function slugifyFolder(value: string) {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

/** Folders holding a RAW.deepgram.json, by the subject their name carries. */
function deepgramFolders(): string[] | null {
  if (!fs.existsSync(NEXTCLOUD_ROOT)) return null
  const found: string[] = []
  for (const sub of SUBDIRS) {
    const base = path.join(NEXTCLOUD_ROOT, sub)
    if (!fs.existsSync(base)) continue
    for (const folder of fs.readdirSync(base)) {
      const dir = path.join(base, folder)
      if (!fs.statSync(dir).isDirectory()) continue
      // Some episodes keep it in a _work subfolder.
      const hit = ['RAW.deepgram.json', path.join('_work', 'RAW.deepgram.json')]
        .some((candidate) => fs.existsSync(path.join(dir, candidate)))
      if (hit) found.push(subjectFromFolder(folder))
    }
  }
  return found
}

/**
 * The audio files RSS-Analysis has transcribed with diarisation.
 *
 * Keyed on the mp3 name rather than the title, which is what the two archives
 * genuinely share. Titles do not: the three Italian episodes are filed there
 * under Italian titles and here under English ones, so matching by title
 * dropped them from the count without saying so.
 *
 * Read with sqlite3 -readonly, not the client used elsewhere in this repo: that
 * one has no read-only mode, and this is another project's database.
 */
function diarisedAudioKeys(): Set<string> | null {
  if (!fs.existsSync(RSS_ANALYSIS_DB)) return null
  const query = "SELECT e.audio_url FROM episodes e JOIN transcripts t ON t.episode_id = e.id "
    + "JOIN podcasts p ON p.id = e.podcast_id "
    + "WHERE p.rss_url LIKE '%democracyinnovators%' AND t.diarization IS NOT NULL"
  try {
    const output = execFileSync('sqlite3', ['-readonly', RSS_ANALYSIS_DB, query], { encoding: 'utf8', maxBuffer: 4 << 20 })
    const keys = output.split('\n').map((line) => audioKey(line.trim())).filter((key): key is string => Boolean(key))
    return new Set(keys)
  } catch {
    // No sqlite3, no database, or no read access: the column simply reads "?".
    return null
  }
}

const mark = (value: boolean) => (value ? '✓' : '—')

function table(rows: Row[]) {
  const head = '| Episodio | Data | Audio | Cover | Img | Video | Capitoli | Testo | AI | Ospiti | Link | Temi | SRT | Deepgram |'
  const sep = '|---|---|:-:|:-:|:-:|:-:|:-:|--:|--:|:-:|--:|--:|:-:|:-:|'
  const body = rows.map((row) => [
    row.title.slice(0, 46),
    row.published.slice(0, 10),
    mark(row.audio),
    mark(row.cover),
    mark(row.image),
    mark(row.video),
    row.chapters ? `${row.anchored}/${row.chapters}` : '—',
    row.transcript ? `${Math.round(row.transcript / 1000)}k` : '—',
    row.chunks || '—',
    mark(row.guests > 0),
    row.guestLinks || '—',
    row.topics || '—',
    row.srt,
    row.deepgram,
  ].join(' | '))
  return [head, sep, ...body.map((line) => `| ${line} |`)].join('\n')
}

function gaps(rows: Row[]) {
  const list = (items: { row: Row; note?: string }[]) =>
    items.map(({ row, note }) => `  - ${row.title.slice(0, 58)}${note ? ` — ${note}` : ''}`).join('\n')
  const published = rows.filter((row) => row.audio)
  const sections: string[] = []
  const stuck: { row: Row; note: string }[] = []

  const add = (title: string, items: Row[], how: string) => {
    if (!items.length) return
    sections.push(`### ${title} — ${items.length}\n\n${how}\n\n${list(items.map((row) => ({ row })))}`)
  }

  // A gap is only worth a command when the source that would close it exists.
  // Everything else goes below, with the reason, instead of sitting in a list
  // of work that would never succeed.
  const noAudio = rows.filter((row) => !row.audio)
  add('Senza audio', noAudio.filter((row) => row.inFeed), 'Castopod ha l\'episodio: `npm run audio:sync -- --apply`')
  for (const row of noAudio.filter((row) => !row.inFeed)) {
    stuck.push({ row, note: 'non pubblicato su Castopod' })
  }

  const noChapters = published.filter((row) => !row.chapters)
  add('Senza capitoli', noChapters.filter((row) => row.feedChapters), 'Dal feed Castopod: `npm run chapters:castopod -- --apply`')
  for (const row of noChapters.filter((row) => !row.feedChapters)) {
    stuck.push({ row, note: 'Castopod non pubblica i suoi capitoli' })
  }

  const noAnchor = published.filter((row) => row.chapters && !row.anchored)
  add('Con capitoli ma senza anchor', noAnchor.filter((row) => !row.hasSrt), 'Manca un SRT: caricalo su Castopod, poi `npm run chapters:castopod -- --apply`')
  for (const row of noAnchor.filter((row) => row.hasSrt)) {
    stuck.push({ row, note: 'l\'SRT c\'è ma non combacia con la trascrizione pubblicata' })
  }

  add('Senza blocchi per l\'assistente', published.filter((row) => row.transcript && !row.chunks), 'Indicizzazione: `npm run embeddings:build`')
  add('Senza trascrizione', published.filter((row) => !row.transcript), 'Arriva da Ghost: `npm run sync:ghost`')
  add('Senza ospiti collegati', published.filter((row) => !row.guests), 'La mappa dei nomi sta in `newGuestRules`, in `scripts/sync-ghost.ts`')
  add('Ospiti senza link ufficiali', published.filter((row) => row.guests && !row.guestLinks), 'Ricerca a mano dei riferimenti ufficiali, poi `officialLinks` sull\'ospite. Dove non esiste una pagina attribuibile con certezza, meglio lasciare vuoto che collegare un omonimo.')
  add('Senza copertina quadrata', published.filter((row) => !row.cover), 'Da Castopod: `npm run audio:sync -- --apply`')

  const closing = stuck.length
    ? `### Non colmabile da qui — ${stuck.length}\n\nLa fonte che servirebbe non esiste o non funziona per questi episodi. Tenuti separati perché nessun comando li sistemerà.\n\n${list(stuck)}`
    : ''

  return [sections.join('\n\n'), closing].filter(Boolean).join('\n\n')
}

async function main() {
  const db = createClient({ url: process.env.DATABASE_URL || 'file:./runtime/database/payload.db' })

  // Once for the whole run, not once per episode.
  const feed: CastopodFeedEpisode[] = await fetchCastopodFeed().catch(() => [])
  const srtFolders = fs.existsSync(NEXTCLOUD_ROOT) ? scanSrtFolders() : null
  const dgFolders = deepgramFolders()
  const diarised = diarisedAudioKeys()

  const result = await db.execute(`
    SELECT e.id, e.title, e.slug, e.published_at, e.html, e.audio_url, e.square_cover_url,
           e.feature_image_url, e.video_url, e.chapters, length(e.transcript_text) AS transcript,
           (SELECT count(*) FROM archive_chunks WHERE episode_id = e.id) AS chunks,
           (SELECT count(*) FROM episodes_rels WHERE parent_id = e.id AND guests_id IS NOT NULL) AS guests,
           (SELECT count(*) FROM episodes_rels WHERE parent_id = e.id AND topics_id IS NOT NULL) AS topics,
           (SELECT count(*) FROM guests_official_links l
              JOIN episodes_rels r ON r.guests_id = l._parent_id
              WHERE r.parent_id = e.id) AS guestLinks
    FROM episodes e ORDER BY e.published_at DESC`)

  const rows: Row[] = result.rows.map((row) => {
    const episode = {
      slug: String(row.slug || ''),
      title: String(row.title || ''),
      html: String(row.html || ''),
      audioUrl: String(row.audio_url || ''),
    }
    const chapters = normalizeChapters(typeof row.chapters === 'string' && row.chapters ? JSON.parse(row.chapters) : [])
    const match = findCastopodEpisode(episode, feed)

    const folder = srtFolders?.find((candidate) => {
      const key = slugifyFolder(candidate.subject)
      return episode.slug === key || episode.slug.startsWith(`${key}-`) || episode.title.toLowerCase().includes(candidate.subject.toLowerCase())
    })
    const srt = srtFolders === null && !feed.length
      ? '?'
      : folder?.srt ? 'NC' : match?.item.transcriptUrl ? 'feed' : '—'

    const hasLocalDeepgram = dgFolders?.some((subject) => episode.title.toLowerCase().includes(subject.toLowerCase()))
    const hasDiarised = diarised?.has(audioKey(episode.audioUrl) || '')
    const deepgram = dgFolders === null && diarised === null
      ? '?'
      : hasLocalDeepgram ? 'NC' : hasDiarised ? 'RSS' : '—'

    return {
      slug: episode.slug,
      title: episode.title,
      published: String(row.published_at || ''),
      audio: Boolean(row.audio_url),
      cover: Boolean(row.square_cover_url),
      image: Boolean(row.feature_image_url),
      video: Boolean(row.video_url),
      chapters: chapters.length,
      anchored: chapters.filter((chapter) => chapter.anchor).length,
      transcript: Number(row.transcript || 0),
      chunks: Number(row.chunks || 0),
      guests: Number(row.guests || 0),
      guestLinks: Number(row.guestLinks || 0),
      topics: Number(row.topics || 0),
      srt,
      deepgram,
      inFeed: Boolean(match),
      feedChapters: Boolean(match?.item.chaptersUrl),
      hasSrt: srt === 'NC' || srt === 'feed',
    }
  })

  const published = rows.filter((row) => row.audio)
  const totals = [
    `- **${rows.length} episodi**, di cui ${published.length} con audio`,
    `- **${rows.filter((row) => row.anchored).length}** con capitoli cliccabili, ${rows.filter((row) => row.chapters && !row.anchored).length} con capitoli non ancorati, ${published.filter((row) => !row.chapters).length} senza capitoli`,
    `- **${rows.reduce((sum, row) => sum + row.chunks, 0)}** blocchi indicizzati per l'assistente`,
    `- **${rows.filter((row) => row.srt === 'NC' || row.srt === 'feed').length}** con un SRT disponibile, **${rows.filter((row) => row.deepgram !== '—' && row.deepgram !== '?').length}** con una trascrizione Deepgram`,
  ].join('\n')

  const document = `# Stato degli episodi

Generato da \`npm run status:episodes\`. **Non modificare a mano**: rigenerare.

${totals}

Legenda: ✓ presente · — assente · **NC** dalla cartella Nextcloud · **feed** dal feed Castopod · **RSS** dal progetto RSS-Analysis · **?** fonte non raggiungibile da qui.
Nella colonna Capitoli, \`16/16\` significa 16 capitoli tutti ancorati — ancorato vuol dire che il titolo è cliccabile e porta al punto giusto della trascrizione.

## Un episodio per riga

${table(rows)}

## Cosa manca

${gaps(rows) || 'Niente da segnalare.'}

## Da dove viene ogni cosa

| Voce | Fonte | Comando |
|---|---|---|
| Episodio, testo, immagine, temi | Ghost, \`democracyinnovators.com\` | \`npm run sync:ghost\` |
| Audio, copertina quadrata | feed Castopod | \`npm run audio:sync -- --apply\` |
| Capitoli e anchor | feed Castopod + SRT (Nextcloud o feed) | \`npm run chapters:castopod -- --apply\` |
| Capitoli da cartelle complete | Nextcloud, JSON + SRT | \`npm run chapters:import\` |
| Blocchi per l'assistente | trascrizione + embeddings Gemini | \`npm run embeddings:build\` |
| Ospiti | \`newGuestRules\` in \`scripts/sync-ghost.ts\` | \`npm run sync:ghost\` |
| Link ufficiali degli ospiti | ricerca a mano, campo \`officialLinks\` | — |
| SRT | Nextcloud, oppure \`<podcast:transcript>\` nel feed | — |
| Deepgram | \`RAW.deepgram.json\` su Nextcloud, o \`/root/RSS-Analysis\` | — |

Nextcloud e RSS-Analysis vengono soltanto letti: nessuno script di questo repository ci scrive.
`

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, document)
  console.log(`${OUTPUT}: ${rows.length} episodi`)
  console.log(`SRT: ${rows.filter((r) => r.srt !== '—' && r.srt !== '?').length}; Deepgram: ${rows.filter((r) => r.deepgram !== '—' && r.deepgram !== '?').length}`)
  db.close()
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
