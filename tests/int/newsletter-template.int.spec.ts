import { describe, expect, it } from 'vitest'

import {
  CONSENT_DATE_PLACEHOLDER,
  MAX_HTML_BYTES,
  UNSUBSCRIBE_PLACEHOLDER,
  renderAnnouncementMailing,
  renderEpisodeMailing,
} from '@/lib/newsletter-template'
import type { Episode } from '@/payload-types'

const ORIGIN = 'https://democracyinnovators.com'

function episode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 1,
    title: 'Stefaan Verhulst on data collaboratives',
    slug: 'stefaan-verhulst-on-data-collaboratives',
    publishedAt: '2026-03-01T09:00:00.000Z',
    episodeNumber: 7,
    excerpt: 'How public institutions share data without giving it away.',
    featureImageUrl: '/media/episodes/stefaan.png',
    transcriptText:
      'Donate on PayPal Automatic transcription, it can have errors. '
      + 'Alessandro Oppo (00:00) Welcome to another episode. '
      + 'Stefaan Verhulst (00:09) Thanks for having me. '
      + 'Alessandro Oppo (00:20) Where did it start?',
    updatedAt: '2026-03-01T09:00:00.000Z',
    createdAt: '2026-03-01T09:00:00.000Z',
    ...overrides,
  } as Episode
}

/** Everything a mail client has to resolve on its own must already be absolute;
 *  a relative src is a broken image everywhere. The placeholders are the one
 *  exception, and the worker replaces them per recipient. */
