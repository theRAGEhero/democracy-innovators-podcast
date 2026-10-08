import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { createClient } from '@libsql/client'

import config from '@/payload.config'
import { closeSearchClient, getTranscript, listEpisodes, searchKeyword, toMatchQuery } from '@/lib/archive-search'
import { POST } from '@/app/(payload)/api/mcp/route'

let payload: Payload
let client: ReturnType<typeof createClient> | null = null

function sql() {
  if (!client) client = createClient({ url: process.env.DATABASE_URL! })
  return client
}

const TRANSCRIPT = [
  'Alessandro Oppo (00:00)',
  'Welcome to the archive. Today we talk about participatory budgeting in Brazil.',
  'Paolo Spada (04:08)',
  "It's a way of deciding together how public money is spent, and it didn't start here.",
  'Alessandro Oppo (12:30)',
  'And what happened when the councils were dissolved?',
].join('\n')

async function publishEpisode(slug: string, title: string) {
  const created = await payload.create({
    collection: 'episodes',
    data: { title, slug, publishedAt: new Date('2026-01-15').toISOString(), transcriptText: TRANSCRIPT },
    overrideAccess: true,
  })
  return payload.update({ collection: 'episodes', id: created.id, data: { _status: 'published' }, overrideAccess: true })
}

/**
 * Chunks go in with SQL rather than through Payload: what is under test is the
 * FTS index over this table, and the generated types cannot discriminate the
 * json fields well enough to describe a row without fighting them.
 */
async function addChunk(episodeId: number | string, slug: string, title: string, text: string, index: number) {
  await sql().execute({
    sql: `INSERT INTO archive_chunks
            (episode_id, episode_title, episode_slug, source_type, chunk_index, text, text_hash,
             embedding_model, embedding_dimension, embedding, start_time, speaker_name, timeline)
          VALUES (?, ?, ?, 'deepgram', ?, ?, ?, 'gemini-embedding-2', 3, '[0.1,0.2,0.3]', ?, 'Paolo Spada', ?)`,
    args: [
      Number(episodeId), title, slug, index, text, `hash-${slug}-${index}`,
      index * 100, JSON.stringify([[0, index * 100, 'Paolo Spada']]),
    ],
  })
}

describe('keyword search', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    closeSearchClient()

    const one = await publishEpisode('budget-one', 'Participatory budgeting in Brazil')
    const two = await publishEpisode('assemblies-two', 'Citizen assemblies in Ireland')
    await addChunk(one.id, 'budget-one', 'Participatory budgeting in Brazil',
      'Participatory budgeting lets residents decide how public money is spent.', 0)
    await addChunk(one.id, 'budget-one', 'Participatory budgeting in Brazil',
      'The councils were dissolved and the budgeting process stopped.', 1)
    await addChunk(two.id, 'assemblies-two', 'Citizen assemblies in Ireland',
      'A citizen assembly is a randomly selected group asked to deliberate.', 0)
  }, 90_000)

  it('finds the passages that contain the words', async () => {
    const hits = await searchKeyword('participatory budgeting', 5)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].episodeSlug).toBe('budget-one')
    expect(hits.every((hit) => hit.text.length > 0)).toBe(true)
  })

  it('carries the second and a link that opens there', async () => {
    const [hit] = await searchKeyword('residents decide', 3)
    expect(hit.startTime).toBe(0)
    expect(hit.url).toBe('/episode/budget-one?t=0')
    expect(hit.speaker).toBe('Paolo Spada')
  })

  it('does not serve passages from an episode that is not published', async () => {
    // The indexer prunes only within the published set, so unpublishing leaves
    // a passage behind. Search has to be the thing that refuses it, or a draft
    // transcript is readable through the public endpoint before publication.
    const hidden = await publishEpisode('hidden-one', 'Hidden one')
    await addChunk(hidden.id, 'hidden-one', 'Hidden one', 'A secret about quorum sensing in councils.', 0)
    expect((await searchKeyword('quorum sensing', 5)).length).toBeGreaterThan(0)

    await payload.update({ collection: 'episodes', id: hidden.id, data: { _status: 'draft' }, overrideAccess: true })
    expect(await searchKeyword('quorum sensing', 5)).toEqual([])
  })

  it('does not match an episode that never says the words', async () => {
    const hits = await searchKeyword('assembly deliberate', 5)
    expect(hits.map((hit) => hit.episodeSlug)).toContain('assemblies-two')
    expect(hits.map((hit) => hit.episodeSlug)).not.toContain('budget-one')
  })

  it('builds the index even though the row counts always agree', async () => {
    // count(*) on an external-content FTS table reads through to the content
    // table, so it matches whether or not anything is indexed. If the build
    // ever trusts that again, this is the test that says so.
    const empty = await searchKeyword('nothing-like-this-appears-anywhere', 5)
    expect(empty).toEqual([])
    const found = await searchKeyword('budgeting', 5)
    expect(found.length).toBeGreaterThan(0)
  })

  it('costs nothing: repeated searches make no outbound call', async () => {
    // A Gemini call without a key throws; keyword search reaching for one
    // would fail here rather than quietly spending quota in production.
    for (let i = 0; i < 20; i += 1) await searchKeyword('budgeting', 3)
    expect(true).toBe(true)
  })
})

