// Putting the proper nouns back.
//
// Deepgram hears names it has never met and writes what it heard: "Dembrain"
// for Dembrane, "Andre Gray" for Andrew Gray, "Larry Lessie" for Larry Lessig,
// "Harmonic" for Harmonica, "Democracy Innovator" for Democracy Innovators. The
// errors are systematic and narrow, and the right spellings are already in the
// CMS: the episode's own guests, the project list, its title.
//
// The whole design rests on one asymmetry: a wrong correction is worse than the
// error it repairs. "Dembrain" is plainly a mishearing and a reader forgives
// it; a common word silently rewritten into someone's surname is a falsehood in
// the archive.
//
// The first version of this module was let loose on all 61 episodes and
// proposed 296 corrections, of which most were damage: "That" → "That's" eleven
// times, "Milan" → "Milano", "Fediverso" → "Fediverse" in an Italian episode,
// "Alessandro. So" → "Alessandro Oppo" across a sentence boundary. Every brake
// below is named after the failure it prevents, because each one was earned.

/** A correction that was applied, for the log the caller must read. */
export type Replacement = { from: string; to: string; count: number }

/** The spellings to correct towards, and the ones to leave alone. They travel
 *  together because using either without the other is a mistake. */
export type Glossary = { terms: string[]; protected: Set<string> }

const MAX_TERM_WORDS = 3
const MIN_TERM_LENGTH = 4
/**
 * A one-word term has to be longer, because it has no neighbours to confirm it.
 *
 * The project list is not linked to episodes — only guests and topics are — so
 * every project name is in scope for every episode, and short ones are
 * dangerous there. Six characters gives a word enough shape to be recognised
 * rather than guessed, and names it excludes ("Seth", "Margo") survive inside
 * their two-word forms.
 */
const MIN_SINGLE_WORD_LENGTH = 6
/** Never more than two edits, whatever the length. Beyond that the match is no
 *  longer a mishearing of the same word. */
const MAX_EDITS = 2
const MAX_EDIT_RATIO = 0.25
/** Two words of the same count should be nearly the same length. "Democracy
 *  Next" and "Democracy X" differ by three characters and are different things;
 *  without this they were within budget of each other. */
const MAX_LENGTH_GAP = 2

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A term that could be a name, or something the language already owns.
 *
 * Possessives and contractions are the trap: harvesting capitalised words from
 * prose collects "That's", "Tilt's", "There's", and then every "That" in the
 * archive is one edit from becoming "That's". A canonical name never needs an
 * apostrophe, so rejecting them costs nothing and removed the largest single
 * source of false corrections.
 */
