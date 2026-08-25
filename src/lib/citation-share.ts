// The text that leaves the assistant when someone copies a citation.
//
// A link to the episode alone would send the reader back to minute zero of a
// forty-minute conversation, which loses the very thing the assistant found.
// So the quote travels with a link to the moment it was said.

import { formatTimestamp } from '@/lib/chapters'

export type ShareableCitation = {
  title: string
  /** Episode path, as built by the chatbot route: `/episode/<slug>`. */
  url: string
  snippet?: string
  speaker?: string
  startTime?: number
}

/** `?t=<seconds>`, the convention people already know from YouTube.
 *  Read back by components/PlayFromQuery.tsx. */
export function citationLink(citation: ShareableCitation, origin: string): string {
  const base = `${origin.replace(/\/$/, '')}${citation.url}`
  // Whole seconds: the extra precision would be noise in a shared link.
  return citation.startTime === undefined ? base : `${base}?t=${Math.floor(citation.startTime)}`
}

/**
 * The quote, who said it and when, then the link.
 *
 * Everything except the episode title is optional, and missing pieces are the
 * norm rather than the exception: only 27 of the 57 episodes have speaker cues
 * in their transcript, so a citation often has a minute but no name, or
 * neither. Each part is dropped on its own rather than falling back to a
 * cruder whole.
 */
export function citationShareText(citation: ShareableCitation, origin: string): string {
  const lines: string[] = []
  // The snippet arrives with the ellipses that mark where it was cut; they are
  // honest about it being an extract and are kept.
  if (citation.snippet) lines.push(`“${citation.snippet}”`)

  const credit = [citation.speaker, citation.startTime === undefined ? '' : formatTimestamp(citation.startTime)]
    .filter(Boolean)
    .join(', ')
  lines.push(credit ? `— ${credit} · ${citation.title}` : `— ${citation.title}`)

  lines.push('', citationLink(citation, origin))
  return lines.join('\n')
}
