// The opening of a transcript, for the newsletter.
//
// The archive is not uniform, and an excerpt has to cope with all of it. Of the
// 69 published transcripts: 48 label turns as "Name (12:34)", 2 as
// "[12:34] Name:", and 19 carry no timestamp at all — those use a bare
// "Name:" on a single unbroken line. One has no labels whatsoever.
//
// 26 of them also open with "Donate on PayPal Automatic transcription, it can
// contain errors:" before the first word anybody actually said, which is why
// the preamble is stripped rather than trusted.
//
// Hence three tiers. The first costs nothing — starting at the first timestamped
// cue discards the preamble on its own.

import { speakerName, turnsFromTranscript } from '@/lib/citation-context'

export type ExcerptTurn = { speaker: string | null; startTime: number | null; text: string }

/** Which tier produced the excerpt. Surfaced in the admin so an editor can see
 *  when a mailing came from the weakest one and needs a human look. */
export type ExcerptSource = 'turns' | 'labels' | 'plain'

export type TranscriptExcerpt = {
  turns: ExcerptTurn[]
  source: ExcerptSource
  /** True when the transcript continues past what the excerpt shows. */
  truncated: boolean
  chars: number
}

/**
 * Wordings of the auto-transcription disclaimer found in the archive.
 *
 * Shared with scripts/normalise-transcript-notice.ts, which writes the first of
 * them — that one has to stay at the front, or the script cannot recognise its
 * own output and would add a second disclaimer to every page it had fixed.
 */
export const TRANSCRIPT_NOTICE_MARKERS = [
  'automatically transcribed',
  'transcript of the conversation',
  'full transcription of the interview',
  'automatic transcription',
  'automatic transcript',
  'ai made transcription',
  'interview transcription',
]

/** How far in to look for the disclaimer. Past this it is someone talking about
 *  transcription, not a header. */
const PREAMBLE_WINDOW = 400

/**
 * Everything from the start up to and including the disclaimer clause.
 *
 * The clause ends in either ":" or "." depending on the episode ("it can
 * contain errors:" vs "it can have errors."), and the whole thing sits on the
 * same line as the first speaker, so this cannot be done by splitting on
 * newlines.
 */
export function stripPreamble(text: string): string {
  if (!text) return ''
  const head = text.slice(0, PREAMBLE_WINDOW).toLowerCase()
  let from = -1
  for (const marker of TRANSCRIPT_NOTICE_MARKERS) {
    const found = head.indexOf(marker)
    if (found >= 0 && (from < 0 || found < from)) from = found + marker.length
  }
  if (from < 0) {
    // No disclaimer, but the donation line may still lead.
    const donate = /^\s*donate on paypal\s*/i.exec(text)
    return donate ? text.slice(donate[0].length).trimStart() : text
  }
  const end = /[.:]\s/.exec(text.slice(from))
  if (!end) return text
  return dropTrailingNotice(text.slice(from + end.index + end[0].length).trimStart())
}

// One episode's disclaimer runs to a second sentence ("The original italian
// transcription is after the English one."), which the clause scan above leaves
// behind. Only a sentence that talks about transcription or translation is
// dropped, and only at the very top, so it cannot reach into what was said.
const TRAILING_NOTICE = /^[^.!?]{0,160}\b(?:transcription|transcribed|translation)\b[^.!?]{0,160}[.!?]\s+/i

function dropTrailingNotice(text: string): string {
  let out = text
  for (let pass = 0; pass < 2; pass += 1) {
    const match = TRAILING_NOTICE.exec(out)
    if (!match) break
    out = out.slice(match[0].length).trimStart()
  }
  return out
}

