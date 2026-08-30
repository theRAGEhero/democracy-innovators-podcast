import { describe, expect, it } from 'vitest'

import { chunkTurns, timeForOffset, type Turn } from '@/lib/archive-rag'

const words = (count: number, word = 'parola') => Array.from({ length: count }, () => word).join(' ')

const turn = (start: number, end: number, speaker: string | null, text: string): Turn => ({
  start,
  end,
  speaker,
  text,
})

describe('cutting a timed transcript into passages', () => {
  it('keeps a turn whole rather than cutting on a word count', () => {
    const chunks = chunkTurns(
      [
        turn(0, 10, 'Alessandro Oppo', 'Cosa è CitizenOS?'),
        turn(10, 120, 'Margo Loor', words(200)),
        turn(120, 130, 'Alessandro Oppo', 'Grazie.'),
      ],
      250,
    )
    // The answer is never split down the middle: every turn appears intact.
    for (const chunk of chunks) {
      expect(chunk.text).not.toMatch(/parola parola$/)
    }
    expect(chunks[0].text).toContain('Cosa è CitizenOS?')
  })

  it('carries the seconds the passage spans', () => {
    const [chunk] = chunkTurns([turn(12.5, 48.25, 'Margo Loor', 'una risposta breve')], 250)
    expect(chunk.startTime).toBe(12.5)
    expect(chunk.endTime).toBe(48.25)
  })

  it('names the voice only when the passage has one', () => {
    const [single] = chunkTurns([turn(0, 5, 'Margo Loor', 'solo io parlo qui')], 250)
    expect(single.speakerName).toBe('Margo Loor')

    const [mixed] = chunkTurns(
      [turn(0, 5, 'Alessandro Oppo', 'una domanda'), turn(5, 10, 'Margo Loor', 'una risposta')],
      250,
    )
    // Two voices in one passage: the name belongs to the timeline, not the
    // passage, or a citation would be headed with the wrong person.
    expect(mixed.speakerName).toBeNull()
  })

  it('resolves the second and the speaker of the words that were matched', () => {
    const [chunk] = chunkTurns(
      [
        turn(0, 8, 'Alessandro Oppo', 'Cosa è il bilancio partecipativo?'),
        turn(8, 60, 'Paolo Spada', 'È un modo di decidere insieme come spendere il denaro pubblico.'),
      ],
      250,
    )
    const at = chunk.text.indexOf('denaro')
    expect(timeForOffset(chunk.timeline, at)).toEqual({ seconds: 8, speaker: 'Paolo Spada' })
    // A word from the question resolves to the question, not to the answer.
    expect(timeForOffset(chunk.timeline, chunk.text.indexOf('bilancio'))).toEqual({
      seconds: 0,
      speaker: 'Alessandro Oppo',
    })
  })

  it('overlaps by one turn so a thought on a boundary is findable from both sides', () => {
    const chunks = chunkTurns(
      [
        turn(0, 60, 'A', words(150, 'primo')),
        turn(60, 120, 'B', words(150, 'secondo')),
        turn(120, 180, 'A', words(150, 'terzo')),
      ],
      250,
    )
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[1].text).toContain('secondo')
  })

  it('splits a monologue long enough to average itself away', () => {
    const chunks = chunkTurns([turn(0, 600, 'Bruce Schneier', `${words(300)}. ${words(300)}.`)], 250, 400)
    expect(chunks.length).toBeGreaterThan(1)
    // The split stays inside the turn: no chunk claims time outside 0-600.
    for (const chunk of chunks) {
      expect(chunk.startTime).toBeGreaterThanOrEqual(0)
      expect(chunk.endTime).toBeLessThanOrEqual(600)
      expect(chunk.speakerName).toBe('Bruce Schneier')
    }
  })

  it('ignores empty turns instead of emitting empty passages', () => {
    const chunks = chunkTurns([turn(0, 1, 'A', '   '), turn(1, 5, 'B', 'qualcosa di vero')], 250)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe('qualcosa di vero')
  })

  it('returns nothing for nothing', () => {
    expect(chunkTurns([], 250)).toEqual([])
  })

  it('has no time to give for an offset before the first turn', () => {
    expect(timeForOffset([], 0)).toBeNull()
  })
})
