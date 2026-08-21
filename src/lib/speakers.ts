// Speaker cues for imported transcripts.
//
// The episode body is legacy Ghost HTML rendered with dangerouslySetInnerHTML,
// and the archive carries five different ways of labelling who is speaking:
//
//   A  <p><br>Alessandro Oppo (00:00)<br>text          (22 episodes)
//   B  <p><strong>Bruce Schneier:</strong> text        (25 episodes)
//   C  <p><strong>[0:00] Massimo Bugani:</strong> text  (1)
//   D  <p>[3:01] Carlo: text                            (1)
//   E  <p>Andrés (00:13) text                           (1)
//   F  <p>Narration · 00:11:39</p>                      (1, a bare marker)
//
// In A, D, E and F the name is plain text with no markup at all, so CSS has
// nothing to hook onto. This module gives every recognised turn a wrapper the
// stylesheet can reach, and hands back the cast so the page can print a key.

export type Speaker = {
  /** Label as it appears in the transcript. */
  name: string
  /** 1-based colour slot, cycled past the fourth speaker. */
  slot: number
  /** Number of paragraphs this speaker opens. */
  turns: number
}

const SLOTS = 4

const TS = String.raw`\d{1,2}:\d{2}(?::\d{2})?`
const NAME = String.raw`\p{Lu}[\p{L}\p{M}'’.\-]*(?:\s+\p{Lu}[\p{L}\p{M}'’.\-]*){0,3}`
const LEAD = String.raw`(?:<br\s*/?>|&nbsp;|\s)*`

// <strong>[0:00] Name:</strong> — the colon may sit inside or outside the tag.
const STRONG_LABEL = new RegExp(
  `^(${LEAD})<strong>\\s*(?:\\[(${TS})\\]\\s*)?(${NAME})\\s*(?:\\((${TS})\\))?\\s*(:?)\\s*</strong>\\s*(:?)\\s*`,
  'u',
)

// [0:00] Name: / Name (00:00)<br> / Name (00:00) text
const PLAIN_LABEL = new RegExp(
  `^(${LEAD})(?:\\[(${TS})\\]\\s*)?(${NAME})(?:\\s*\\((${TS})\\))?(?:\\s*(:)\\s*|\\s*(<br\\s*/?>)\\s*|\\s+)`,
  'u',
)

// "Narration · 00:07:24" as a paragraph of its own.
const MARKER = new RegExp(`^\\s*(\\p{Lu}[\\p{L}\\p{M}]{2,})\\s*[·•|–-]\\s*(${TS})\\s*$`, 'u')

const PARAGRAPH = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi
const BLOCK_BREAK = /<(?:h[1-6]|hr|figure|blockquote|div|iframe|ul|ol|table)\b/i

type Match = { lead: string; name: string; time: string | null; rest: string }

/** A label is only a label if every word could plausibly be part of a name. */
function nameLike(name: string): boolean {
  const words = name.split(/\s+/).filter(Boolean)
  if (!words.length || words.length > 4) return false
  return words.every((word) => {
    if (/^\p{Lu}\.$/u.test(word)) return true // initial, e.g. "C."
    if (word.endsWith('.')) return false // sentence fragment, e.g. "No."
    return word.length >= 2
  })
}

function key(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').replace(/[.'’]/g, '').trim()
}

function tokens(name: string): string[] {
  return key(name).split(' ').filter(Boolean)
}

