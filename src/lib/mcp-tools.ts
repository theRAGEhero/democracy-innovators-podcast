import {
  cite,
  getEpisode,
  getTranscript,
  listEpisodes,
  searchKeyword,
  searchSemantic,
  type Passage,
} from '@/lib/archive-search'
import { neutralizeUntrusted } from '@/lib/chat-prompt'

// The tools an agent sees, and what they do.
//
// Everything here is read-only and returns sources rather than answers: the
// archive supplies evidence, the connected agent does the writing. That split
// is deliberate — a thesis needs quotes it can verify, not a paraphrase.

/** Said in every result rather than only in the documentation: a thesis that
 *  quotes a mis-transcribed sentence is a real problem, and the caller is a
 *  machine that will not go and read the caveats page. */
export const TRANSCRIPT_CAVEAT =
  'Transcripts are generated automatically from audio and may contain errors. '
  + 'Verify a quotation against the audio using its url before relying on it.'

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string }

export type ToolContext = {
  /** Set when the caller presented a valid API key. Semantic search needs one. */
  authorized: boolean
  /** Absolute origin, so links in results are usable away from this site. */
  origin: string
}

type Tool = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  run: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

/** Transcript text leaves here as data for something that acts on what it
 *  reads, so it is stripped of anything resembling an instruction fence. */
function clean(passage: Passage, origin: string) {
  return {
    ...passage,
    text: neutralizeUntrusted(passage.text),
    episodeTitle: neutralizeUntrusted(passage.episodeTitle),
    url: `${origin}${passage.url}`,
  }
}

export const TOOLS: Tool[] = [
  {
    name: 'search_transcripts',
    title: 'Search the podcast transcripts',
    description:
      'Find passages in the Democracy Innovators podcast archive. Returns the spoken words, who said '
      + 'them, the second they were said, and a link that opens the episode at that moment. Returns '
      + 'sources, not an answer. Use mode "keyword" (default, free) to match words actually spoken; '
      + 'mode "semantic" matches meaning but needs an API key.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for.' },
        limit: { type: 'number', description: 'How many passages, 1-25. Default 8.' },
        mode: { type: 'string', enum: ['keyword', 'semantic'], description: 'Default "keyword".' },
      },
      required: ['query'],
    },
    run: async (args, context) => {
      const query = str(args.query)
      if (!query) return { ok: false, error: 'query is required.' }
      const limit = num(args.limit) ?? 8
      const mode = str(args.mode) || 'keyword'

      if (mode === 'semantic') {
        if (!context.authorized) {
          return {
            ok: false,
            error:
              'Semantic search needs an API key: each query costs an embedding call against a small '
              + 'daily budget. Keyword search is unlimited and free — omit "mode" or pass "keyword".',
          }
        }
        const passages = await searchSemantic(query, limit)
        return { ok: true, data: { mode, caveat: TRANSCRIPT_CAVEAT, passages: passages.map((p) => clean(p, context.origin)) } }
      }

      const passages = await searchKeyword(query, limit)
      return { ok: true, data: { mode: 'keyword', caveat: TRANSCRIPT_CAVEAT, passages: passages.map((p) => clean(p, context.origin)) } }
    },
  },
  {
    name: 'list_episodes',
    title: 'Browse the archive',
    description: 'List published episodes, newest first, optionally narrowed by topic or guest name.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Partial topic name.' },
        guest: { type: 'string', description: 'Partial guest name.' },
        limit: { type: 'number', description: 'How many, 1-100. Default 25.' },
      },
    },
    run: async (args, context) => {
      const episodes = await listEpisodes({
        topic: str(args.topic) || undefined,
        guest: str(args.guest) || undefined,
        limit: num(args.limit),
      })
      return {
        ok: true,
        data: episodes.map((episode) => ({ ...episode, url: `${context.origin}${episode.url}` })),
      }
    },
  },
  {
    name: 'get_episode',
    title: 'One episode in detail',
    description: 'Metadata for a single episode: guests, topics, publication date and chapter list.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Episode slug, as returned by other tools.' } },
      required: ['slug'],
    },
    run: async (args, context) => {
      const episode = await getEpisode(str(args.slug))
      if (!episode) return { ok: false, error: 'No published episode with that slug.' }
      return { ok: true, data: { ...episode, url: `${context.origin}${episode.url}` } }
    },
  },
  {
    name: 'get_transcript',
    title: 'Read a transcript',
    description:
      'The transcript of one episode as speaker turns, each with the second it begins. Give "from" '
      + 'and "to" in seconds to read only part of it; a turn already in progress at "from" is included.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        from: { type: 'number', description: 'Start of the window, in seconds.' },
        to: { type: 'number', description: 'End of the window, in seconds.' },
      },
      required: ['slug'],
    },
    run: async (args, context) => {
      const slug = str(args.slug)
      const transcript = await getTranscript(slug, { from: num(args.from), to: num(args.to) })
      if (!transcript) return { ok: false, error: 'No published episode with that slug.' }
      return {
        ok: true,
        data: {
          ...transcript,
          caveat: TRANSCRIPT_CAVEAT,
          url: `${context.origin}/episode/${slug}`,
          turns: transcript.turns.map((turn) => ({ ...turn, text: neutralizeUntrusted(turn.text) })),
        },
      }
    },
  },
  {
    name: 'cite',
    title: 'Build a citation',
    description:
      'A reference for a moment in an episode: who was speaking, the episode, the year, the timestamp, '
      + 'and a link that opens the audio at that second so the quotation can be checked.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        seconds: { type: 'number', description: 'Position in the episode, in seconds.' },
      },
      required: ['slug', 'seconds'],
    },
    run: async (args, context) => {
      const seconds = num(args.seconds)
      if (seconds === undefined) return { ok: false, error: 'seconds is required.' }
      const reference = await cite(str(args.slug), seconds)
      if (!reference) return { ok: false, error: 'No published episode with that slug.' }
      return { ok: true, data: { ...reference, url: `${context.origin}${reference.url}` } }
    },
  },
]

export const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]))

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const tool = TOOLS_BY_NAME.get(name)
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` }
  try {
    return await tool.run(args || {}, context)
  } catch (error) {
    // An agent gets a sentence it can act on; the stack stays on the server.
    return { ok: false, error: error instanceof Error ? error.message : 'The archive could not answer that.' }
  }
}
