'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import Link from 'next/link'
import { Bot, Send, X } from 'lucide-react'

type Citation = { label?: string; title: string; url: string; snippet?: string }
type Message = { role: 'user' | 'assistant'; text: string; citations?: Citation[] }
type AssistantContextValue = { open: () => void; close: () => void; isOpen: boolean }

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

export function ArchiveAssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: 'Ask about a person, project, or idea in the published podcast archive.' }])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const question = String(data.get('question') || '').trim()
    if (!question || loading) return
    form.reset()
    setMessages((items) => [...items, { role: 'user', text: question }])
    setLoading(true)
    try {
      const response = await fetch('/api/chatbot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })
      const result = await response.json()
      setMessages((items) => [...items, { role: 'assistant', text: result.answer || result.error || 'No answer returned.', citations: result.citations }])
    } catch {
      setMessages((items) => [...items, { role: 'assistant', text: 'The archive assistant is temporarily unavailable.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <AssistantContext.Provider value={{ open, close, isOpen }}>
      {children}
      <div className={`assistant-scrim${isOpen ? ' is-open' : ''}`} aria-hidden="true" onClick={close} />
      <aside className={`assistant-drawer${isOpen ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Archive assistant" aria-hidden={!isOpen}>
        <header><div><small>Research tool</small><strong>Ask the archive</strong></div><button type="button" onClick={close} aria-label="Close archive assistant"><X aria-hidden="true" /></button></header>
        <div className="assistant-messages" aria-live="polite">
          {messages.map((message, index) => (
            <article className={`assistant-message ${message.role}`} key={index}>
              <p>{message.text}</p>
              {message.citations?.map((citation) => <Link href={citation.url} key={`${citation.url}-${citation.label}`} onClick={close}><strong>{citation.label ? `${citation.label}: ` : ''}{citation.title}</strong>{citation.snippet ? <small>{citation.snippet}</small> : null}</Link>)}
            </article>
          ))}
          {loading ? <p className="assistant-thinking">Searching published transcripts…</p> : null}
        </div>
        <form onSubmit={submit}><label htmlFor="archive-question">Question</label><div><input ref={inputRef} id="archive-question" name="question" maxLength={500} placeholder="What did guests say about…" required /><button type="submit" disabled={loading} aria-label="Send question"><Send aria-hidden="true" size={18} /></button></div><small>Answers are AI-generated from published transcripts and include source links.</small></form>
      </aside>
    </AssistantContext.Provider>
  )
}

// Kept as a no-op compatibility export for older imports during the transition.
export function Chatbot() { return null }
