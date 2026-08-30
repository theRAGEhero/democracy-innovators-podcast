// Working out who is speaking, from what is said.
//
// Deepgram numbers voices 0, 1, 2 and knows no names. The conversation knows
// them: every episode opens with "Welcome to another episode... our guest of
// today is X", and the two people go on to address each other by name for the
// next hour. Three rules read that out of the transcript, and a fourth refuses
// to answer when they are not enough — because a wrong name under a citation is
// worse than no name at all.
//
// The rules were checked against the episodes that break the naive approach:
//
//   Misuraca          diarisation finds three voices in a two-person interview
//   Cecile & Seth     two guests, told apart only by one "Go ahead, Cecile"
//   Cappato & Vecchi  two guests who never introduce each other

import type { Utterance } from './deepgram-source'

export type SpeakerNames = Map<number, string | null>

export type Resolution = {
  /** Cluster number to person, or null where the evidence ran out. */
  names: SpeakerNames
  /** Clusters folded into another because they were the same voice. */
  merged: Map<number, number>
  /** What decided each assignment, for the log. */
  reasons: string[]
}

/** Two clusters this close together, with the first left hanging and the second
 *  opening in lower case, are one person mid-sentence. Beyond this the pause is
 *  long enough to be a genuine handover. */
const CONTINUATION_GAP_SECONDS = 1.5
/** How many continuations before a fragment is called the same voice. One can
 *  happen when two people talk over each other; two is a pattern. */
const CONTINUATION_VOTES = 2
/**
 * A cluster holding less than this share of the words is a fragment of someone
 * else rather than a participant in its own right.
 *
 * This is the guard that has to hold, and the first version did not have it:
 * continuations alone were enough to merge, and since an interviewer and a
 * guest finish each other's sentences constantly — Ryan Koch's two voices did
 * it seven times — thirty episodes collapsed into a single speaker and every
 * word the guest said was credited to the host.
 *
 * Measured across the archive, real participants sit between 12% and 67% of the
 * words; the one genuine artefact, the third voice Deepgram invents on the
 * Misuraca episode, sits at 3.8%. Six per cent separates them with room on both
 * sides.
 */
const FRAGMENT_SHARE = 0.06

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

/**
 * Clusters that finish each other's sentences.
 *
 * On the Misuraca episode Deepgram reports three voices where there are two:
 * speaker 0 says "...and before we were", speaker 2 says "talking about,
 * inspiring future," and speaker 0 resumes "would you like to tell us
 * something?". Speaker 2 is speaker 0. Nothing about the audio says so; the
 * grammar does.
 */
export function continuationVotes(utterances: Utterance[]): Map<string, number> {
  const votes = new Map<string, number>()
  for (let index = 1; index < utterances.length; index += 1) {
    const previous = utterances[index - 1]
    const current = utterances[index]
    if (previous.speaker === current.speaker) continue
    if (current.start - previous.end > CONTINUATION_GAP_SECONDS) continue
    // The first must be left hanging and the second must not start a sentence.
    if (/[.!?]["'’]?$/.test(previous.text.trim())) continue
    if (!/^[\p{Ll}]/u.test(current.text.trim())) continue
    const pair = [previous.speaker, current.speaker].sort((a, b) => a - b).join(':')
    votes.set(pair, (votes.get(pair) || 0) + 1)
  }
  return votes
}

/** Union-find over cluster numbers, so a chain of merges settles consistently. */
function unify(clusters: number[], pairs: [number, number][]): Map<number, number> {
  const parent = new Map(clusters.map((id) => [id, id]))
  const find = (id: number): number => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root) as number
    return root
  }
  for (const [a, b] of pairs) {
    const rootA = find(a)
    const rootB = find(b)
    // The larger cluster keeps its identity: the fragment joins the person.
    if (rootA !== rootB) parent.set(Math.max(rootA, rootB), Math.min(rootA, rootB))
  }
  return new Map(clusters.map((id) => [id, find(id)]))
}

/**
 * Names spoken *at* someone, which say who the speaker is not.
 *
 * "Thank you for the invitation, Alessandro" is not Alessandro talking, and
 * "Go ahead, Cecile" is how the two guests of one episode are told apart. Only
 * the vocative shapes count — a name in the middle of a sentence is usually a
 * reference, not an address.
 */
export function addressedNames(text: string, candidates: string[]): string[] {
  const found = new Set<string>()
  for (const candidate of candidates) {
    const name = firstName(candidate)
    if (name.length < 3) continue
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const vocative = new RegExp(
      // ", Name" near a clause end, or an opener like "thanks Name" / "go ahead Name"
      `(?:,\\s*${escaped}\\s*[.!?,]|(?:thank you|thanks|hi|hello|go ahead|welcome|sorry)[,\\s]+${escaped}\\b)`,
      'iu',
    )
    if (vocative.test(text)) found.add(candidate)
  }
  return [...found]
}

