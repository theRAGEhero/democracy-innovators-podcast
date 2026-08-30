import 'dotenv/config'

import fs from 'node:fs'
import path from 'node:path'

import { createClient } from '@libsql/client'

import { audioKey, loadDeepgramEpisodes } from './lib/deepgram-source'
import type { Turn } from '@/lib/archive-rag'

// Replacing a published transcript that is far shorter than the audio.
//
// Nine of these episodes carry a partial transcript; three carry no transcript
// at all but an AI summary in the third person, published under the heading
// "Transcript of the Conversation" — a page saying something it does not have.
// Measured as characters per minute of audio: real speech runs 650-1000, and
// the worst of these runs at 86.
//
// ⚠️ The page body is not only the transcript. It also holds the Castopod and
// YouTube embeds, and the episode page reads the Castopod URL and the outbound
// links back out of it. So the preamble is kept and only the body below it is
// rewritten — and where the boundary cannot be found with confidence the
// episode is skipped rather than guessed at.
//
// The replacement is written in the archive's own cue format, "Name (12:34)",
// which annotateSpeakers already styles and which anchorFromInline reads: an
// episode rewritten here gets exact chapter anchors as a side effect, from the
// audio's own clock rather than from matching text against text.

const TURNS_DIR = 'runtime/deepgram'
const BACKUP_DIR = 'runtime/backups'
/** Below this ratio the published text is a transcript with gaps, not a
 *  different kind of document, and rewriting it buys little. */
const MIN_RATIO = 1.2

/**
 * Where a transcript announces itself, case-insensitively.
 *
 * Surveyed across the archive rather than guessed: "automatic transcription"
 * covers most of it in a dozen wordings, and these are the stragglers.
 *
 * ⚠️ "Original Italian transcription" is deliberately absent. It heads the
 * second half of a translated episode, so treating it as a boundary would cut
 * away the English transcript above it.
 */
const MARKERS = [
  'transcript of the conversation',
  'full transcription of the interview',
  'automatic transcription',
  'automatic transcript',
  'ai made transcription',
]

type Boundary = { at: number; rule: string } | null

/**
 * Where the preamble ends and the transcript begins.
 *
 * Two rules, tried in order, and no third: an episode that matches neither is
 * reported and left alone. Cutting a published page at a guessed offset would
 * take the embeds with it.
 */
