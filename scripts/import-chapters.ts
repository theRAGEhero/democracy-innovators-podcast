import fs from 'node:fs'
import path from 'node:path'

import 'dotenv/config'
import config from '@payload-config'
import { getPayload } from 'payload'

// Imports per-episode chapter markers from the Castopod chapter JSON files in
// Nextcloud into the episodes.chapters field, and computes a text `anchor` for
// each chapter so the site can place a heading at the right spot in the
// transcript.
//
// NEXTCLOUD IS READ-ONLY: this script only ever reads from the Podcast folder
// (fs.readFileSync / readdirSync / statSync / existsSync). It performs NO writes,
// renames, or deletes anywhere under `root`. All writes go to the Payload DB.

const DEFAULT_ROOT =
  '/var/lib/docker/volumes/nextcloud_nextcloud_data/_data/data/alex/files/Podcast'
const SUBDIRS = ['Episodes', 'ITA - Episodes', '_Archive']

const FOLDER_ALIASES: Record<string, string> = {
  'rober bjarnason': 'robert-bjarnason-about-the-citizens-foundation-and-how-technology-supports-participatory-democracy',
  'helene landemore': 'helene',
  'max bugani': 'massimo-bugani-and-the-rousseau-platform-a-democratic-experiment',
  'seth and cecile': 'cecile-green-seth-frey-on-the-commoning-standard-and-the-role-of-self-governance-for-democracy',
}

const ANCHOR_MIN_WORDS = 5
const ANCHOR_MAX_WORDS = 9

type Chapter = { startTime: number; title: string; description?: string; anchor?: string }
type AnchorMethod = 'inline' | 'srt' | 'none'

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number') return Math.floor(value)
  if (typeof value !== 'string') return null
  const t = value.trim()
  if (/^\d+(\.\d+)?$/.test(t)) return Math.floor(Number(t))
  const parts = t.split(':').map(Number)
  if (parts.some((n) => Number.isNaN(n))) return null
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

function normalizeChapters(raw: unknown): Chapter[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { chapters?: unknown }).chapters)
      ? (raw as { chapters: unknown[] }).chapters
      : []
  return list
    .map((item): Chapter | null => {
      if (!item || typeof item !== 'object') return null
      const c = item as Record<string, unknown>
      const startTime = parseTimestamp(c.startTime ?? c.start)
      const title = typeof c.title === 'string' ? c.title.trim() : ''
      if (startTime === null || !title) return null
      const description =
        typeof c.description === 'string' ? c.description : typeof c.subtitle === 'string' ? c.subtitle : ''
      return { startTime, title, description: description.trim() || undefined }
    })
    .filter((c): c is Chapter => c !== null)
    .sort((a, b) => a.startTime - b.startTime)
}

function pickBestChapterFile(files: string[]): string | undefined {
  if (!files.length) return undefined
  const scored = files.map((file) => {
    let chapters: Chapter[] = []
    try {
      chapters = normalizeChapters(JSON.parse(fs.readFileSync(file, 'utf8')))
    } catch {
      chapters = []
    }
    const withDesc = chapters.filter((c) => c.description).length
    const preferredName = /chapters\.castopod\.json$/i.test(file) ? 1 : 0
    return { file, count: chapters.length, withDesc, preferredName }
  })
  scored.sort((a, b) => b.withDesc - a.withDesc || b.count - a.count || b.preferredName - a.preferredName)
  return scored[0].count ? scored[0].file : undefined
}

function subjectFromFolder(folderName: string): string {
  const withoutNumber = folderName.replace(/^\s*(ITA\s*)?\d+\s*-\s*/i, '').trim()
  return withoutNumber.split(' - ')[0].trim()
}

// --- text helpers -----------------------------------------------------------

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Lowercase, alphanumeric words separated by single spaces — the space the
// render helper will also search in.
function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Build an anchor phrase (5..9 words) from a source string.
function phraseFrom(source: string, maxWords = ANCHOR_MAX_WORDS): string {
  return normalizeText(source).split(' ').filter(Boolean).slice(0, maxWords).join(' ')
}

// --- SRT --------------------------------------------------------------------

type Cue = { sec: number; text: string }

