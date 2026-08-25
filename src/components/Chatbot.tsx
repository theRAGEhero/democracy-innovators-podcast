'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import Link from 'next/link'
import { Bot, BookOpen, Check, Eraser, Link2, ListTree, Play, Send, X } from 'lucide-react'

import { formatTimestamp, type Chapter } from '@/lib/chapters'
import { citationShareText } from '@/lib/citation-share'
import { getClientSideURL } from '@/lib/getURL'
import { AnswerText } from './AnswerText'
import { usePlayer, type PlayerEpisode } from './PlayerProvider'

type CitationEpisode = { id: number; slug: string; title: string; audioUrl: string; coverUrl?: string | null; chapters?: Chapter[] }

type Citation = {
  label?: string
  title: string
  url: string
  snippet?: string
  /** Derived from the transcript, and only present when it can be stood behind
   *  — see CUE_ATTRIBUTION_LIMIT in src/lib/citation-context.ts. */
  speaker?: string
  startTime?: number
  chapter?: { id: string; title: string; startTime: number }
  episode?: CitationEpisode
}
type Message = { role: 'user' | 'assistant'; text: string; citations?: Citation[]; streaming?: boolean }
type ModelInfo = { provider: string; model: string }

/** Openers that show what the archive can be asked, rather than describing it. */
const SAMPLE_QUESTIONS = [
  'What did guests say about citizens assemblies?',
  'How can technology help democratic participation?',
  'Who talked about participatory budgeting?',
]

// Where the conversation is kept between page loads. sessionStorage rather
// than localStorage on purpose: it survives a reload and a link opened in the
// same tab, and goes when the tab does. Nothing leaves the device and there is
// nothing to declare on the privacy page.
const STORAGE_KEY = 'archive-assistant-conversation'

function saveConversation(messages: Message[]) {
  // A finished answer must not come back mid-stream, cursor blinking, after a
  // reload.
  const stored = messages.map(({ streaming: _streaming, ...rest }) => rest)
  let attempt = stored
  for (let tries = 0; tries < 2; tries += 1) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attempt))
      return
    } catch {
      // Eight citations an answer, each carrying its episode's chapters, can
      // fill the quota. Drop the oldest exchange and try once more.
      if (attempt.length <= 2) break
      attempt = attempt.slice(2)
    }
  }
  // Saving is a convenience. Failing to save must never cost the conversation
  // that is on screen.
}

function loadConversation(): Message[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string')
  } catch {
    return []
  }
}

/** Parses the `event:`/`data:` pairs of an SSE body into objects.
 *  Events are separated by a blank line, so the buffer is split on that. */
async function* readEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    for (let split = buffer.indexOf('\n\n'); split >= 0; split = buffer.indexOf('\n\n')) {
      const block = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      let name = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      try {
        yield { name, data: JSON.parse(data) }
      } catch {
        // A truncated event is skipped rather than ending the answer.
      }
    }
  }
}
type AssistantContextValue = {
  open: () => void
  close: () => void
  isOpen: boolean
  /** Send a question straight through, opening the drawer with it. Lets other
   *  parts of the site hand a question over without repeating the submit path
   *  — see components/ArchiveSearchTabs.tsx. */
  ask: (question: string) => void
}

const AssistantContext = createContext<AssistantContextValue | null>(null)

export function useArchiveAssistant() {
  const value = useContext(AssistantContext)
  if (!value) throw new Error('useArchiveAssistant must be used within ArchiveAssistantProvider')
  return value
}

export function AskArchiveButton({ className = 'ask-archive-button', label = 'Ask the archive' }: { className?: string; label?: string }) {
  const assistant = useArchiveAssistant()
  return <button className={className} type="button" onClick={assistant.open}><Bot aria-hidden="true" size={18} /><span>{label}</span></button>
}

/**
 * Put text on the clipboard, or say so when we cannot.
 *
 * The async Clipboard API needs a secure context, which production has and a
 * plain-http preview does not; the textarea fallback is deprecated but still
 * works everywhere. A copy that silently does nothing is worse than no button,
 * so the caller is told either way.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const field = document.createElement('textarea')
      field.value = text
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(field)
      return copied
    } catch {
      return false
    }
  }
}

/** Ties an [S1] marker in the answer to the card that backs it. */
const citationDomId = (message: number, label = '') => `citation-${message}-${label}`