export function findBoundary(html: string): Boundary {
  const lower = html.toLowerCase()
  for (const marker of MARKERS) {
    const found = lower.indexOf(marker)
    if (found < 0) continue
    // Back up to the start of the block that introduces it, so the heading goes
    // with the text it heads.
    const open = Math.max(
      lower.lastIndexOf('<p', found),
      lower.lastIndexOf('<h1', found),
      lower.lastIndexOf('<h2', found),
      lower.lastIndexOf('<h3', found),
    )
    if (open >= 0) return { at: open, rule: `marcatore "${marker}"` }
  }

  // Otherwise the last embed or rule in the opening quarter of the document:
  // past that point the cards have finished and the body has begun.
  const limit = Math.floor(html.length * 0.25)
  const figure = lower.lastIndexOf('</figure>', limit)
  const line = lower.lastIndexOf('<hr>', limit)
  const at = Math.max(figure >= 0 ? figure + '</figure>'.length : -1, line >= 0 ? line + '<hr>'.length : -1)
  return at > 0 ? { at, rule: figure > line ? 'dopo l\'ultimo embed' : 'dopo l\'ultima riga orizzontale' } : null
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = whole % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`
}

/** The archive's cue format: a name, the time in brackets, then the words. */
export function renderTurns(turns: Turn[]): { html: string; text: string } {
  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const paragraphs: string[] = []
  const lines: string[] = []
  for (const turn of turns) {
    const cue = turn.speaker ? `${turn.speaker} (${clock(turn.start)})` : `(${clock(turn.start)})`
    paragraphs.push(`<p>${escape(cue)}<br>${escape(turn.text)}</p>`)
    lines.push(`${cue} ${turn.text}`)
  }
  return { html: paragraphs.join(''), text: lines.join('\n\n') }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient({ url: process.env.DATABASE_URL || 'file:./runtime/database/payload.db' })
  const source = loadDeepgramEpisodes()
  if (!source) {
    console.error('RSS-Analysis non raggiungibile.')
    process.exit(1)
  }

  const rows = (await db.execute(
    `SELECT id, slug, title, html, transcript_text, audio_url FROM episodes
     WHERE audio_url IS NOT NULL AND audio_url <> ''`,
  )).rows

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  if (apply) fs.mkdirSync(BACKUP_DIR, { recursive: true })

  let replaced = 0
  let skipped = 0

  for (const row of rows) {
    const found = source.get(audioKey(String(row.audio_url)) || '')
    if (!found?.duration) continue
    const ours = String(row.transcript_text || '').length
    const theirs = found.utterances.reduce((sum, utterance) => sum + utterance.text.length + 1, 0)
    if (!ours || theirs < ours * MIN_RATIO) continue

    const turnsFile = path.join(TURNS_DIR, `${row.slug}.json`)
    if (!fs.existsSync(turnsFile)) {
      console.log(`SALTATO  ${String(row.title).slice(0, 46)} — nessun file in ${TURNS_DIR}`)
      skipped += 1
      continue
    }
    const turns: Turn[] = JSON.parse(fs.readFileSync(turnsFile, 'utf8')).turns || []
    if (!turns.length) {
      console.log(`SALTATO  ${String(row.title).slice(0, 46)} — nessun turno`)
      skipped += 1
      continue
    }

    const html = String(row.html || '')
    const boundary = findBoundary(html)
    if (!boundary) {
      console.log(`SALTATO  ${String(row.title).slice(0, 46)} — confine non individuabile`)
      skipped += 1
      continue
    }

    const preamble = html.slice(0, boundary.at)
    // Most episodes put the donate button above the transcript, but two put it
    // below, and cutting there took it with them. Card blocks are page
    // furniture rather than transcript, so any found in the removed region is
    // carried over to the foot of the new text.
    const furniture = (html.slice(boundary.at).match(/<div class="kg-card[^"]*"[\s\S]*?<\/div>/g) || []).join('')
    const rendered = renderTurns(turns)
    const cpm = ours / (found.duration / 60)

    console.log(
      `${apply ? 'SCRIVO ' : 'SCRIVEREI'} ${String(row.title).slice(0, 40).padEnd(42)} `
        + `${cpm.toFixed(0).padStart(4)} c/min → ${(theirs / (found.duration / 60)).toFixed(0)} · ${boundary.rule}`,
    )
    console.log(`    tengo  …${preamble.slice(-90).replace(/\s+/g, ' ')}`)
    console.log(`    tolgo  ${html.slice(boundary.at, boundary.at + 90).replace(/\s+/g, ' ')}…`)
    console.log(`    metto  ${rendered.html.slice(0, 90).replace(/\s+/g, ' ')}…`)
    if (furniture) console.log(`    riporto in fondo ${furniture.slice(0, 76).replace(/\s+/g, ' ')}…`)

    if (apply) {
      fs.writeFileSync(
        path.join(BACKUP_DIR, `${row.slug}.${stamp}.json`),
        JSON.stringify({ id: row.id, slug: row.slug, html, transcriptText: row.transcript_text }, null, 2),
      )
      await db.execute({
        sql: "UPDATE episodes SET html = ?, transcript_text = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        args: [preamble + rendered.html + furniture, rendered.text, row.id as number],
      })
    }
    replaced += 1
  }

  console.log(
    `\n${apply ? 'Sostituiti' : 'Da sostituire'}: ${replaced}; saltati: ${skipped}.`
      + (apply
        ? `\nIl testo precedente è in ${BACKUP_DIR}/<slug>.${stamp}.json.`
          + '\n⚠️ Le ancore dei capitoli puntano al testo vecchio: ora è obbligatorio'
          + '\n   npm run chapters:castopod -- --refresh --apply'
        : '\nProva a vuoto. Rileggi i confini qui sopra, poi rilancia con --apply.'),
  )
  db.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