// A speaker label with no timestamp: "Marco Cappato: Thank you." Anchored to the
// start of the text, a line break, or the end of a sentence, so a mid-sentence
// colon ("the question is: who decides") is not read as a cue.
const LABEL =
  /(?:^|\n|(?<=[.!?…]["')\]]?\s))(\p{Lu}[\p{L}\p{M}'’.\-]*(?:\s+\p{Lu}[\p{L}\p{M}'’.\-]*){0,3})\s*:\s+/gu

const key = (name: string) => name.toLowerCase().replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim()

/**
 * Turns from "Name:" labels, for the transcripts with no timestamps.
 *
 * A label is only believed if it recurs or if it names someone we already know
 * is in the episode — the same test annotateSpeakers applies to the HTML path.
 * Without it, any capitalised word before a colon ("So: here is the thing")
 * becomes a speaker.
 */
function labelTurns(text: string, knownNames: string[]): ExcerptTurn[] {
  const found: { name: string; start: number; end: number }[] = []
  LABEL.lastIndex = 0
  for (let match = LABEL.exec(text); match; match = LABEL.exec(text)) {
    const name = speakerName(match[1])
    if (!name) continue
    found.push({ name, start: match.index, end: match.index + match[0].length })
  }
  if (!found.length) return []

  const counts = new Map<string, number>()
  for (const label of found) counts.set(key(label.name), (counts.get(key(label.name)) || 0) + 1)
  const known = new Set(knownNames.map(key))
  const accepted = found.filter((label) => (counts.get(key(label.name)) || 0) > 1 || known.has(key(label.name)))
  if (!accepted.length) return []

  return accepted
    .map((label, index) => ({
      speaker: label.name,
      startTime: null,
      text: text.slice(label.end, accepted[index + 1]?.start ?? text.length).trim(),
    }))
    .filter((turn) => turn.text.length > 0)
}

/**
 * The longest prefix that fits, ending at a sentence if one is close enough.
 *
 * Cutting at a sentence needs no ellipsis — it is a complete thought. Falling
 * back to a word boundary does, and the 40% floor stops us throwing away most
 * of a long turn just to land on a full stop.
 */
function cutSoft(text: string, limit: number): string {
  if (text.length <= limit) return text
  const window = text.slice(0, limit)
  const sentence = /[.!?…]["')\]]?(?=\s|$)/g
  let cut = -1
  for (let match = sentence.exec(window); match; match = sentence.exec(window)) {
    cut = match.index + match[0].length
  }
  if (cut > limit * 0.4) return window.slice(0, cut).trimEnd()
  const word = window.lastIndexOf(' ')
  return `${(word > 0 ? window.slice(0, word) : window).trimEnd()}…`
}

/**
 * The opening turns of a transcript, inside a character budget.
 *
 * Whole turns are the unit, so a named person is never shown half a sentence.
 * The single-turn fallback exists because at least one episode opens with a
 * monologue longer than the whole budget.
 */
export function transcriptExcerpt(
  text: string,
  options: { budget?: number; maxTurns?: number; knownNames?: string[] } = {},
): TranscriptExcerpt {
  const budget = options.budget ?? 1800
  const maxTurns = options.maxTurns ?? 12
  const knownNames = options.knownNames ?? []

  let source: ExcerptSource = 'plain'
  let all: ExcerptTurn[] = []

  const cued = turnsFromTranscript(text)
  if (cued.length >= 2) {
    source = 'turns'
    all = cued.map((turn) => ({ speaker: turn.speaker, startTime: turn.startTime, text: turn.text }))
  } else {
    const stripped = stripPreamble(text)
    const labelled = labelTurns(stripped, knownNames)
    if (labelled.length >= 2) {
      source = 'labels'
      all = labelled
    } else if (stripped.trim()) {
      all = [{ speaker: null, startTime: null, text: stripped.trim() }]
    }
  }

  const turns: ExcerptTurn[] = []
  let used = 0
  let truncated = false
  for (const turn of all) {
    if (turns.length >= maxTurns) {
      truncated = true
      break
    }
    if (used + turn.text.length <= budget) {
      turns.push(turn)
      used += turn.text.length
      continue
    }
    if (!turns.length) {
      const text = cutSoft(turn.text, budget)
      turns.push({ ...turn, text })
      used += text.length
    }
    truncated = true
    break
  }
  if (!truncated && turns.length < all.length) truncated = true

  return { turns, source, truncated, chars: used }
}
