import { describe, expect, it } from 'vitest'

import { cueForOffset, describeCitation, findCues, locateChunk, turnBoundedQuote } from '@/lib/citation-context'

// Cue formats taken from the real archive.
const A = 'Automatic transcription. Alessandro Oppo (00:00) Welcome to the show. Simon Horton (00:11) Thank you for having me.'
const D = '[3:01] Carlo: yeah i can add here. [5:14] Eugene: thank you so much.'
const chapters = [
  { startTime: 0, title: 'Intro' },
  { startTime: 600, title: 'Deliberation in practice' },
  { startTime: 1800, title: 'What comes next' },
]

describe('citation context', () => {
  it('reads name and minute from both cue formats', () => {
    expect(findCues(A).map((c) => [c.speaker, c.startTime])).toEqual([
      ['Alessandro Oppo', 0],
      ['Simon Horton', 11],
    ])
    expect(findCues(D).map((c) => [c.speaker, c.startTime])).toEqual([
      ['Carlo', 181],
      ['Eugene', 314],
    ])
  })

  it('credits the turn the quote sits in, not the first of the chunk', () => {
    // Taking the first cue would put every quote in the host's mouth.
    const cues = findCues(A)
    expect(cueForOffset(cues, A.indexOf('Thank you'))?.speaker).toBe('Simon Horton')
    expect(cueForOffset(cues, A.indexOf('Welcome'))?.speaker).toBe('Alessandro Oppo')
  })

  it('names nobody when the quote precedes every cue in the chunk', () => {
    // A turn that began in the previous chunk. The first cue here is the host
    // picking up afterwards, so borrowing it credited guests' answers to the
    // interviewer — the bug this guards.
    const cues = findCues(A)
    expect(cueForOffset(cues, 3)).toBeNull()
    const context = describeCitation({ text: A, snippetStart: 3, chunkIndex: 0, chapters: [] })
    expect(context.speaker).toBeUndefined()
  })

  it('cuts the quote at the change of speaker', () => {
    // The card puts one name above the quote, so the quote has to stop where
    // that person stops talking — otherwise it shows two people as one.
    const long = `Alessandro Oppo (00:00) ${'and so the question is really about deliberation. '.repeat(4)}Simon Horton (00:11) ${'my answer begins here. '.repeat(4)}`
    const quote = turnBoundedQuote(long, long.indexOf('deliberation'))!
    expect(quote).toContain('the question is really about deliberation')
    expect(quote).not.toContain('Simon Horton')
    expect(quote).not.toContain('my answer begins here')
  })

  it('finds a chunk inside its transcript so the cue can be in an earlier one', () => {
    // Roughly half the retrieved chunks open mid-turn, with the cue naming the
    // speaker sitting in the chunk before.
    const body = Array.from({ length: 20 }, (_, i) => `point number ${i} about negotiation and deliberation.`).join(' ')
    const transcript = `Simon Horton (00:11) ${body} the important passage continues`
    const chunk = transcript.slice(200)
    const at = locateChunk(transcript, chunk, 10)
    expect(at).toBe(210)
    expect(describeCitation({ text: transcript, snippetStart: at!, chunkIndex: 1, chapters: [] }).speaker).toBe('Simon Horton')
  })

  it('drops sentence fragments swept into the name', () => {
    // "Mm." before a name is the tail of the previous sentence, not a first name.
    expect(findCues('blah. Mm. Paul Zeitz (37:07) I want to hear')[0].speaker).toBe('Paul Zeitz')
    // A genuine initial survives.
    expect(findCues('TIAGO C. PEIXOTO (00:14) hello')[0].speaker).toBe('TIAGO C. PEIXOTO')
  })

  it('keeps the minute but drops the name when the cue is far from the quote', () => {
    // A gap this size means the transcript never marked the turn that is
    // actually being quoted. Better no name than a wrong one.
    const far = `Simon Horton (00:11) ${'filler words here. '.repeat(250)}the important passage`
    const context = describeCitation({
      text: far,
      snippetStart: far.indexOf('the important passage'),
      chunkIndex: 0,
      chapters,
    })
    expect(context.speaker).toBeUndefined()
    expect(context.startTime).toBe(11)
  })

  it('places the quote in the chapter that covers its minute', () => {
    const text = 'Alessandro Oppo (12:00) and what about deliberation in practice?'
    const context = describeCitation({ text, snippetStart: text.indexOf('and what'), chunkIndex: 0, chapters })
    expect(context.startTime).toBe(720)
    expect(context.chapter).toEqual({ id: 'ch-2-deliberation-in-practice', title: 'Deliberation in practice', startTime: 600 })
  })

  it('falls back to position when the transcript carries no minutes', () => {
    const context = describeCitation({
      text: 'Alessandro: welcome. Simon: thanks for having me.',
      snippetStart: 25,
      chunkIndex: 8,
      chapters,
      transcriptWords: 5000,
    })
    expect(context.speaker).toBeUndefined()
    expect(context.chapter).toBeDefined()
    // Playback still has somewhere honest to start.
    expect(context.startTime).toBe(context.chapter!.startTime)
  })

  it('offers nothing rather than guessing when there is neither', () => {
    const context = describeCitation({ text: 'plain text with no cues', snippetStart: 3, chunkIndex: 0, chapters: [] })
    expect(context).toEqual({})
  })
})
