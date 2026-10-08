import type { Metadata } from 'next'
import Link from 'next/link'

import { getServerSideURL } from '@/lib/getURL'

export const metadata: Metadata = {
  title: 'Connect an AI assistant to the archive',
  description:
    'A free, open endpoint that lets Claude Code, Codex and other AI tools search every episode '
    + 'transcript and cite the exact second a thing was said.',
  alternates: { canonical: '/developers' },
}

export default function DevelopersPage() {
  // Derived rather than written down, so the instructions stay correct through
  // a domain change instead of quietly telling people the wrong hostname.
  const origin = getServerSideURL().replace(/\/$/, '')

  return (
    <main className="inner-page">
      <header className="page-intro">
        <p className="section-label">For developers &amp; researchers</p>
        <h1>Connect an AI assistant to the archive.</h1>
        <p>
          Every episode is transcribed, timed and indexed. This endpoint lets an AI tool search
          those transcripts, read them, and quote them with a link that opens the audio at the exact
          second — so anything it writes can be checked against what was actually said.
        </p>
      </header>

      <article className="episode-content">
        <h2>Connecting</h2>
        <p>One line, in whatever project you are working in:</p>
        <pre><code>{`claude mcp add --transport http archive ${origin}/api/mcp`}</code></pre>
        <p>
          It speaks the Model Context Protocol over HTTP, so anything that speaks MCP — Claude Code,
          Codex, your own client — connects the same way. No account, no key, nothing to install.
        </p>

        <h2>What it can do</h2>
        <p>Five tools appear once connected:</p>
        <ul>
          <li><strong>search_transcripts</strong> — find passages by what was said, with the speaker, the second, and a link that opens the audio there.</li>
          <li><strong>list_episodes</strong> — browse the archive, filtered by topic or guest.</li>
          <li><strong>get_episode</strong> — one episode&rsquo;s chapters, guests and publication date.</li>
          <li><strong>get_transcript</strong> — the full transcript as speaker turns, or just the window between two timestamps.</li>
          <li><strong>cite</strong> — a formatted reference for a moment: who was speaking, the episode, the year, the timestamp, and the link that proves it.</li>
        </ul>

        <h2>It returns sources, not answers</h2>
        <p>
          The archive hands over evidence; the assistant you connected does the writing. That is
          deliberate. If you are quoting these conversations in a thesis, an article or a report, you
          want the passage and a way to verify it — not a paraphrase standing between you and the
          recording.
        </p>

        <h2>Two limits worth knowing</h2>
        <p>
          <strong>Transcripts are generated automatically.</strong> They are good, and they are not
          perfect: names are the usual casualty. Every result carries a link to the moment it came
          from, and for anything you intend to quote, listen to it first.
        </p>
        <p>
          <strong>Keyword search is free and unlimited.</strong> Searching by meaning rather than by
          wording costs a call to an embedding model from a small daily budget, so it needs a key.
          Ask us and we will issue one — for an agent that does its own reasoning, keyword search is
          usually enough.
        </p>

        <h2>Using the material</h2>
        <p>
          These are conversations people gave us in good faith. Quote them, study them, build on
          them — and credit the speaker and the episode when you do. If you are doing something
          substantial with the archive we would genuinely like to hear about it.
        </p>

        <p>
          <Link className="text-link" href="/contact">Get in touch <span aria-hidden="true">→</span></Link>
        </p>
      </article>
    </main>
  )
}