// READ-ONLY: locates the best .srt in a folder. Prefers complete/verbatim
// variants (raw/original) since we match by content across the whole timeline.
function findSrtFile(dir: string): string | undefined {
  const srts = fs.readdirSync(dir).filter((f) => /\.srt$/i.test(f))
  if (!srts.length) return undefined
  const rank = (name: string) => {
    const n = name.toLowerCase()
    if (/\braw\b/.test(n)) return 0
    if (/original/.test(n)) return 1
    if (/cleaned/.test(n)) return 2
    if (/edit/.test(n)) return 3
    return 4
  }
  const withSize = srts.map((f) => {
    const full = path.join(dir, f)
    return { full, rank: rank(f), size: fs.statSync(full).size }
  })
  withSize.sort((a, b) => a.rank - b.rank || b.size - a.size)
  return withSize[0].full
}

function parseSrt(content: string): Cue[] {
  const cues: Cue[] = []
  for (const block of content.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() !== '')
    const timeIdx = lines.findIndex((l) => /-->/.test(l))
    if (timeIdx < 0) continue
    const m = lines[timeIdx].match(/(\d{2}):(\d{2}):(\d{2})/)
    if (!m) continue
    const sec = +m[1] * 3600 + +m[2] * 60 + +m[3]
    const text = lines.slice(timeIdx + 1).join(' ')
    if (text.trim()) cues.push({ sec, text })
  }
  return cues
}

// --- anchor computation -----------------------------------------------------

// Inline-timestamp transcripts: "(mm:ss)" or "[mm:ss]" markers sit in the text.
function inlineTimestamps(text: string): { sec: number; index: number }[] {
  const out: { sec: number; index: number }[] = []
  const re = /[([](\d{1,2}):(\d{2})(?::(\d{2}))?[)\]]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const sec = m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2]
    out.push({ sec, index: m.index + m[0].length })
  }
  return out
}

// Returns chapters with `anchor` filled where possible, plus which method was used.
// Strategy per chapter: try the transcript's own inline timestamps first (always
// same language); fall back to the SRT's finer granularity for any chapter the
// inline pass can't place (sparse timestamps) — but only when the SRT text
// actually matches the transcript (fails cleanly for translated episodes).
function computeAnchors(
  chapters: Chapter[],
  rawText: string,
  cues: Cue[],
): { chapters: Chapter[]; method: AnchorMethod; anchored: number } {
  const normHtml = normalizeText(rawText)
  const stamps = inlineTimestamps(rawText)
  const hasInline = stamps.length >= 3
  const hasSrt = cues.length >= 3

  const method: AnchorMethod = hasInline ? 'inline' : hasSrt ? 'srt' : 'none'
  let lastPos = -1
  let anchored = 0

  const withAnchors = chapters.map((chapter): Chapter => {
    let anchor = hasInline ? anchorFromInline(chapter.startTime, stamps, rawText, normHtml, lastPos) : undefined
    if (!anchor && hasSrt) anchor = anchorFromSrt(chapter.startTime, cues, normHtml, lastPos)
    if (anchor) {
      lastPos = normHtml.indexOf(anchor, lastPos + 1)
      anchored += 1
      return { ...chapter, anchor }
    }
    return chapter
  })

  return { chapters: withAnchors, method, anchored }
}

// Anchor from the transcript's own "(mm:ss)" markers: phrase just after the
// nearest marker at/before the chapter start, found after the previous anchor.
function anchorFromInline(
  startSec: number,
  stamps: { sec: number; index: number }[],
  rawText: string,
  normHtml: string,
  lastPos: number,
): string | undefined {
  let best = stamps[0]
  for (const s of stamps) {
    if (s.sec <= startSec + 3) best = s
    else break
  }
  for (const len of [140, 240, 380]) {
    const candidate = phraseFrom(rawText.slice(best.index, best.index + len))
    if (candidate.split(' ').length < ANCHOR_MIN_WORDS) continue
    const pos = normHtml.indexOf(candidate, lastPos + 1)
    if (pos >= 0) return candidate
  }
  return undefined
}

