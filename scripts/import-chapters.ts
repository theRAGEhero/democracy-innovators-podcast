import fs from 'node:fs'
import path from 'node:path'

import 'dotenv/config'
import config from '@payload-config'
import { getPayload } from 'payload'

import {
  computeAnchors,
  htmlToText,
  parseSrt,
  type AnchorMethod,
  type Chapter,
  type Cue,
} from './lib/chapter-anchors'
import { findSrtFile, subjectFromFolder, FOLDER_ALIASES, NEXTCLOUD_ROOT, SUBDIRS } from './lib/nextcloud-srt'

// Imports per-episode chapter markers from the Castopod chapter JSON files in
// Nextcloud into the episodes.chapters field, and computes a text `anchor` for
// each chapter so the site can place a heading at the right spot in the
// transcript.
//
// NEXTCLOUD IS READ-ONLY: this script only ever reads from the Podcast folder
// (fs.readFileSync / readdirSync / statSync / existsSync). It performs NO writes,
// renames, or deletes anywhere under `root`. All writes go to the Payload DB.

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

// --- text helpers -----------------------------------------------------------


// Lowercase, alphanumeric words separated by single spaces — the space the
// render helper will also search in.
// --- SRT --------------------------------------------------------------------


// --- anchor computation -----------------------------------------------------

// ---------------------------------------------------------------------------

async function main() {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const root = positional[0] || NEXTCLOUD_ROOT
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