function relativeUrls(html: string): string[] {
  return [...html.matchAll(/(?:src|href)="([^"]*)"/g)]
    .map((match) => match[1])
    .filter((value) => !/^(https?:\/\/|mailto:|\{\{)/.test(value))
}

describe('renderEpisodeMailing', () => {
  it('leads with the episode number, title, excerpt and cover', () => {
    const mail = renderEpisodeMailing({ episode: episode(), origin: ORIGIN })
    expect(mail.subject).toBe('Episode 07: Stefaan Verhulst on data collaboratives')
    expect(mail.html).toContain('Episode 07')
    expect(mail.html).toContain('Stefaan Verhulst on data collaboratives')
    expect(mail.html).toContain('How public institutions share data without giving it away.')
    expect(mail.html).toContain(`${ORIGIN}/media/episodes/stefaan.png`)
  })

  it('carries the transcript opening with speaker names, and never the preamble', () => {
    const mail = renderEpisodeMailing({ episode: episode(), origin: ORIGIN })
    expect(mail.excerptSource).toBe('turns')
    expect(mail.html).toContain('Alessandro Oppo')
    expect(mail.html).toContain('Welcome to another episode.')
    expect(mail.html).not.toMatch(/Donate on PayPal|Automatic transcription/)
    expect(mail.text).not.toMatch(/Donate on PayPal|Automatic transcription/)
  })

  it('links a timestamp to the moment in the player', () => {
    const mail = renderEpisodeMailing({ episode: episode(), origin: ORIGIN })
    // PlayFromQuery reads ?t=<seconds> and opens the player there.
    expect(mail.html).toContain(`${ORIGIN}/episode/stefaan-verhulst-on-data-collaboratives?t=9`)
  })

  it('makes every URL absolute', () => {
    expect(relativeUrls(renderEpisodeMailing({ episode: episode(), origin: ORIGIN }).html)).toEqual([])
  })

  it('leaves an already-absolute cover alone', () => {
    const mail = renderEpisodeMailing({
      episode: episode({ featureImageUrl: 'https://static.ghost.org/old.jpg' }),
      origin: ORIGIN,
    })
    expect(mail.html).toContain('https://static.ghost.org/old.jpg')
    expect(mail.html).not.toContain(`${ORIGIN}https://`)
  })

  it('falls back to the square cover, and omits the image when there is none', () => {
    const square = renderEpisodeMailing({
      episode: episode({ featureImageUrl: null, squareCoverUrl: 'https://cdn.example.org/square.png' }),
      origin: ORIGIN,
    })
    expect(square.html).toContain('https://cdn.example.org/square.png')

    const bare = renderEpisodeMailing({
      episode: episode({ featureImageUrl: null, squareCoverUrl: null }),
      origin: ORIGIN,
    })
    expect(bare.html).not.toContain('<img')
  })

  it('drops the number entirely for an unnumbered episode, like the trailer', () => {
    const mail = renderEpisodeMailing({ episode: episode({ episodeNumber: null }), origin: ORIGIN })
    expect(mail.subject).toBe('Stefaan Verhulst on data collaboratives')
    expect(mail.html).not.toContain('Episode ')
    expect(mail.text.split('\n')[0]).toBe('NEW EPISODE')
  })

  it('escapes markup in a title rather than emitting it', () => {
    const mail = renderEpisodeMailing({
      episode: episode({ title: 'Rights & <wrongs> of "voting"' }),
      origin: ORIGIN,
    })
    expect(mail.html).toContain('Rights &amp; &lt;wrongs&gt; of &quot;voting&quot;')
    expect(mail.html).not.toContain('<wrongs>')
  })

  it('carries exactly one of each per-recipient placeholder, in both parts', () => {
    const mail = renderEpisodeMailing({ episode: episode(), origin: ORIGIN })
    expect(mail.html.split(UNSUBSCRIBE_PLACEHOLDER)).toHaveLength(2)
    expect(mail.html.split(CONSENT_DATE_PLACEHOLDER)).toHaveLength(2)
    // A clipped HTML part would hide the footer, so the text part must carry it too.
    expect(mail.text).toContain(UNSUBSCRIBE_PLACEHOLDER)
    expect(mail.text).toContain(CONSENT_DATE_PLACEHOLDER)
  })

  it('says plainly that nothing is tracked', () => {
    // /privacy makes this claim, and newsletter-mail.ts disables Mailjet's
    // tracking to keep it true. Saying it here is the reader-facing half.
    const mail = renderEpisodeMailing({ episode: episode(), origin: ORIGIN })
    expect(mail.html).toContain('No opens, clicks or anything else about you is tracked')
    expect(mail.text).toContain('No opens, clicks or anything else about you is tracked')
  })

  it('measures bytes rather than characters', () => {
    // The archive has names like Wetherall-Grujić and whole Italian episodes.
    const mail = renderEpisodeMailing({ episode: episode({ title: 'Grujić — città' }), origin: ORIGIN })
    expect(mail.htmlBytes).toBe(Buffer.byteLength(mail.html, 'utf8'))
    expect(mail.htmlBytes).toBeGreaterThan(mail.html.length)
  })

  it('stays far inside the Gmail clipping limit', () => {
    const mail = renderEpisodeMailing({ episode: episode(), origin: ORIGIN })
    expect(mail.htmlBytes).toBeLessThan(MAX_HTML_BYTES)
  })

  it('still produces a usable email from a transcript with no labels at all', () => {
    const mail = renderEpisodeMailing({
      episode: episode({ transcriptText: 'welcome on another episode and our guest today is nobody in particular' }),
      origin: ORIGIN,
    })
    expect(mail.excerptSource).toBe('plain')
    expect(mail.html).toContain('welcome on another episode')
    expect(relativeUrls(mail.html)).toEqual([])
  })

  it('survives an episode with no transcript at all', () => {
    const mail = renderEpisodeMailing({ episode: episode({ transcriptText: null }), origin: ORIGIN })
    expect(mail.html).not.toContain('From the transcript')
    expect(mail.subject.length).toBeGreaterThanOrEqual(10)
    expect(mail.text).toContain(UNSUBSCRIBE_PLACEHOLDER)
  })
})

describe('renderAnnouncementMailing', () => {
  it('renders the paragraphs it is given, with the same footer', () => {
    const mail = renderAnnouncementMailing({
      title: 'The newsletter has moved',
      paragraphs: ['We now send it ourselves.', 'Nothing else changes.'],
      origin: ORIGIN,
    })
    expect(mail.subject).toBe('The newsletter has moved')
    expect(mail.html).toContain('We now send it ourselves.')
    expect(mail.html).toContain('Nothing else changes.')
    expect(mail.html.split(UNSUBSCRIBE_PLACEHOLDER)).toHaveLength(2)
    expect(relativeUrls(mail.html)).toEqual([])
    expect(mail.text).toContain(UNSUBSCRIBE_PLACEHOLDER)
  })
})
