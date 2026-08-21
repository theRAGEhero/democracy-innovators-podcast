import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { activeModel, activeProvider, generateAnswer, isConfigured } from '@/lib/chat-provider'
import { SYSTEM_PROMPT, buildUserTurn, neutralizeUntrusted } from '@/lib/chat-prompt'

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
})