function usableTerm(term: string): boolean {
  if (/['’]/.test(term)) return false
  const words = term.split(/\s+/)
  if (words.length > MAX_TERM_WORDS) return false
  const norm = normalize(term)
  return norm.length >= (words.length === 1 ? MIN_SINGLE_WORD_LENGTH : MIN_TERM_LENGTH)
}

/**
 * Proper nouns pulled out of prose — **runs of two or three capitalised words
 * only**.
 *
 * Single capitalised words in prose are mostly not names: "Thank", "Your",
 * "Right", "Catholic", "European", "Milano" all arrived that way and all of
 * them went on to corrupt ordinary speech. A run of two or three, by contrast,
 * is almost always a person or an organisation — "Larry Lessig", "Agora Citizen
 * Network", "Civic Tech Field Guide" — and those are exactly the corrections
 * worth making.
 */
export function properNouns(text: string): string[] {
  if (!text) return []
  const found: string[] = []
  const plain = text.replace(/<[^>]+>/g, ' ')
  for (const sentence of plain.split(/(?<=[.!?:;])\s+|\n+/)) {
    const words = sentence.trim().split(/\s+/)
    let run: string[] = []
    const flush = () => {
      if (run.length >= 2) found.push(run.slice(0, MAX_TERM_WORDS).join(' '))
      run = []
    }
    for (const [index, word] of words.entries()) {
      const bare = word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
      // Sentence-initial words are skipped: every sentence starts with a
      // capital and almost none of them opens with a name. Single letters are
      // skipped too — a title reading "on AI in the public sector" produced the
      // term "AI I", which then rewrote every "As I" and "Am I" in the archive.
      if (index > 0 && bare.length >= 2 && /^\p{Lu}[\p{L}\p{M}-]*$/u.test(bare)) {
        run.push(bare)
        continue
      }
      flush()
    }
    flush()
  }
  return found
}

/**
 * The spellings this episode is allowed to correct towards.
 *
 * Structured fields first — guests and projects are what the CMS actually
 * knows. The title contributes single words too, because that is where a
 * product name like "Dembrane" or "Harmonica" is spelled correctly and nowhere
 * else. Free prose contributes only multi-word runs.
 *
 * Topics are deliberately absent: they are generic nouns ("Participation",
 * "Innovation") and correcting towards them turned Italian words into English
 * ones.
 */
export function buildGlossary(input: {
  host: string
  guests: string[]
  projects: string[]
  /** The episode title: single words from here are trusted. */
  title: string
  /** Summaries and published text: multi-word runs only. */
  prose: string[]
}): Glossary {
  // Two tiers, kept apart until the end. What the CMS states outright is
  // trusted; what was scraped out of prose has to earn its place.
  const structured = new Set<string>()
  const harvested = new Set<string>()
  const add = (into: Set<string>, value: string | null | undefined) => {
    const trimmed = (value || '').trim()
    if (trimmed && usableTerm(trimmed)) into.add(trimmed)
  }

  // Full names and their parts: the host is named by first name far more often
  // than in full, and so is a guest once the conversation is under way.
  for (const name of [input.host, ...input.guests]) {
    add(structured, name)
    for (const part of name.split(/\s+/)) add(structured, part)
  }
  for (const project of input.projects) add(structured, project)

  for (const word of input.title.split(/\s+/)) {
    const bare = word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
    if (/^\p{Lu}/u.test(bare)) add(structured, bare)
  }
  for (const text of [input.title, ...input.prose]) {
    for (const term of properNouns(text)) add(harvested, term)
  }

  // Our own published transcripts carry their own mishearings, and harvesting
  // proper nouns from them turned Deepgram's correct spelling into our wrong
  // one: "Bicocca University" became "Bicoka University", "Sanghavi" became
  // "Sangavi", "Landemore" lost a letter. When a harvested term is a near
  // duplicate of something the CMS states outright, the CMS wins and the
  // harvested variant is dropped rather than allowed to compete.
  const structuredNorms = [...structured].map(normalize)
  const kept = [...harvested].filter((term) => {
    const norm = normalize(term)
    return !structuredNorms.some(
      (known) => known !== norm && editDistance(norm, known, MAX_EDITS) <= MAX_EDITS,
    )
  })

  return {
    terms: [...structured, ...kept],
    protected: protectedSpellings([input.title, ...input.prose]),
  }
}

/**
 * Words our own archive already spells this way, and which therefore must never
 * be rewritten.
 *
 * This is the brake that mattered most. Without it "Democracy" was being
 * rewritten to "Dreamocracy" ten times over, "Citizens" to "CitizenOS", and
 * "Deliberate" to "deliberAIde" — every one of them a real word of the
 * conversation sitting one or two edits from a project name. The published
 * transcripts and summaries are edited prose: if a word appears there, its
 * spelling is settled and no glossary term outranks it.
 */
export function protectedSpellings(prose: string[]): Set<string> {
  const safe = new Set<string>()
  for (const text of prose) {
    const plain = (text || '').replace(/<[^>]+>/g, ' ')
    // Every word, not only the capitalised ones. A candidate is capitalised
    // merely by opening a sentence — "Deliberate" and "Politics" arrived that
    // way and were being rewritten to "deliberAIde" and "Political" — so the
    // lower-case occurrences in our own prose are exactly what has to protect
    // them.
    for (const word of plain.match(/\p{L}[\p{L}\p{M}-]*/gu) || []) {
      const norm = normalize(word)
      if (norm.length >= MIN_TERM_LENGTH) safe.add(norm)
    }
  }
  return safe
}

/** Levenshtein, abandoned as soon as the whole row exceeds the budget — which
 *  is what makes running it over every candidate affordable. */
function editDistance(a: string, b: string, budget: number): number {
  if (Math.abs(a.length - b.length) > budget) return budget + 1
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    let best = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      if (current[j] < best) best = current[j]
    }
    if (best > budget) return budget + 1
    previous = current
  }
  return previous[b.length]
}

