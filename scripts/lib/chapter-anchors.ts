// Chapter anchors: the phrase in the transcript where a chapter begins, so the
// page can place its title at the right point in the text.
//
// Lifted verbatim out of scripts/import-chapters.ts, which reads its SRT from a
// folder, so that scripts/import-castopod-chapters.ts can use the same logic on
// an SRT taken from anywhere. Not rewritten: this produced the anchors of the
// 40 episodes that already have them, and they must stay exactly as they are —
// including its own normalizeText, which is not the one in src/lib.

export const ANCHOR_MIN_WORDS = 5
export const ANCHOR_MAX_WORDS = 9

export type Chapter = { startTime: number; title: string; description?: string; anchor?: string }
export type AnchorMethod = 'inline' | 'srt' | 'none'
export type Cue = { sec: number; text: string }

/** The transcript as plain text, keeping the inline "(mm:ss)" markers that
 *  anchoring relies on. */
export function htmlToText(html: string): string {
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

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Build an anchor phrase (5..9 words) from a source string.
export function phraseFrom(source: string, maxWords = ANCHOR_MAX_WORDS): string {
  return normalizeText(source).split(' ').filter(Boolean).slice(0, maxWords).join(' ')
}

export function parseSrt(content: string): Cue[] {
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

// Inline-timestamp transcripts: "(mm:ss)" or "[mm:ss]" markers sit in the text.
export function inlineTimestamps(text: string): { sec: number; index: number }[] {
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

export function computeAnchors(
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
export function anchorFromInline(
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
export function anchorFromSrt(startSec: number, cues: Cue[], normHtml: string, lastPos: number): string | undefined {
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