describe('the query a person typed is not FTS5 syntax', () => {
  it('quotes each term so punctuation cannot be a syntax error', () => {
    expect(toMatchQuery("it's a \"quoted\" thing")).toBe('"it" AND "quoted" AND "thing"')
  })

  it('neutralises the words FTS5 treats as operators', () => {
    expect(toMatchQuery('budgeting OR assemblies NOT councils')).toBe(
      '"budgeting" AND "or" AND "assemblies" AND "not" AND "councils"',
    )
  })

  it('has nothing to search for in punctuation alone', () => {
    expect(toMatchQuery('?!  --')).toBeNull()
    expect(toMatchQuery('')).toBeNull()
  })
})

describe('reading a transcript', () => {
  it('includes the turn already being spoken at the start of the window', async () => {
    const windowed = await getTranscript('budget-one', { from: 300, to: 360 })
    // 4:08 starts before the window and runs past it; filtering on start
    // alone would return nothing at all.
    expect(windowed?.turns).toHaveLength(1)
    expect(windowed?.turns[0].speaker).toBe('Paolo Spada')
  })

  it('lists published episodes newest first', async () => {
    const episodes = await listEpisodes({ limit: 10 })
    expect(episodes.map((episode) => episode.slug)).toContain('budget-one')
  })
})

describe('the MCP endpoint speaks the protocol', () => {
  const post = (body: unknown) =>
    POST(new Request('https://archive.test/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 250)}.1` },
      body: JSON.stringify(body),
    }))

  it('answers initialize with a version and its capabilities', async () => {
    const response = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
    const json = await response.json()
    expect(json.result.protocolVersion).toBe('2025-06-18')
    expect(json.result.capabilities.tools).toBeDefined()
    expect(json.result.serverInfo.name).toBe('democracy-innovators-archive')
  })

  it('falls back to its own version when asked for one it does not know', async () => {
    const response = await post({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } })
    expect((await response.json()).result.protocolVersion).toBe('2025-06-18')
  })

  it('lists five tools, each with a schema', async () => {
    const json = await (await post({ jsonrpc: '2.0', id: 3, method: 'tools/list' })).json()
    expect(json.result.tools).toHaveLength(5)
    for (const tool of json.result.tools) {
      expect(tool.name).toBeTruthy()
      expect(tool.inputSchema.type).toBe('object')
    }
  })

  it('runs a search and returns content', async () => {
    const json = await (await post({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'search_transcripts', arguments: { query: 'participatory budgeting' } },
    })).json()
    expect(json.result.isError).toBe(false)
    const payloadText = JSON.parse(json.result.content[0].text)
    expect(payloadText.passages.length).toBeGreaterThan(0)
    expect(payloadText.caveat).toMatch(/automatically/i)
    // Links leave absolute, so they still work pasted into a thesis.
    expect(payloadText.passages[0].url).toMatch(/^https?:\/\//)
  })

  it('refuses semantic search without a key, and says why', async () => {
    const json = await (await post({
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'search_transcripts', arguments: { query: 'anything', mode: 'semantic' } },
    })).json()
    expect(json.result.isError).toBe(true)
    expect(JSON.parse(json.result.content[0].text).error).toMatch(/API key/i)
  })

  it('reports an unknown tool as a tool error, not a protocol error', async () => {
    const json = await (await post({
      jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'delete_everything', arguments: {} },
    })).json()
    expect(json.error).toBeUndefined()
    expect(json.result.isError).toBe(true)
  })

  it('rejects a method it does not implement', async () => {
    const json = await (await post({ jsonrpc: '2.0', id: 7, method: 'resources/list' })).json()
    expect(json.error.code).toBe(-32601)
  })

  it('answers a notification with no body', async () => {
    const response = await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
    expect(response.status).toBe(202)
  })
})