// Windowed match: find a distinctive phrase from SRT cues near the chapter start
// that appears in the transcript AFTER the previous anchor (monotonic).
function anchorFromSrt(startSec: number, cues: Cue[], normHtml: string, lastPos: number): string | undefined {
  const windows = [
    [startSec - 5, startSec + 40],
    [startSec - 12, startSec + 90],
  ]
  for (const [lo, hi] of windows) {
    const inWindow = cues.filter((c) => c.sec >= lo && c.sec <= hi)
    for (const cue of inWindow) {
      const words = normalizeText(cue.text).split(' ').filter((w) => w.length > 2)
      for (let i = 0; i + ANCHOR_MIN_WORDS <= words.length; i++) {
        const candidate = words.slice(i, i + ANCHOR_MAX_WORDS).join(' ')
        const pos = normHtml.indexOf(candidate, lastPos + 1)
        if (pos >= 0) return candidate
      }
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------

async function main() {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const root = positional[0] || DEFAULT_ROOT
  const apply = !process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  const { docs: episodes } = await payload.find({ collection: 'episodes', depth: 0, limit: 1000 })
  const bySlugPrefix = (key: string) => episodes.find((e) => e.slug === key || e.slug.startsWith(`${key}-`))

  let updated = 0
  let totalChapters = 0
  let totalAnchored = 0
  const byMethod: Record<AnchorMethod, number> = { inline: 0, srt: 0, none: 0 }
  const unmatched: string[] = []
  const partial: string[] = []

  for (const sub of SUBDIRS) {
    const base = path.join(root, sub)
    if (!fs.existsSync(base)) continue
    for (const folder of fs.readdirSync(base)) {
      const dir = path.join(base, folder)
      if (!fs.statSync(dir).isDirectory()) continue

      const chapterFiles = fs
        .readdirSync(dir)
        .filter((f) => /chapter.*\.json$/i.test(f))
        .map((f) => path.join(dir, f))
      const best = pickBestChapterFile(chapterFiles)
      if (!best) continue

      const parsed = normalizeChapters(JSON.parse(fs.readFileSync(best, 'utf8')))
      if (!parsed.length) continue

      const subject = subjectFromFolder(folder)
      const key = slugify(subject)
      const aliasSlug = FOLDER_ALIASES[subject.toLowerCase()]
      const episode =
        (aliasSlug && episodes.find((e) => e.slug === aliasSlug)) ||
        bySlugPrefix(key) ||
        episodes.find((e) => e.title.toLowerCase().includes(subject.toLowerCase()))

      if (!episode) {
        unmatched.push(`${sub}/${folder} (subject "${subject}", ${parsed.length} ch)`)
        continue
      }

      const rawText = htmlToText(episode.html || episode.transcriptText || '')
      let cues: Cue[] = []
      const srtFile = findSrtFile(dir)
      if (srtFile) {
        try {
          cues = parseSrt(fs.readFileSync(srtFile, 'utf8'))
        } catch {
          cues = []
        }
      }

      const { chapters, method, anchored } = computeAnchors(parsed, rawText, cues)
      byMethod[method] += 1
      totalChapters += chapters.length
      totalAnchored += anchored
      if (anchored < chapters.length && method !== 'none') {
        partial.push(`${episode.slug} — ${anchored}/${chapters.length} anchored (${method})`)
      }

      if (apply) {
        await payload.update({
          collection: 'episodes',
          id: episode.id,
          data: { chapters, _status: 'published' },
          overrideAccess: true,
        })
      }
      updated += 1
      payload.logger.info(
        `✓ ${episode.slug} — ${chapters.length} ch, ${anchored} anchored [${method}${srtFile ? ', srt' : ''}]`,
      )
    }
  }

  payload.logger.info(
    `\nChapters import ${apply ? 'complete' : '(dry run)'}: ${updated} episodes, ${totalChapters} chapters, ${totalAnchored} anchored.`,
  )
  payload.logger.info(
    `Anchor method: inline=${byMethod.inline}, srt=${byMethod.srt}, none=${byMethod.none} episodes.`,
  )
  if (partial.length) payload.logger.info(`Partially anchored:\n  ${partial.join('\n  ')}`)
  if (unmatched.length) payload.logger.info(`Unmatched folders: ${unmatched.length}\n  ${unmatched.join('\n  ')}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
