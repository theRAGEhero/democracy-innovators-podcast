import config from '@payload-config'
import { getPayload } from 'payload'

import { TOOLS, callTool, type ToolContext } from '@/lib/mcp-tools'
import { isRateLimited } from '@/lib/rate-limit'
import { getServerSideURL } from '@/lib/getURL'

// The Model Context Protocol, over HTTP, stateless.
//
// Written against the spec rather than with the official SDK: its HTTP
// transport wants Node's IncomingMessage/ServerResponse, and an App Router
// handler is given a Web Request. For a read-only server with no subscriptions
// the protocol surface is small — initialize, tools/list, tools/call, ping —
// so adapting the stream was more machinery than implementing the messages.
//
// Stateless on purpose: there is no session to keep, so any instance can answer
// any request and nothing has to be remembered between them.

export const dynamic = 'force-dynamic'

/** Versions whose shape this server matches. A client asking for one of these
 *  gets it back; anything else is answered with our newest and left to decide. */
const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05']
const LATEST = SUPPORTED[0]

const RATE_LIMIT = { scope: 'mcp', limit: 60, windowMs: 60_000 }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version',
}

type JsonRpcId = string | number | null

function result(id: JsonRpcId, value: unknown) {
  return { jsonrpc: '2.0' as const, id, result: value }
}

function failure(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: '2.0' as const, id, error: { code, message } }
}

/**
 * Does this caller hold a key?
 *
 * Payload already mints keys for `Authorization: users API-Key <key>`; this
 * only has to recognise one. A bad key is not an error — it simply means the
 * paid path stays closed and keyword search still works.
 */
async function isAuthorized(request: Request): Promise<boolean> {
  const header = request.headers.get('authorization') || ''
  if (!/API-Key\s+\S+/i.test(header)) return false
  try {
    const payload = await getPayload({ config })
    const auth = await payload.auth({ headers: request.headers })
    return Boolean(auth.user)
  } catch {
    return false
  }
}

async function handle(message: unknown, context: ToolContext) {
  if (!message || typeof message !== 'object') return failure(null, -32600, 'Invalid request.')
  const { method, id, params } = message as { method?: string; id?: JsonRpcId; params?: Record<string, unknown> }
  const requestId: JsonRpcId = id ?? null

  switch (method) {
    case 'initialize': {
      const asked = typeof params?.protocolVersion === 'string' ? params.protocolVersion : ''
      return result(requestId, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : LATEST,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'democracy-innovators-archive', version: '1.0.0' },
        instructions:
          'Search and read the Democracy Innovators podcast archive. Every passage carries the speaker, '
          + 'the second it was said, and a link that opens the audio there. This server returns sources, '
          + 'never a written answer — compose from the passages and cite them.',
      })
    }

    case 'ping':
      return result(requestId, {})

    case 'tools/list':
      return result(requestId, {
        tools: TOOLS.map(({ name, title, description, inputSchema }) => ({
          name,
          title,
          description,
          inputSchema,
        })),
      })

    case 'tools/call': {
      const name = typeof params?.name === 'string' ? params.name : ''
      const args = (params?.arguments as Record<string, unknown>) || {}
      const outcome = await callTool(name, args, context)
      // A tool that refuses is a normal result with isError set, not a
      // protocol error: the agent is meant to read it and try something else.
      return result(requestId, {
        content: [{ type: 'text', text: JSON.stringify(outcome.ok ? outcome.data : { error: outcome.error }, null, 2) }],
        isError: !outcome.ok,
      })
    }

    default:
      return failure(requestId, -32601, `Method not found: ${method ?? '(none)'}`)
  }
}

export async function POST(request: Request) {
  if (isRateLimited(request, RATE_LIMIT)) {
    return Response.json(failure(null, -32000, 'Too many requests. Please slow down.'), {
      status: 429,
      headers: CORS,
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(failure(null, -32700, 'Parse error.'), { status: 400, headers: CORS })
  }

  const context: ToolContext = {
    authorized: await isAuthorized(request),
    origin: getServerSideURL().replace(/\/$/, ''),
  }

  // A notification carries no id and expects no answer — "initialized" is the
  // one every client sends right after the handshake.
  const isNotification = (message: unknown) =>
    Boolean(message) && typeof message === 'object' && (message as { id?: unknown }).id === undefined

  if (Array.isArray(body)) {
    const answers = await Promise.all(body.filter((item) => !isNotification(item)).map((item) => handle(item, context)))
    if (!answers.length) return new Response(null, { status: 202, headers: CORS })
    return Response.json(answers, { headers: CORS })
  }

  if (isNotification(body)) return new Response(null, { status: 202, headers: CORS })

  return Response.json(await handle(body, context), { headers: CORS })
}

/** The spec's GET opens a channel for server-initiated messages. This server
 *  has none to send, so it says so rather than holding a connection open. */
export function GET() {
  return Response.json(failure(null, -32000, 'This server is stateless; send JSON-RPC over POST.'), {
    status: 405,
    headers: { ...CORS, Allow: 'POST, OPTIONS' },
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
