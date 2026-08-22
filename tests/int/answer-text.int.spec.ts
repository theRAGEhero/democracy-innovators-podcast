import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AnswerText } from '@/components/AnswerText'

const render = (text: string) => renderToStaticMarkup(createElement(AnswerText, { text }))

describe('answer rendering', () => {
  it('renders the markdown the model actually writes', () => {
    const html = render('Technology helps:\n\n*   **Deliberation:** it can summarise conversations [S2].\n*   **Access:** e-voting lowers hurdles [S2].')
    expect(html).toContain('<ul>')
    expect(html).toContain('<strong>Deliberation:</strong>')
    // These were being printed raw, asterisks and all.
    expect(html).not.toContain('**')
  })

  it('nests a sub-point under the point it belongs to', () => {
    const html = render('*   **Engagement:**\n    *   **Gamification:** games help [S6].')
    expect(html).toMatch(/<li>.*<ul>.*Gamification.*<\/ul><\/li>/s)
  })

  it('keeps numbered lists numbered', () => {
    expect(render('1. first\n2. second')).toContain('<ol>')
  })

  it('turns source markers into a control rather than text', () => {
    const html = render('A claim [S1].')
    expect(html).toContain('answer-source')
    expect(html).toContain('>S1</button>')
  })

  it('never lets an answer become markup', () => {
    // The whole prompt-injection defence rests on this: the answer is untrusted
    // text, so no path may take it to raw HTML.
    const html = render('<img src=x onerror="alert(1)"> and <script>alert(2)</script>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;img')
  })

  it('renders half-written text while it is still streaming', () => {
    expect(render('Some **bold that has not clo')).toContain('Some **bold that has not clo')
  })
})
