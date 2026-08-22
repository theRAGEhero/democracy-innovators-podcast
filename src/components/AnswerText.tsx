import type { ReactNode } from 'react'

// The model answers in markdown, so the drawer has to render it — but the
// answer is untrusted text, and the assistant's whole defence rests on it never
// becoming markup (see src/lib/chat-prompt.ts). So this is a deliberately small
// parser that emits React elements: bold, code, lists and source markers, and
// nothing else. There is no path here from model output to raw HTML, which is
// what a markdown library with an HTML passthrough would give us.

const BULLET = /^(\s*)[-*+]\s+(.*)$/
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/
// Bold before italic so `**text**` is not read as an empty emphasis. Source
// markers are matched here too, since the model writes them inline.
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|\[S\d+\])/g

type Line = { indent: number; ordered: boolean; text: string }

function inline(text: string, onSource?: (label: string) => void): ReactNode[] {
  const parts: ReactNode[] = []
  let last = 0
  let key = 0
  INLINE.lastIndex = 0
  for (let match = INLINE.exec(text); match; match = INLINE.exec(text)) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const token = match[0]
    if (token.startsWith('**')) parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`')) parts.push(<code key={key++}>{token.slice(1, -1)}</code>)
    else if (token.startsWith('[')) {
      const label = token.slice(1, -1)
      parts.push(
        <button className="answer-source" key={key++} onClick={() => onSource?.(label)} type="button">
          {label}
        </button>,
      )
    } else parts.push(<em key={key++}>{token.slice(1, -1)}</em>)
    last = match.index + token.length
  }
  // Trailing text, and everything when nothing matched. While the answer is
  // streaming this is usually a half-written sentence, which is fine.
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

/** Nested lists come back as deeper indents, so a run is grouped by its own
 *  shallowest level and everything below hangs off the item above it. */
function list(lines: Line[], onSource?: (label: string) => void): ReactNode {
  if (!lines.length) return null
  const indent = Math.min(...lines.map((line) => line.indent))
  const items: { line: Line; children: Line[] }[] = []
  for (const line of lines) {
    if (line.indent <= indent || !items.length) items.push({ line, children: [] })
    else items[items.length - 1].children.push(line)
  }
  const Tag = items[0].line.ordered ? 'ol' : 'ul'
  return (
    <Tag>
      {items.map((item, index) => (
        <li key={index}>
          {inline(item.line.text, onSource)}
          {list(item.children, onSource)}
        </li>
      ))}
    </Tag>
  )
}

export function AnswerText({ text, onSource }: { text: string; onSource?: (label: string) => void }) {
  const blocks: ReactNode[] = []
  let run: Line[] = []
  let paragraph: string[] = []

  const flushList = () => {
    if (run.length) blocks.push(<div key={blocks.length}>{list(run, onSource)}</div>)
    run = []
  }
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(<p key={blocks.length}>{inline(paragraph.join(' '), onSource)}</p>)
    paragraph = []
  }

  for (const raw of text.split('\n')) {
    const bullet = raw.match(BULLET)
    const numbered = raw.match(NUMBERED)
    if (bullet || numbered) {
      flushParagraph()
      const [, spaces, content] = (bullet || numbered)!
      run.push({ indent: spaces.length, ordered: Boolean(numbered), text: content })
    } else if (!raw.trim()) {
      flushParagraph()
      flushList()
    } else if (run.length) {
      // A wrapped continuation of the item above rather than a new paragraph.
      run[run.length - 1].text += ` ${raw.trim()}`
    } else {
      paragraph.push(raw.trim())
    }
  }
  flushParagraph()
  flushList()

  return <>{blocks}</>
}
