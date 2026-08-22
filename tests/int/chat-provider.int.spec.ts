import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { activeModel, activeProvider, generateAnswer, isConfigured, streamAnswer } from '@/lib/chat-provider'

type FetchCall = { url: string; init: RequestInit }

function stubFetch(response: { status?: number; body?: unknown; text?: string }) {
  const calls: FetchCall[] = []
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init })
    const status = response.status ?? 200
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(response.body ?? {}),
      text: () => Promise.resolve(response.text ?? ''),
    } as unknown as Response)
  })
  return calls
}

/** An SSE body delivered in awkward pieces, because a real one arrives split
 *  wherever the network happened to cut it — including mid-line. */
function stubStream(chunks: string[], status = 200) {
  const calls: FetchCall[] = []
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init })
    const encoder = new TextEncoder()
    let index = 0
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(''),
      body: {
        getReader: () => ({
          read: () =>
            Promise.resolve(
              index < chunks.length ? { done: false, value: encoder.encode(chunks[index++]) } : { done: true, value: undefined },
            ),
          releaseLock: () => {},
        }),
      },
    } as unknown as Response)
  })
  return calls
}

async function collect(stream: Awaited<ReturnType<typeof streamAnswer>>) {
  if (!stream.ok) throw new Error('stream failed')
  const parts: string[] = []
  for await (const delta of stream.deltas) parts.push(delta)
  return parts
}

const body = (calls: FetchCall[]) => JSON.parse(String(calls[0].init.body))
const headers = (calls: FetchCall[]) => calls[0].init.headers as Record<string, string>
const signal = () => AbortSignal.timeout(5_000)
const turn = { system: 'SYSTEM', user: 'question' }

