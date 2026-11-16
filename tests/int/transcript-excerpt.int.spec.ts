import { describe, expect, it } from 'vitest'

import { stripPreamble, transcriptExcerpt } from '@/lib/transcript-excerpt'

// Openings copied from transcript_text in the production database. The archive
// labels speakers in three ways and 26 transcripts open with a donation line
// and a disclaimer, so every fixture here is a real shape rather than an ideal.
const PAREN_CUES =
  'Donate on PayPal Automatic transcription, it can have errors. '
  + 'Alessandro Oppo (00:00) Welcome to another episode of the Democracy Innovator Podcast '
  + 'and our guest of today is Stefaan Verhulst. So, thank you for your time. '
  + 'Stefaan Verhulst (00:09) Thanks for having me, Alessandro. '
  + 'Alessandro Oppo (00:11) How did it start? '
  + 'Stefaan Verhulst (00:27) The genesis question.'

const BRACKET_CUES =
  'Donate on PayPal Automatic transcription and translation, it can have errors. '
  + 'The original italian transcription is after the English one. '
  + '[0:00] Alessandro Oppo: welcome to another episode of the Democracy Innovators podcast. '
  + '[0:18] Massimo Bugani: Thank you for inviting me.'

const BARE_LABELS =
  'Donate on PayPal Automatic transcription, it can contain errors: '
  + 'Alessandro Oppo: Welcome on another episode of Democracy Innovator Podcast and our guests '
  + 'of today are Marco Cappato and Francesco Vecchi and thank you for your time. '
  + 'Marco Cappato: Thank you. '
  + 'Alessandro Oppo: And you are working on a Eumans, right? '
  + 'Marco Cappato: Is a pan-European movement of popular initiative.'

const NO_LABELS =
  'Donate on PayPal Automatic transcription, it could contain errors. '
  + 'welcome on another episode of democracy innovator podcast and our guest of today is '
  + 'jonathan moskovic moskovic is fine you can say whatever thank you for your time'

const BOILERPLATE = /Donate on PayPal|utomatic transcription|could contain errors|can have errors/

describe('stripPreamble', () => {
  it('drops the donation line and the disclaimer clause ending in a colon', () => {
    expect(stripPreamble(BARE_LABELS)).toMatch(/^Alessandro Oppo: Welcome on another episode/)
  })

  it('drops a disclaimer clause ending in a full stop', () => {
    expect(stripPreamble(NO_LABELS)).toMatch(/^welcome on another episode/)
  })

  it('drops a disclaimer that runs to a second sentence', () => {
    expect(stripPreamble(BRACKET_CUES)).toMatch(/^\[0:00] Alessandro Oppo:/)
  })

  it('leaves a transcript with no preamble alone', () => {
    expect(stripPreamble('Alessandro Oppo: Straight in.')).toBe('Alessandro Oppo: Straight in.')
  })

  it('still removes a bare donation line with no disclaimer', () => {
    expect(stripPreamble('Donate on PayPal Alessandro Oppo: Hello.')).toBe('Alessandro Oppo: Hello.')
  })
})

describe('transcriptExcerpt', () => {
  it('reads timestamped cues and never shows the preamble', () => {
    const excerpt = transcriptExcerpt(PAREN_CUES)
    expect(excerpt.source).toBe('turns')
    expect(excerpt.turns.map((turn) => turn.speaker)).toEqual([
      'Alessandro Oppo',
      'Stefaan Verhulst',
      'Alessandro Oppo',
      'Stefaan Verhulst',
    ])
    expect(excerpt.turns[0].startTime).toBe(0)
    expect(excerpt.turns[1].startTime).toBe(9)
    expect(excerpt.turns.map((turn) => turn.text).join(' ')).not.toMatch(BOILERPLATE)
  })

  it('reads the reversed bracket form', () => {
    const excerpt = transcriptExcerpt(BRACKET_CUES)
    expect(excerpt.source).toBe('turns')
    expect(excerpt.turns.map((turn) => turn.speaker)).toEqual(['Alessandro Oppo', 'Massimo Bugani'])
    expect(excerpt.turns.map((turn) => turn.text).join(' ')).not.toMatch(BOILERPLATE)
  })

  // 19 of the 69 published transcripts have no timestamp anywhere.
  it('falls back to bare Name: labels when there are no timestamps', () => {
    const excerpt = transcriptExcerpt(BARE_LABELS)
    expect(excerpt.source).toBe('labels')
    expect(excerpt.turns.map((turn) => turn.speaker)).toEqual([
      'Alessandro Oppo',
      'Marco Cappato',
      'Alessandro Oppo',
      'Marco Cappato',
    ])
    expect(excerpt.turns.every((turn) => turn.startTime === null)).toBe(true)
    expect(excerpt.turns.map((turn) => turn.text).join(' ')).not.toMatch(BOILERPLATE)
  })

  it('falls back to plain text when there are no labels at all', () => {
    const excerpt = transcriptExcerpt(NO_LABELS)
    expect(excerpt.source).toBe('plain')
    expect(excerpt.turns).toHaveLength(1)
    expect(excerpt.turns[0].speaker).toBeNull()
    expect(excerpt.turns[0].text).toMatch(/^welcome on another episode/)
    expect(excerpt.turns[0].text).not.toMatch(BOILERPLATE)
  })

  it('does not read a mid-sentence colon as a speaker', () => {
    const excerpt = transcriptExcerpt(
      'The question is: who decides. And the answer is: nobody knows. So: we asked.',
    )
    expect(excerpt.source).toBe('plain')
  })

  it('believes a one-off label when the episode says that person is in it', () => {
    const text = 'Alessandro Oppo: Welcome. Carlo Michaelis: Glad to be here. Alessandro Oppo: Shall we?'
    expect(transcriptExcerpt(text, { knownNames: ['Carlo Michaelis'] }).source).toBe('labels')
  })

  it('keeps whole turns and stops at a turn boundary inside the budget', () => {
    const excerpt = transcriptExcerpt(PAREN_CUES, { budget: 120 })
    expect(excerpt.truncated).toBe(true)
    // The long opening turn alone exceeds 120, so it is the only one kept.
    expect(excerpt.turns).toHaveLength(1)
    expect(excerpt.chars).toBeLessThanOrEqual(120)
  })

  it('cuts a single over-long turn at a sentence, not mid-word', () => {
    const long = `Alessandro Oppo (00:00) ${'One sentence here. '.repeat(40)}`
    const excerpt = transcriptExcerpt(`${long}Carlo Michaelis (05:00) Short.`, { budget: 100 })
    expect(excerpt.turns).toHaveLength(1)
    expect(excerpt.turns[0].text).toMatch(/One sentence here\.$/)
    expect(excerpt.turns[0].text.length).toBeLessThanOrEqual(100)
  })

  it('caps the number of turns', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Speaker ${i % 2 ? 'One' : 'Two'} (0${i % 6}:0${i % 6}) Line ${i}.`).join(' ')
    const excerpt = transcriptExcerpt(many, { maxTurns: 4 })
    expect(excerpt.turns).toHaveLength(4)
    expect(excerpt.truncated).toBe(true)
  })

  it('is not truncated when the whole transcript fits', () => {
    const excerpt = transcriptExcerpt(PAREN_CUES)
    expect(excerpt.truncated).toBe(false)
  })

  it('survives an empty transcript', () => {
    const excerpt = transcriptExcerpt('')
    expect(excerpt.turns).toHaveLength(0)
    expect(excerpt.source).toBe('plain')
    expect(excerpt.chars).toBe(0)
  })
})
