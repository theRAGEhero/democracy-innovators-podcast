import { describe, expect, it } from 'vitest'

import { annotateSpeakers } from '@/lib/speakers'

// Markup in these fixtures is copied from the imported Ghost HTML in the
// production database — the archive carries five different speaker formats.
const cues = (html: string) => html.match(/class="speaker-turn"/g)?.length ?? 0
const names = (html: string) =>
  [...html.matchAll(/<span class="speaker-name">([^<]*)<\/span>/g)].map((m) => m[1])

describe('annotateSpeakers', () => {
  it('handles format A — plain name, parenthesised time, <br>', () => {
    const html =
      '<p><br>Alessandro Oppo (00:00)<br>Welcome to another episode.</p>' +
      '<p>Stefaan Verhulst (00:09)<br>Thanks</p>' +
      '<p>for having me, Alessandro.</p>' +
      '<p>Alessandro Oppo (00:11)<br>How did it start?</p>' +
      '<p>Stefaan Verhulst (00:27)<br>The genesis question.</p>'
    const { html: out, speakers } = annotateSpeakers(html)
    expect(cues(out)).toBe(4)
    expect(names(out)).toEqual([
      'Alessandro Oppo',
      'Stefaan Verhulst',
      'Alessandro Oppo',
      'Stefaan Verhulst',
    ])
    expect(out).toContain('<span class="speaker-time">00:09</span>')
    // the unlabelled paragraph is the same turn continuing
    expect(out).toContain('<p class="speaker-cont" data-speaker="2">for having me, Alessandro.</p>')
    expect(speakers.map((s) => s.name)).toEqual(['Alessandro Oppo', 'Stefaan Verhulst'])
  })

  it('handles format B — bold name and colon, no timestamp', () => {
    const html =
      '<p><strong>Alessandro Oppo:</strong> Welcome on another episode.</p>' +
      '<p><strong>Bruce Schneier:</strong> Thanks for having me.</p>' +
      '<p><strong>Alessandro Oppo:</strong> Where do we start?</p>' +
      '<p><strong>Bruce Schneier:</strong> At the beginning.</p>'
    const { html: out } = annotateSpeakers(html)
    expect(cues(out)).toBe(4)
    expect(names(out)).toEqual([
      'Alessandro Oppo',
      'Bruce Schneier',
      'Alessandro Oppo',
      'Bruce Schneier',
    ])
    expect(out).not.toContain('speaker-time')
    expect(out).toContain('>Thanks for having me.</p>')
  })

  it('handles format C — bold bracketed time before the name', () => {
    const html =
      '<p><strong>[0:00] Alessandro Oppo:</strong> welcome to the <em>Democracy Innovators</em> podcast.</p>' +
      '<p><strong>[0:23] Massimo Bugani:</strong> thank you, thank you.</p>' +
      '<p><strong>[0:31] Alessandro Oppo:</strong> first of all.</p>' +
      '<p><strong>[0:52] Massimo Bugani:</strong> of course.</p>'
    const { html: out } = annotateSpeakers(html)
    expect(cues(out)).toBe(4)
    expect(out).toContain('<span class="speaker-time">0:23</span>')
    expect(out).toContain('<em>Democracy Innovators</em>')
  })

  it('handles format D — bare bracketed time, first name, lowercase body', () => {
    const html =
      '<p>[3:01] Carlo: yeah i can add in here</p>' +
      '<p>[5:14] Eugene: thank you so much</p>' +
      '<p>[6:02] Carlo: absolutely</p>' +
      '<p>[7:20] Eugene: that makes sense</p>'
    const { html: out } = annotateSpeakers(html)
    expect(cues(out)).toBe(4)
    expect(names(out)).toEqual(['Carlo', 'Eugene', 'Carlo', 'Eugene'])
  })

  it('handles format E — name, time, text all on one line', () => {
    const html =
      '<p>Alessandro Oppo (00:00) Welcome on another episode.</p>' +
      '<p>Carol (00:12) Nice to meet you.</p>' +
      '<p>Andrés (00:13) Thank you.</p>' +
      '<p>Alessandro Oppo (00:14) You co-founded Decidim?</p>' +
      '<p>Carol (00:26) Please address.</p>' +
      '<p>Andrés (00:26) Okay, yeah.</p>'
    const { html: out, speakers } = annotateSpeakers(html)
    expect(cues(out)).toBe(6)
    expect(speakers.map((s) => s.name).sort()).toEqual(['Alessandro Oppo', 'Andrés', 'Carol'])
    expect(out).toContain('>Nice to meet you.</p>')
  })

  it('handles format F — a standalone narration marker', () => {
    const html =
      '<p>Narration · 00:07:24</p>' +
      '<p>these things about plugging the citizen assembly</p>' +
      '<p>Narration · 00:11:39</p>' +
      '<p>i think it may be a sort of school of digital politics</p>'
    const { html: out } = annotateSpeakers(html)
    expect(out.match(/class="transcript-marker"/g)).toHaveLength(2)
    expect(out).toContain('<span class="speaker-time">00:11:39</span>')
    expect(cues(out)).toBe(0)
  })

  it('does not read prose as a cue', () => {
    const html =
      '<p><strong>Disclaimer:</strong> automatic transcription.</p>' +
      '<p><strong>NOTE:</strong> lightly edited.</p>' +
      '<p>And I think that is right.</p>' +
      '<p>No. No. Carol (12:04) was not speaking here.</p>'
    const { html: out, speakers } = annotateSpeakers(html)
    expect(speakers).toEqual([])
    expect(out).toBe(html)
  })

  it('accepts a one-off label when the episode record names that person', () => {
    const html =
      '<p><strong>Valentin Chaput:</strong> open source politics.</p>' +
      '<p>A paragraph that continues the same answer.</p>'
    expect(annotateSpeakers(html).speakers).toEqual([])
    const { speakers } = annotateSpeakers(html, ['Valentin Chaput'])
    expect(speakers).toEqual([{ name: 'Valentin Chaput', slot: 1, turns: 1 }])
  })

  it('folds a one-off long form into the short label used elsewhere', () => {
    const html =
      '<p><strong>Alessandro Oppo:</strong> welcome.</p>' +
      '<p><strong>Alessandro:</strong> tell me more.</p>' +
      '<p><strong>Alessandro:</strong> and then?</p>' +
      '<p><strong>Oliver:</strong> sure.</p>' +
      '<p><strong>Oliver:</strong> right.</p>'
    const { html: out, speakers } = annotateSpeakers(html)
    expect(speakers).toHaveLength(2)
    // both spellings share one colour slot, and the label stays as written
    expect(out).toContain('<span class="speaker-name">Alessandro Oppo</span>')
    expect(out.match(/data-speaker="1"/g)).toHaveLength(3)
  })

  it('gives slot 1 to the most talkative voice, whoever speaks first', () => {
    const html =
      '<p><strong>Guest:</strong> one.</p>' +
      '<p><strong>Host:</strong> two.</p>' +
      '<p><strong>Guest:</strong> three.</p>' +
      '<p><strong>Host:</strong> four.</p>' +
      '<p><strong>Host:</strong> five.</p>'
    const { speakers } = annotateSpeakers(html)
    expect(speakers[0]).toEqual({ name: 'Host', slot: 1, turns: 3 })
    expect(speakers[1]).toEqual({ name: 'Guest', slot: 2, turns: 2 })
  })

  it('cycles colour slots past the fourth voice', () => {
    const html = ['A', 'B', 'C', 'D', 'E']
      .flatMap((n) => [`<p><strong>${n}elena:</strong> hi.</p>`, `<p><strong>${n}elena:</strong> yes.</p>`])
      .join('')
    const { speakers } = annotateSpeakers(html)
    expect(speakers.map((s) => s.slot)).toEqual([1, 2, 3, 4, 1])
  })

  it('stops a turn at a block boundary such as a chapter heading', () => {
    const html =
      '<p><strong>Host:</strong> one.</p>' +
      '<p>still the host talking.</p>' +
      '<h2 id="ch-2-x" class="chapter-heading">Second chapter</h2>' +
      '<p>a paragraph after the heading.</p>' +
      '<p><strong>Host:</strong> two.</p>'
    const { html: out } = annotateSpeakers(html)
    expect(out).toContain('<p class="speaker-cont" data-speaker="1">still the host talking.</p>')
    expect(out).toContain('<p>a paragraph after the heading.</p>')
    expect(out).toContain('<h2 id="ch-2-x" class="chapter-heading">Second chapter</h2>')
  })

  it('is idempotent and leaves non-transcript HTML alone', () => {
    const html =
      '<figure class="kg-card"><iframe src="https://example.test"></iframe></figure>' +
      '<p><strong>Host:</strong> one.</p><p><strong>Host:</strong> two.</p>'
    const once = annotateSpeakers(html)
    expect(annotateSpeakers(once.html).html).toBe(once.html)
    expect(once.html).toContain('<figure class="kg-card">')
    expect(annotateSpeakers('').html).toBe('')
    expect(annotateSpeakers('<h2>No transcript yet</h2>').html).toBe('<h2>No transcript yet</h2>')
  })
})