/** One source, with the quote and somewhere to go with it. */
function CitationCard({ citation, domId, onNavigate, index }: { citation: Citation; domId: string; onNavigate: () => void; index: number }) {
  const player = usePlayer()
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  const { speaker, startTime, chapter, episode } = citation
  // Same colour slots the transcript uses, so a source looks the same wherever
  // it appears. Cycled past the fourth, as there.
  const slot = (index % 4) + 1

  function listen() {
    if (!episode) return
    const target: PlayerEpisode = {
      id: episode.id,
      slug: episode.slug,
      title: episode.title,
      audioUrl: episode.audioUrl,
      coverUrl: episode.coverUrl,
      chapters: episode.chapters,
    }
    // Deliberately does not close the drawer: listening and reading the rest of
    // the answer are the same activity.
    player.playEpisode(target, startTime)
  }

  async function copyLink() {
    const ok = await copyText(citationShareText(citation, getClientSideURL()))
    setCopied(ok ? 'done' : 'failed')
    window.setTimeout(() => setCopied('idle'), 2000)
  }

  return (
    <article className="assistant-citation" data-speaker={slot} id={domId}>
      <header>
        <span className="assistant-citation-label">{citation.label}</span>
        {speaker ? <span className="speaker-name">{speaker}</span> : null}
        {startTime !== undefined ? <span className="speaker-time">{formatTimestamp(startTime)}</span> : null}
      </header>
      {citation.snippet ? <blockquote>{citation.snippet}</blockquote> : null}
      <p className="assistant-citation-episode">{citation.title}</p>
      {chapter ? <p className="assistant-citation-chapter">{chapter.title}</p> : null}
      <div className="assistant-citation-actions">
        {episode ? (
          <button type="button" onClick={listen}>
            <Play aria-hidden="true" size={13} />
            {startTime ? `Listen at ${formatTimestamp(startTime)}` : 'Listen'}
          </button>
        ) : null}
        <button
          aria-label={startTime === undefined ? 'Copy link to this quote' : `Copy link to this moment, ${formatTimestamp(startTime)}`}
          className="assistant-citation-copy"
          onClick={copyLink}
          title="Copy link"
          type="button"
        >
          {copied === 'done' ? <Check aria-hidden="true" size={13} /> : <Link2 aria-hidden="true" size={13} />}
        </button>
        {/* An icon that swaps tells a screen reader nothing on its own. */}
        <span aria-live="polite" className="sr-only">
          {copied === 'done' ? 'Link copied' : copied === 'failed' ? 'Could not copy the link' : ''}
        </span>
        {chapter ? (
          <Link href={`${citation.url}#${chapter.id}`} onClick={onNavigate}>
            <ListTree aria-hidden="true" size={13} />
            Chapter
          </Link>
        ) : null}
        <Link href={citation.url} onClick={onNavigate}>
          <BookOpen aria-hidden="true" size={13} />
          Episode
        </Link>
      </div>
    </article>
  )
}

