import { describe, expect, it } from 'vitest'

import { citationLink, citationShareText } from '@/lib/citation-share'

const origin = 'https://stream.democracyinnovators.com'
const full = {
  title: 'Paolo Spada on participatory budgeting',
  url: '/episode/paolo-spada',
  snippet: '...to pay the participants, you need to pay the moderators...',
  speaker: 'Paolo Spada',
  startTime: 2598,
}

describe('sharing a citation', () => {
  it('carries the quote, who said it, when, and where to hear it', () => {
    expect(citationShareText(full, origin)).toBe(
      [
        '“...to pay the participants, you need to pay the moderators...”',
        '— Paolo Spada, 43:18 · Paolo Spada on participatory budgeting',
        '',
        'https://stream.democracyinnovators.com/episode/paolo-spada?t=2598',
      ].join('\n'),
    )
  })

  it('drops the name but keeps the moment', () => {
    // The common case: 27 of 57 transcripts carry speaker cues, so a citation
    // often has a minute and no name.
    const text = citationShareText({ ...full, speaker: undefined }, origin)
    expect(text).toContain('— 43:18 · Paolo Spada on participatory budgeting')
    expect(text).toContain('?t=2598')
  })

  it('leaves the link alone when there is no moment to point at', () => {
    const text = citationShareText({ ...full, startTime: undefined }, origin)
    expect(text).toContain('— Paolo Spada · Paolo Spada on participatory budgeting')
    expect(text).not.toContain('?t=')
    expect(text).toContain(`${origin}/episode/paolo-spada`)
  })

  it('still says something useful with neither', () => {
    const text = citationShareText({ ...full, speaker: undefined, startTime: undefined }, origin)
    expect(text).toContain('— Paolo Spada on participatory budgeting')
    expect(text).not.toContain('—  ·')
  })

  it('builds a link a listener can act on', () => {
    expect(citationLink(full, origin)).toBe(`${origin}/episode/paolo-spada?t=2598`)
    // A trailing slash on the origin must not double up.
    expect(citationLink(full, `${origin}/`)).toBe(`${origin}/episode/paolo-spada?t=2598`)
    // Whole seconds: the fraction would be noise in a shared link.
    expect(citationLink({ ...full, startTime: 2598.72 }, origin)).toContain('?t=2598')
  })
})