function matchLabel(inner: string): Match | null {
  const strong = STRONG_LABEL.exec(inner)
  if (strong) {
    const [full, lead, ts1, name, ts2, colonIn, colonOut] = strong
    const time = ts1 || ts2 || null
    if ((time || colonIn || colonOut) && nameLike(name)) {
      return { lead, name, time, rest: inner.slice(full.length) }
    }
    return null
  }
  const plain = PLAIN_LABEL.exec(inner)
  if (!plain) return null
  const [full, lead, ts1, name, ts2, colon] = plain
  const time = ts1 || ts2 || null
  // Without a timestamp or a colon this is just a sentence starting with a
  // capital letter — the guard that keeps prose from being read as a cue.
  if (!time && !colon) return null
  if (!nameLike(name)) return null
  return { lead, name, time, rest: inner.slice(full.length) }
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * Wrap every recognised speaker turn in markup the stylesheet can style, and
 * return the cast in first-appearance order. Safe to run on HTML that has
 * already been annotated: existing cues are left alone.
 */
export function annotateSpeakers(
  html: string,
  knownNames: string[] = [],
): { html: string; speakers: Speaker[] } {
  if (!html || !html.includes('<p')) return { html: html || '', speakers: [] }

  // --- pass 1: collect candidates -----------------------------------------
  const counts = new Map<string, { name: string; count: number; order: number }>()
  let order = 0
  let hasMarker = false
  PARAGRAPH.lastIndex = 0
  for (let m = PARAGRAPH.exec(html); m; m = PARAGRAPH.exec(html)) {
    if (m[1].includes('speaker-') || m[1].includes('transcript-marker')) {
      return { html, speakers: [] } // already annotated
    }
    if (MARKER.test(m[2].replace(/<[^>]+>/g, '').trim())) hasMarker = true
    const found = matchLabel(m[2])
    if (!found) continue
    const k = key(found.name)
    const seen = counts.get(k)
    if (seen) seen.count += 1
    else counts.set(k, { name: found.name, count: 1, order: order++ })
  }
  if (!counts.size && !hasMarker) return { html, speakers: [] }

  // --- pass 2: decide who is a speaker ------------------------------------
  // Recurring labels are speakers. A one-off is only a speaker if the episode
  // record names that person, or if it is a longer form of an accepted label
  // ("Alessandro Oppo" once, then "Alessandro" thirty times).
  const known = knownNames.map(key).filter(Boolean)
  const accepted = new Map<string, string>() // candidate key -> canonical key
  for (const [k, entry] of counts) {
    if (entry.count >= 2) accepted.set(k, k)
    else if (known.some((n) => n === k || tokens(n).every((t) => tokens(k).includes(t)))) accepted.set(k, k)
  }
  for (const [k, entry] of counts) {
    if (accepted.has(k) || entry.count >= 2) continue
    const canonical = [...accepted.values()].find((a) => {
      const at = tokens(a)
      return at.length && at.every((t) => tokens(k).includes(t))
    })
    if (canonical) accepted.set(k, canonical)
  }
  if (!accepted.size && !hasMarker) return { html, speakers: [] }

  // Slot 1 goes to the most talkative voice — on this show, the host.
  const canonicalKeys = [...new Set(accepted.values())]
  const totals = new Map(
    canonicalKeys.map((c) => [
      c,
      [...counts.entries()]
        .filter(([k]) => accepted.get(k) === c)
        .reduce((sum, [, e]) => sum + e.count, 0),
    ]),
  )
  const ranked = [...canonicalKeys].sort((a, b) => (totals.get(b) || 0) - (totals.get(a) || 0))
  const rest = canonicalKeys
    .filter((c) => c !== ranked[0])
    .sort((a, b) => (counts.get(a)?.order ?? 0) - (counts.get(b)?.order ?? 0))
  const ordered = ranked.length ? [ranked[0], ...rest] : []
  const slotOf = new Map(ordered.map((c, i) => [c, (i % SLOTS) + 1]))

  const speakers: Speaker[] = ordered.map((c) => ({
    name: counts.get(c)?.name || c,
    slot: slotOf.get(c) || 1,
    turns: totals.get(c) || 0,
  }))

  // --- pass 3: rewrite -----------------------------------------------------
  let out = ''
  let cursor = 0
  let current: number | null = null
  PARAGRAPH.lastIndex = 0
  for (let m = PARAGRAPH.exec(html); m; m = PARAGRAPH.exec(html)) {
    const between = html.slice(cursor, m.index)
    if (BLOCK_BREAK.test(between)) current = null
    out += between
    cursor = m.index + m[0].length

    const [, attrs, inner] = m
    const marker = MARKER.exec(inner.replace(/<[^>]+>/g, '').trim())
    if (marker) {
      current = null
      out += `<p${attrs} class="transcript-marker"><span class="speaker-name">${marker[1]}</span><span class="speaker-time">${marker[2]}</span></p>`
      continue
    }

    const found = matchLabel(inner)
    const slot = found ? slotOf.get(accepted.get(key(found.name)) || '') : undefined
    if (found && slot) {
      current = slot
      const time = found.time ? `<span class="speaker-time">${found.time}</span>` : ''
      out +=
        `<p${attrs} class="speaker-turn" data-speaker="${slot}">` +
        `<span class="speaker-cue"><span class="speaker-name">${escapeAttr(found.name)}</span>${time}</span>` +
        `${found.rest}</p>`
      continue
    }
    if (current) {
      out += `<p${attrs} class="speaker-cont" data-speaker="${current}">${inner}</p>`
      continue
    }
    out += m[0]
  }
  out += html.slice(cursor)

  return { html: out, speakers }
}
