// Chapter model + transcript heading injection.
//
// The importer (scripts/import-chapters.ts) stores, per chapter, an optional
// `anchor` — a normalized phrase (lowercase alphanumeric words) that is verified
// to exist in the episode transcript. Here we locate that phrase inside the
// transcript HTML and splice a <h2> heading in front of the paragraph that
// contains it, and build a matching table of contents.

export type Chapter = {
  startTime: number
  title: string
  description?: string
  anchor?: string
}

export type TocEntry = {
  id: string
  title: string
  startTime: number
  anchored: boolean
}

/** The id given to a chapter heading spliced into the transcript. */
export function chapterAnchorId(index: number, title: string): string {
  return `ch-${index + 1}-${slugify(title)}`
}

export function normalizeChapters(raw: unknown): Chapter[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { chapters?: unknown }).chapters)
      ? (raw as { chapters: unknown[] }).chapters
      : []
  const out: Chapter[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    const rawTime = c.startTime ?? c.start
    const startTime = typeof rawTime === 'number' ? rawTime : parseTimestamp(rawTime)
    const title = typeof c.title === 'string' ? c.title.trim() : ''
    if (startTime === null || !title) continue
    const chapter: Chapter = { startTime, title }
    const description = typeof c.description === 'string' ? c.description.trim() : ''
    if (description) chapter.description = description
    if (typeof c.anchor === 'string' && c.anchor.trim()) chapter.anchor = c.anchor.trim()
    out.push(chapter)
  }
  return out.sort((a, b) => a.startTime - b.startTime)
}

export function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number') return Math.floor(value)
  if (typeof value !== 'string') return null
  const t = value.trim()
  if (/^\d+(\.\d+)?$/.test(t)) return Math.floor(Number(t))
  const parts = t.split(':').map(Number)
  if (parts.some((n) => Number.isNaN(n))) return null
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

export function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Also used to build chapter anchors outside this module; the two must
 *  produce the same id or the links miss. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Normalized transcript text (lowercase alphanumeric words, single-spaced) plus a
// map from each normalized-char index back to its offset in the original HTML.
// Mirrors the normalization the importer used, so stored anchors match here.
function buildNormalizedIndex(html: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  let prevSpace = true
  for (let i = 0; i < html.length; i++) {
    const ch = html[i]
    if (ch === '<') {
      const end = html.indexOf('>', i)
      i = end < 0 ? html.length : end
      if (!prevSpace && norm.length) {
        norm += ' '
        map.push(i)
        prevSpace = true
      }
      continue
    }
    if (ch === '&') {
      const semi = html.indexOf(';', i)
      if (semi >= 0 && semi - i <= 10) i = semi
      if (!prevSpace && norm.length) {
        norm += ' '
        map.push(i)
        prevSpace = true
      }
      continue
    }
    const lower = ch.toLowerCase()
    if ((lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')) {
      norm += lower
      map.push(i)
      prevSpace = false
    } else if (!prevSpace && norm.length) {
      norm += ' '
      map.push(i)
      prevSpace = true
    }
  }
  return { norm, map }
}

// Walk back from an HTML offset to the start of the block that contains it.
function blockStartBefore(html: string, offset: number): number {
  const slice = html.slice(0, offset)
  const candidates = ['<p', '<h2', '<h3', '<h4', '<li', '<blockquote']
  let best = -1
  for (const tag of candidates) best = Math.max(best, slice.lastIndexOf(tag))
  return best >= 0 ? best : offset
}

// Inject <h2> chapter headings into the transcript HTML and return the augmented
// HTML plus a table of contents. Chapters without a locatable anchor are still
// listed in the ToC (not linked).
export function buildTranscriptChapters(
  html: string,
  rawChapters: unknown,
): { html: string; toc: TocEntry[] } {
  const chapters = normalizeChapters(rawChapters)
  if (!html || !chapters.length) return { html: html || '', toc: [] }

  const { norm, map } = buildNormalizedIndex(html)
  const inserts: { offset: number; order: number; html: string }[] = []
  const toc: TocEntry[] = []
  let searchFrom = 0
  const usedIds = new Set<string>()

  chapters.forEach((chapter, index) => {
    let id = chapterAnchorId(index, chapter.title)
    while (usedIds.has(id)) id = `${id}-x`
    usedIds.add(id)

    let anchored = false
    if (chapter.anchor) {
      const idx = norm.indexOf(chapter.anchor, searchFrom)
      if (idx >= 0) {
        searchFrom = idx + chapter.anchor.length
        const offset = blockStartBefore(html, map[idx])
        inserts.push({
          offset,
          order: index,
          html: `<h2 id="${id}" class="chapter-heading">${escapeHtml(chapter.title)}</h2>`,
        })
        anchored = true
      }
    }
    toc.push({ id, title: chapter.title, startTime: chapter.startTime, anchored })
  })

  // Apply from last offset to first so earlier offsets stay valid. For equal
  // offsets, keep chapter order (earlier chapter heading ends up first).
  inserts.sort((a, b) => b.offset - a.offset || b.order - a.order)
  let out = html
  for (const ins of inserts) out = out.slice(0, ins.offset) + ins.html + out.slice(ins.offset)

  return { html: out, toc }
}

// JSON-LD: expose chapters as PodcastEpisode.hasPart Clip entries.
export function chapterJsonLd(chapters: Chapter[], episodeUrl: string): object[] {
  return chapters.map((chapter) => ({
    '@type': 'Clip',
    name: chapter.title,
    startOffset: chapter.startTime,
    url: `${episodeUrl}#t=${chapter.startTime}`,
  }))
}

// JSON-LD VideoObject for the episode's YouTube video, with chapter Clips
// (start/end offsets) so results are eligible for "Key Moments".
export function videoObjectJsonLd(opts: {
  youtubeId: string
  name: string
  description?: string | null
  uploadDate?: string | null
  episodeUrl: string
  chapters: Chapter[]
}): object {
  const { youtubeId, name, description, uploadDate, episodeUrl, chapters } = opts
  const clips = chapters.map((chapter, index) => ({
    '@type': 'Clip',
    name: chapter.title,
    startOffset: chapter.startTime,
    ...(chapters[index + 1] ? { endOffset: chapters[index + 1].startTime } : {}),
    url: `${episodeUrl}#t=${chapter.startTime}`,
  }))
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name,
    description: description || name,
    thumbnailUrl: [`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`],
    ...(uploadDate ? { uploadDate } : {}),
    contentUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
    ...(clips.length ? { hasPart: clips } : {}),
  }
}
