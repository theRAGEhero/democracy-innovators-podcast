'use client'

import { Bot, Search } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'

import { useArchiveAssistant } from './Chatbot'

// Two ways into the same transcripts, side by side.
//
// The keyword search and the assistant read the same material — /search runs a
// LIKE over episode titles, excerpts and transcript text — so presenting them
// as unrelated features left people using the wrong one. Whoever wants to know
// what guests said about a subject was being funnelled into an exact-word
// search, which cannot answer that.
//
// The search half stays a plain GET form and is the tab shown first, so the
// page keeps working with no JavaScript: without it the second tab simply is
// not reachable, and nothing is lost that was not already unreachable.
export function ArchiveSearchTabs({ query }: { query: string }) {
  const assistant = useArchiveAssistant()
  const [mode, setMode] = useState<'search' | 'ask'>('search')

  function askArchive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const question = String(new FormData(form).get('question') || '').trim()
    if (!question) return
    form.reset()
    assistant.ask(question)
  }

  return (
    <div className="archive-search-tabs">
      <div className="archive-search-tablist" role="tablist" aria-label="How to search the archive">
        <button
          aria-controls="panel-search"
          aria-selected={mode === 'search'}
          id="tab-search"
          onClick={() => setMode('search')}
          role="tab"
          type="button"
        >
          <Search aria-hidden="true" size={15} />
          Search
        </button>
        <button
          aria-controls="panel-ask"
          aria-selected={mode === 'ask'}
          id="tab-ask"
          onClick={() => setMode('ask')}
          role="tab"
          type="button"
        >
          <Bot aria-hidden="true" size={15} />
          Ask AI
        </button>
      </div>

      <div aria-labelledby="tab-search" hidden={mode !== 'search'} id="panel-search" role="tabpanel">
        <form action="/search" className="search-form" role="search">
          <label htmlFor="q">Search people, episodes and transcripts</label>
          <div>
            <input defaultValue={query} id="q" name="q" placeholder="Try deliberative AI" type="search" />
            <button type="submit">Search</button>
          </div>
        </form>
        <p className="archive-search-hint">Finds the exact words, wherever they appear.</p>
      </div>

      <div aria-labelledby="tab-ask" hidden={mode !== 'ask'} id="panel-ask" role="tabpanel">
        <form className="search-form" onSubmit={askArchive}>
          <label htmlFor="archive-ask">Ask a question about the archive</label>
          <div>
            <input id="archive-ask" name="question" maxLength={500} placeholder="What did guests say about citizens assemblies?" type="text" />
            <button type="submit">Ask</button>
          </div>
        </form>
        <p className="archive-search-hint">Answers from the transcripts, quoting who said it and at what minute.</p>
      </div>
    </div>
  )
}