export function ArchiveAssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const messagesRef = useRef<HTMLDivElement>(null)

  function open() {
    openerRef.current = document.activeElement as HTMLElement
    window.dispatchEvent(new CustomEvent('ui:overlay-open', { detail: 'assistant' }))
    setOpen(true)
  }

  function close() {
    setOpen(false)
    requestAnimationFrame(() => openerRef.current?.focus())
  }

  useEffect(() => {
    if (!isOpen) return
    inputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      if (event.key !== 'Tab') return
      const panel = document.querySelector<HTMLElement>('.assistant-drawer')
      const controls = panel?.querySelectorAll<HTMLElement>('a,button,input,[tabindex]:not([tabindex="-1"])')
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen])

  useEffect(() => {
    const onOverlay = (event: Event) => { if ((event as CustomEvent).detail !== 'assistant') setOpen(false) }
    window.addEventListener('ui:overlay-open', onOverlay)
    return () => window.removeEventListener('ui:overlay-open', onOverlay)
  }, [])

  // Read after mounting, never while rendering: storage the server cannot see
  // would make the first client render disagree with the HTML it replaces.
  useEffect(() => {
    const stored = loadConversation()
    if (stored.length) setMessages(stored)
    setHydrated(true)
  }, [])

  useEffect(() => {
    // Not before the read above has happened, or an empty initial state would
    // overwrite a conversation that is still on disk.
    if (!hydrated) return
    // And not while an answer is arriving: `messages` changes on every token,
    // so saving here would serialise the whole conversation — citations,
    // chapters and all — several hundred times per answer.
    if (messages.some((message) => message.streaming)) return
    saveConversation(messages)
  }, [hydrated, messages])

  // Follow the answer as it is written, unless the reader has scrolled up to
  // re-read something.
  useEffect(() => {
    const list = messagesRef.current
    if (!list) return
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120
    if (nearBottom) list.scrollTop = list.scrollHeight
  }, [messages])

  /** Bring the card behind an [S1] marker into view and mark it briefly, so
   *  the claim and its source are on screen together. */
  function showSource(message: number, label: string) {
    const card = document.getElementById(citationDomId(message, label))
    if (!card) return
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    card.classList.add('is-cited')
    window.setTimeout(() => card.classList.remove('is-cited'), 1600)
  }

  /** Replace the answer being written, leaving the rest of the thread alone. */
  function updateAnswer(change: (message: Message) => Message) {
    setMessages((items) => items.map((item, index) => (index === items.length - 1 ? change(item) : item)))
  }

  async function ask(question: string) {
    if (!question || loading) return
    // Taken before the new turn is added, so the model sees the exchanges that
    // led here and not the question it is about to be asked twice.
    const history = messages.slice(-6).map((message) => ({ role: message.role, text: message.text }))
    setMessages((items) => [...items, { role: 'user', text: question }, { role: 'assistant', text: '', streaming: true }])
    setLoading(true)
    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      })
      // Failures before the stream opens are still plain JSON, so the visitor
      // gets the real reason (quota, timeout) rather than an empty answer.
      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => ({}))
        updateAnswer((message) => ({ ...message, text: result.error || 'The archive assistant is temporarily unavailable.', streaming: false }))
        return
      }
      for await (const event of readEvents(response.body)) {
        if (event.name === 'citations') {
          updateAnswer((message) => ({ ...message, citations: event.data.citations }))
          setModelInfo({ provider: event.data.provider, model: event.data.model })
        } else if (event.name === 'token') {
          updateAnswer((message) => ({ ...message, text: message.text + event.data.text }))
        } else if (event.name === 'replace') {
          updateAnswer((message) => ({ ...message, text: event.data.answer, citations: undefined }))
        } else if (event.name === 'error') {
          updateAnswer((message) => ({ ...message, text: event.data.error }))
        }
      }
      updateAnswer((message) => ({ ...message, text: message.text || 'No answer returned.', streaming: false }))
    } catch {
      updateAnswer((message) => ({ ...message, text: 'The archive assistant is temporarily unavailable.', streaming: false }))
    } finally {
      setLoading(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const question = String(new FormData(form).get('question') || '').trim()
    form.reset()
    void ask(question)
  }

  return (
    <AssistantContext.Provider value={{
        open,
        close,
        isOpen,
        // Opens as it sends: a question handed over from elsewhere would
        // otherwise be answered behind a closed drawer.
        ask: (question) => {
          open()
          void ask(question)
        },
      }}>
      {children}
      {/* The way back. The drawer is dismissed by every other panel that opens
          — the menu, the chapters, the expanded player — and the conversation
          survives in state, so without this it would be alive and unreachable
          from every page that has no "Ask the archive" button of its own. */}
      <button
        aria-label={messages.length ? 'Reopen the archive assistant, conversation in progress' : 'Ask the archive'}
        className="assistant-bubble"
        hidden={isOpen}
        onClick={open}
        title="Ask the archive"
        type="button"
      >
        <Bot aria-hidden="true" size={22} />
        {messages.length ? <span className="assistant-bubble-dot" /> : null}
      </button>
      <div className={`assistant-scrim${isOpen ? ' is-open' : ''}`} aria-hidden="true" onClick={close} />
      <aside className={`assistant-drawer${isOpen ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Archive assistant" aria-hidden={!isOpen}>
        <header>
          <div><small>Research tool</small><strong>Ask the archive</strong></div>
          {messages.length ? (
            <button type="button" onClick={() => setMessages([])} aria-label="Clear conversation" title="Clear conversation"><Eraser aria-hidden="true" size={18} /></button>
          ) : null}
          <button type="button" onClick={close} aria-label="Close archive assistant"><X aria-hidden="true" /></button>
        </header>
        <div className="assistant-messages" aria-live="polite" ref={messagesRef}>
          {messages.length ? null : (
            <div className="assistant-intro">
              <p>Ask about a person, project, or idea in the published podcast archive.</p>
              <p className="section-label">Try</p>
              {SAMPLE_QUESTIONS.map((sample) => (
                <button type="button" key={sample} onClick={() => void ask(sample)}>{sample}</button>
              ))}
            </div>
          )}
          {messages.map((message, index) => (
            <article className={`assistant-message ${message.role}`} key={index}>
              {message.role === 'user' ? (
                <p>{message.text}</p>
              ) : (
                <div className="assistant-answer">
                  <AnswerText onSource={(label) => showSource(index, label)} text={message.text} />
                  {message.streaming && message.text ? <span className="assistant-cursor" aria-hidden="true" /> : null}
                </div>
              )}
              {message.citations?.length ? (
                <div className="assistant-citations">
                  <p className="section-label">Sources</p>
                  {message.citations.map((citation, position) => (
                    <CitationCard
                      citation={citation}
                      domId={citationDomId(index, citation.label)}
                      index={position}
                      key={`${citation.url}-${citation.label}`}
                      onNavigate={close}
                    />
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {/* Only until the sources land — after that the answer is visibly arriving. */}
          {loading && !messages[messages.length - 1]?.citations ? <p className="assistant-thinking">Searching published transcripts…</p> : null}
        </div>
        <form onSubmit={submit}><label htmlFor="archive-question">Question</label><div><input ref={inputRef} id="archive-question" name="question" maxLength={500} placeholder="What did guests say about…" required /><button type="submit" disabled={loading} aria-label="Send question"><Send aria-hidden="true" size={18} /></button></div><small>Answers are AI-generated from published transcripts and include source links.{modelInfo ? ` Answered by ${modelInfo.model} (${modelInfo.provider}).` : ''}</small></form>
      </aside>
    </AssistantContext.Provider>
  )
}