describe('chat provider', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key')
    vi.stubEnv('OLLAMA_API_KEY', 'ollama-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('defaults to gemini when the variable is missing, empty or unrecognised', () => {
    for (const value of ['', '   ', 'openai', 'GEMINI']) {
      vi.stubEnv('CHATBOT_PROVIDER', value)
      expect(activeProvider()).toBe('gemini')
    }
    vi.stubEnv('CHATBOT_PROVIDER', 'ollama')
    expect(activeProvider()).toBe('ollama')
    // Case and stray whitespace should not decide which model answers.
    vi.stubEnv('CHATBOT_PROVIDER', ' Ollama ')
    expect(activeProvider()).toBe('ollama')
  })

  it('sends a Gemini request in the shape Gemini expects', async () => {
    vi.stubEnv('CHATBOT_PROVIDER', 'gemini')
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash')
    const calls = stubFetch({ body: { candidates: [{ content: { parts: [{ text: 'From [S1].' }] } }] } })

    const result = await generateAnswer(turn, { signal: signal() })

    expect(calls[0].url).toContain('generativelanguage.googleapis.com')
    expect(calls[0].url).toContain('gemini-2.5-flash:generateContent')
    expect(headers(calls)['x-goog-api-key']).toBe('gemini-key')
    expect(body(calls).systemInstruction.parts[0].text).toBe('SYSTEM')
    expect(body(calls).contents[0].parts[0].text).toBe('question')
    expect(result).toEqual({ ok: true, answer: 'From [S1].' })
  })

  it('sends an Ollama request to the OpenAI-compatible endpoint', async () => {
    vi.stubEnv('CHATBOT_PROVIDER', 'ollama')
    vi.stubEnv('OLLAMA_MODEL', 'gpt-oss:20b')
    const calls = stubFetch({ body: { choices: [{ message: { content: '  From [S1].  ' } }] } })

    const result = await generateAnswer(turn, { signal: signal() })

    expect(calls[0].url).toBe('https://ollama.com/v1/chat/completions')
    expect(headers(calls).Authorization).toBe('Bearer ollama-key')
    expect(body(calls)).toMatchObject({
      model: 'gpt-oss:20b',
      messages: [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'question' },
      ],
      stream: false,
    })
    // Both providers must produce the same shape for the route.
    expect(result).toEqual({ ok: true, answer: 'From [S1].' })
  })

  it('honours a self-hosted base URL and trims a trailing slash', async () => {
    vi.stubEnv('CHATBOT_PROVIDER', 'ollama')
    vi.stubEnv('OLLAMA_BASE_URL', 'https://ollama.internal/v1/')
    const calls = stubFetch({ body: { choices: [{ message: { content: 'ok' } }] } })

    await generateAnswer(turn, { signal: signal() })

    expect(calls[0].url).toBe('https://ollama.internal/v1/chat/completions')
  })

  it('returns upstream failures instead of throwing, so the caller can record them', async () => {
    vi.stubEnv('CHATBOT_PROVIDER', 'ollama')
    stubFetch({ status: 429, text: 'rate limit exceeded' })

    const result = await generateAnswer(turn, { signal: signal() })

    expect(result).toEqual({ ok: false, status: 429, detail: 'rate limit exceeded' })
  })

  it('reports a missing key per provider', () => {
    vi.stubEnv('OLLAMA_API_KEY', '')
    expect(isConfigured('ollama')).toBe(false)
    expect(isConfigured('gemini')).toBe(true)
    vi.stubEnv('GEMINI_API_KEY', '')
    expect(isConfigured('gemini')).toBe(false)
  })

  it('keeps instructions in a turn of their own, never merged with the data', async () => {
    // Concatenating them is what lets a crafted question read as an instruction.
    vi.stubEnv('CHATBOT_PROVIDER', 'gemini')
    const calls = stubFetch({ body: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } })
    await generateAnswer({ system: 'RULES', user: 'DATA' }, { signal: signal() })
    const sent = body(calls)
    expect(sent.systemInstruction.parts[0].text).toBe('RULES')
    expect(JSON.stringify(sent.contents)).not.toContain('RULES')
  })

  it('picks the model belonging to the provider', () => {
    vi.stubEnv('GEMINI_MODEL', 'gemini-x')
    vi.stubEnv('OLLAMA_MODEL', 'ollama-x')
    expect(activeModel('gemini')).toBe('gemini-x')
    expect(activeModel('ollama')).toBe('ollama-x')
  })

  it('answers empty rather than undefined when the model returns nothing usable', async () => {
    vi.stubEnv('CHATBOT_PROVIDER', 'ollama')
    stubFetch({ body: { choices: [] } })
    expect(await generateAnswer(turn, { signal: signal() })).toEqual({ ok: true, answer: '' })
  })

  it('streams the same text from Gemini, split however the network split it', async () => {
    vi.stubEnv('CHATBOT_PROVIDER', 'gemini')
    const calls = stubStream([
      'data: {"candidates":[{"content":{"parts":[{"text":"Deliberation "}]}}]}\n\ndata: {"candi',
      'dates":[{"content":{"parts":[{"text":"works."}]}}]}\n\n',
    ])
    expect(await collect(await streamAnswer(turn, { signal: signal() }))).toEqual(['Deliberation ', 'works.'])
    expect(calls[0].url).toContain(':streamGenerateContent?alt=sse')
  })

  it('streams the same text from Ollama', async () => {
    vi.stubEnv('CHATBOT_PROVIDER', 'ollama')
    const calls = stubStream([
      'data: {"choices":[{"delta":{"content":"Deliberation "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"works."}}]}\n\ndata: [DONE]\n\n',
    ])
    expect(await collect(await streamAnswer(turn, { signal: signal() }))).toEqual(['Deliberation ', 'works.'])
    expect(body(calls).stream).toBe(true)
  })

  it('skips a malformed event rather than ending the answer', async () => {
    vi.stubEnv('CHATBOT_PROVIDER', 'ollama')
    stubStream([
      'data: {"choices":[{"delta":{"content":"before "}}]}\n\ndata: {oops\n\n',
      'data: {"choices":[{"delta":{}}]}\n\ndata: {"choices":[{"delta":{"content":"after"}}]}\n\n',
    ])
    expect(await collect(await streamAnswer(turn, { signal: signal() }))).toEqual(['before ', 'after'])
  })

  it('reports an upstream refusal instead of opening an empty stream', async () => {
    stubStream([], 429)
    const stream = await streamAnswer(turn, { signal: signal() })
    expect(stream.ok).toBe(false)
    expect(stream.ok === false && stream.status).toBe(429)
  })

  it('carries earlier turns as turns, in the shape each provider expects', async () => {
    const history = [
      { role: 'user' as const, text: 'Who is Paolo Spada?' },
      { role: 'assistant' as const, text: 'A researcher on participatory budgeting.' },
    ]

    vi.stubEnv('CHATBOT_PROVIDER', 'gemini')
    const gemini = stubFetch({ body: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } })
    await generateAnswer({ ...turn, history }, { signal: signal() })
    // Gemini calls the assistant side "model", and the new question comes last.
    expect(body(gemini).contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user'])

    vi.stubEnv('CHATBOT_PROVIDER', 'ollama')
    const ollama = stubFetch({ body: { choices: [{ message: { content: 'ok' } }] } })
    await generateAnswer({ ...turn, history }, { signal: signal() })
    expect(body(ollama).messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
  })
})