type Indexed = { term: string; norm: string; words: number }

function indexGlossary(glossary: string[]): Map<string, Indexed[]> {
  const byInitial = new Map<string, Indexed[]>()
  for (const term of glossary) {
    const norm = normalize(term)
    if (!norm) continue
    const entry = { term, norm, words: norm.split(' ').length }
    const bucket = byInitial.get(norm[0])
    if (bucket) bucket.push(entry)
    else byInitial.set(norm[0], [entry])
  }
  return byInitial
}

/**
 * Rewrite near-misses of glossary terms to their canonical spelling.
 *
 * The brakes, each one traceable to a false correction it prevents:
 *
 *  - **Only capitalised runs are considered.** Deepgram capitalises what it
 *    takes for a name, so that is where its guesses live — and it is what stops
 *    a project called "Feel" from eating every "feel" in the conversation.
 *  - **A run may not cross a sentence end.** "Alessandro. So" was being matched
 *    against "Alessandro Oppo" and rewritten, welding two sentences together.
 *  - **The first letter must survive.** Mishearings distort the middle of a
 *    word far more often than its start, and the constraint turns the search
 *    from every term into a handful.
 *  - **At most two edits, and for multi-word terms a length gap of at most
 *    two.** Beyond that it is a different word, not a misheard one.
 *  - **An exact match is never touched.**
 */
export function correctNames(
  text: string,
  glossary: Glossary,
): { text: string; replacements: Replacement[] } {
  const index = indexGlossary(glossary.terms)
  const exact = new Set([...index.values()].flat().map((entry) => entry.norm))
  const counts = new Map<string, Replacement>()

  const RUN = /\p{Lu}[\p{L}\p{M}-]*(?:\s+\p{Lu}[\p{L}\p{M}-]*){0,2}/gu
  const out = text.replace(RUN, (candidate) => {
    const norm = normalize(candidate)
    const wordCount = norm ? norm.split(' ').length : 0
    if (!wordCount || exact.has(norm) || glossary.protected.has(norm)) return candidate
    if (norm.length < (wordCount === 1 ? MIN_SINGLE_WORD_LENGTH : MIN_TERM_LENGTH)) return candidate

    const budget = Math.min(Math.floor(norm.length * MAX_EDIT_RATIO), MAX_EDITS)
    if (budget < 1) return candidate

    let best: { entry: Indexed; distance: number } | null = null
    for (const entry of index.get(norm[0]) || []) {
      if (entry.words !== wordCount) continue
      if (Math.abs(entry.norm.length - norm.length) > MAX_LENGTH_GAP) continue
      // One string containing the other from the start is a truncation, not a
      // mishearing: "DemocracyX" → "Democracy" would quietly drop the X.
      if (entry.norm.startsWith(norm) || norm.startsWith(entry.norm)) continue
      const distance = editDistance(norm, entry.norm, budget)
      if (distance <= budget && (!best || distance < best.distance)) best = { entry, distance }
    }
    if (!best || best.distance === 0) return candidate

    const key = `${candidate} ${best.entry.term}`
    const seen = counts.get(key)
    if (seen) seen.count += 1
    else counts.set(key, { from: candidate, to: best.entry.term, count: 1 })
    return best.entry.term
  })

  return { text: out, replacements: [...counts.values()].sort((a, b) => b.count - a.count) }
}