/**
 * Put names to Deepgram's cluster numbers.
 *
 * Order matters: fragments are folded in first, so that the counting and the
 * evidence that follow see people rather than artefacts.
 */
export function resolveSpeakers(input: {
  utterances: Utterance[]
  host: string
  guests: string[]
}): Resolution {
  const reasons: string[] = []
  const clusters = [...new Set(input.utterances.map((u) => u.speaker))].sort((a, b) => a - b)
  if (!clusters.length) return { names: new Map(), merged: new Map(), reasons }

  const words = new Map<number, number>()
  for (const utterance of input.utterances) {
    words.set(utterance.speaker, (words.get(utterance.speaker) || 0) + wordCount(utterance.text))
  }
  const totalWords = [...words.values()].reduce((sum, n) => sum + n, 0) || 1

  // --- fold fragments into the voice they interrupt ------------------------
  const votes = continuationVotes(input.utterances)
  const pairs: [number, number][] = []
  for (const [pair, count] of votes) {
    const [a, b] = pair.split(':').map(Number)
    const smaller = (words.get(a) || 0) <= (words.get(b) || 0) ? a : b
    const share = (words.get(smaller) || 0) / totalWords
    // Both conditions, never either: a cluster that is small enough to be an
    // artefact *and* is caught finishing another's sentences.
    if (share < FRAGMENT_SHARE && count >= CONTINUATION_VOTES) {
      pairs.push([a, b])
      reasons.push(
        `sp${a} e sp${b} uniti: ${count} frasi completate, il minore vale il ${(share * 100).toFixed(1)}% delle parole`,
      )
    }
  }
  const merged = unify(clusters, pairs)
  const canonical = [...new Set(merged.values())].sort((a, b) => a - b)

  const mergedWords = new Map<number, number>()
  for (const [id, root] of merged) mergedWords.set(root, (mergedWords.get(root) || 0) + (words.get(id) || 0))

  // --- the host opens the episode -----------------------------------------
  const host = merged.get(input.utterances[0].speaker) as number
  const names: SpeakerNames = new Map(canonical.map((id) => [id, null]))
  names.set(host, input.host)
  reasons.push(`sp${host} = ${input.host} (apre l'episodio)`)

  const others = canonical.filter((id) => id !== host)

  // --- one guest: whoever else is talking ----------------------------------
  if (input.guests.length === 1 && others.length === 1) {
    names.set(others[0], input.guests[0])
    reasons.push(`sp${others[0]} = ${input.guests[0]} (unico altro parlante)`)
    return { names, merged, reasons }
  }

  // --- more than one: rule out by direct address ---------------------------
  const spokenAt = new Map<number, Set<string>>()
  for (const utterance of input.utterances) {
    const root = merged.get(utterance.speaker) as number
    for (const name of addressedNames(utterance.text, input.guests)) {
      const set = spokenAt.get(root) || new Set<string>()
      set.add(name)
      spokenAt.set(root, set)
    }
  }

  const options = new Map(
    others.map((id) => [id, input.guests.filter((guest) => !spokenAt.get(id)?.has(guest))]),
  )
  // Settle the forced choices first, then see whether the rest follow.
  for (let pass = 0; pass < input.guests.length; pass += 1) {
    for (const [id, possible] of options) {
      if (names.get(id) || possible.length !== 1) continue
      names.set(id, possible[0])
      reasons.push(`sp${id} = ${possible[0]} (ha chiamato per nome gli altri)`)
      for (const [otherId, otherPossible] of options) {
        if (otherId === id) continue
        options.set(otherId, otherPossible.filter((guest) => guest !== possible[0]))
      }
    }
  }

  // A single guest left over and a single voice without a name: the two match.
  const namedGuests = new Set([...names.values()].filter(Boolean) as string[])
  const spare = input.guests.filter((guest) => !namedGuests.has(guest))
  const unnamed = others.filter((id) => !names.get(id))
  if (spare.length === 1 && unnamed.length === 1) {
    names.set(unnamed[0], spare[0])
    reasons.push(`sp${unnamed[0]} = ${spare[0]} (l'unico rimasto)`)
  }

  for (const id of others) {
    if (!names.get(id)) {
      const share = Math.round(((mergedWords.get(id) || 0) / totalWords) * 100)
      reasons.push(`sp${id} senza nome: ${share}% delle parole, prove insufficienti`)
    }
  }

  return { names, merged, reasons }
}
