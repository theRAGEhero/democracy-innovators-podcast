import { describe, expect, it } from 'vitest'

import { episodeLabel } from '@/lib/episode-number'

// The number beside an episode used to be its position in the list, so the
// newest was always "01". These are the three cases the real numbering has.

describe('the number shown beside an episode', () => {
  it('pads the main series to two digits', () => {
    expect(episodeLabel({ episodeNumber: 62, episodeSeries: 'main' })).toBe('62')
    expect(episodeLabel({ episodeNumber: 7, episodeSeries: 'main' })).toBe('07')
  })

  it('marks the Italian series, which numbers itself from one', () => {
    // Without the prefix these read as the main series' first three.
    expect(episodeLabel({ episodeNumber: 1, episodeSeries: 'ita' })).toBe('IT 01')
    expect(episodeLabel({ episodeNumber: 3, episodeSeries: 'ita' })).toBe('IT 03')
  })

  it('shows nothing for an episode the feed does not number', () => {
    // The introductory trailer. A borrowed number would be worse than none.
    expect(episodeLabel({ episodeNumber: null, episodeSeries: 'main' })).toBeNull()
    expect(episodeLabel({ episodeNumber: undefined, episodeSeries: undefined })).toBeNull()
  })

  it('refuses a number that is not one', () => {
    expect(episodeLabel({ episodeNumber: 0, episodeSeries: 'main' })).toBeNull()
    expect(episodeLabel({ episodeNumber: -3, episodeSeries: 'main' })).toBeNull()
    expect(episodeLabel({ episodeNumber: Number.NaN, episodeSeries: 'main' })).toBeNull()
  })
})
