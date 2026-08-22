// Which model answers an archive question.
//
// Only the *answer* is provider-switchable. Embeddings stay on Gemini on
// purpose: the 852 rows in archive-chunks are stored with
// embeddingModel = 'gemini-embedding-2' and retrieval filters on that field,
// so moving them would mean re-indexing the whole archive with a different
// vector size. See src/lib/archive-rag.ts.

export type ChatProvider = 'gemini' | 'ollama'

/** Instructions and data are kept in separate turns on purpose: it is the
 *  first line of defence against a question or a transcript talking its way
 *  into being treated as an instruction. See src/lib/chat-prompt.ts. */
export type ChatTurn = {
  system: string
  user: string
  /** Earlier exchanges, so a follow-up like "and what does she think?" has a
   *  referent. Passed as real turns rather than pasted into `user`, for the
   *  same reason the instructions are: text that arrives as data should never
   *  be in a position to read as an instruction. Already sanitised — see
   *  sanitizeHistory in src/lib/chat-prompt.ts. */
  history?: { role: 'user' | 'assistant'; text: string }[]
}

export type ChatStream =
  | { ok: true; deltas: AsyncIterable<string> }
  | { ok: false; status: number; detail: string }

export type ChatResult =
  | { ok: true; answer: string }
  /** The upstream failure, untranslated — the caller decides what the visitor
   *  sees and what gets recorded in the rate-limit tally. */
  | { ok: false; status: number; detail: string }

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
const OLLAMA_DEFAULT_BASE = 'https://ollama.com/v1'
// Plain catalogue id, no ":cloud" suffix: that suffix is for a local daemon
// proxying to the cloud, and ollama.com rejects it.
// gemma4 is the one cloud model measured here that does no chain-of-thought:
// every one of the 900 tokens goes to the answer instead of to reasoning the
// visitor never sees. That matches the thinkingBudget: 0 already set for
// Gemini, and it removes the failure mode where a reasoning model spends the
// budget thinking and truncates mid-sentence.
// gpt-oss:120b is the alternative if a stronger model is wanted.
const OLLAMA_DEFAULT_MODEL = 'gemma4'

/** Gemini unless CHATBOT_PROVIDER says otherwise. A typo falls back to the
 *  default rather than breaking the assistant. */
export function activeProvider(): ChatProvider {
  return process.env.CHATBOT_PROVIDER?.trim().toLowerCase() === 'ollama' ? 'ollama' : 'gemini'
}

export function activeModel(provider: ChatProvider = activeProvider()): string {
  return provider === 'ollama'
    ? process.env.OLLAMA_MODEL || OLLAMA_DEFAULT_MODEL
    : process.env.GEMINI_MODEL || 'gemini-2.5-flash'
}

export function isConfigured(provider: ChatProvider = activeProvider()): boolean {
  return Boolean(provider === 'ollama' ? process.env.OLLAMA_API_KEY : process.env.GEMINI_API_KEY)
}

async function readError(response: Response): Promise<string> {
  return response.text().catch(() => '')
}

function geminiRequest(turn: ChatTurn, stream: boolean) {
  const model = activeModel('gemini')
  const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent'
  return {
    url: `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:${method}`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY || '',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: turn.system }] },
        contents: [
          ...(turn.history || []).map((message) => ({
            // Gemini calls the assistant side "model".
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.text }],
          })),
          { role: 'user', parts: [{ text: turn.user }] },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 900, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  }
}

function ollamaRequest(turn: ChatTurn, stream: boolean) {
  const base = (process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULT_BASE).replace(/\/$/, '')
  return {
    url: `${base}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OLLAMA_API_KEY || ''}`,
      },
      body: JSON.stringify({
        model: activeModel('ollama'),
        messages: [
          { role: 'system', content: turn.system },
          ...(turn.history || []).map((message) => ({ role: message.role, content: message.text })),
          { role: 'user', content: turn.user },
        ],
        temperature: 0.1,
        max_tokens: 900,
        stream,
      }),
    },
  }
}

async function askGemini(turn: ChatTurn, signal: AbortSignal): Promise<ChatResult> {
  const { url, init } = geminiRequest(turn, false)
  const response = await fetch(url, { ...init, signal })
  if (!response.ok) return { ok: false, status: response.status, detail: await readError(response) }
  const result = await response.json()
  const answer = result?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || '')
    .join('\n')
    .trim()
  return { ok: true, answer: answer || '' }
}

// Ollama Cloud's OpenAI-compatible endpoint rather than the native /api/chat:
// it takes temperature and max_tokens under the same names used for Gemini,
// which keeps the two implementations readable side by side, and a configurable
// base URL makes a self-hosted Ollama work the same way.
async function askOllama(turn: ChatTurn, signal: AbortSignal): Promise<ChatResult> {
  const { url, init } = ollamaRequest(turn, false)
  const response = await fetch(url, { ...init, signal })
  if (!response.ok) return { ok: false, status: response.status, detail: await readError(response) }
  const result = await response.json()
  const answer = typeof result?.choices?.[0]?.message?.content === 'string'
    ? result.choices[0].message.content.trim()
    : ''
  return { ok: true, answer }
}

export async function generateAnswer(turn: ChatTurn, opts: { signal: AbortSignal }): Promise<ChatResult> {
  return activeProvider() === 'ollama' ? askOllama(turn, opts.signal) : askGemini(turn, opts.signal)
}

/** The payload of each `data:` line of an SSE body. Both providers speak SSE
 *  when streaming, so the framing is read once and the shapes differ only in
 *  where the text sits. */
async function* dataLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      for (let newline = buffer.indexOf('\n'); newline >= 0; newline = buffer.indexOf('\n')) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line.startsWith('data:')) yield line.slice(5).trim()
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** Pull the answer text out of one streamed event, whatever the provider put
 *  around it. A malformed line is skipped rather than ending the answer. */
function deltaText(payload: string, provider: ChatProvider): string {
  if (!payload || payload === '[DONE]') return ''
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return ''
  }
  const data = parsed as {
    choices?: { delta?: { content?: string } }[]
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  if (provider === 'ollama') {
    const content = data.choices?.[0]?.delta?.content
    return typeof content === 'string' ? content : ''
  }
  const parts = data.candidates?.[0]?.content?.parts
  return Array.isArray(parts) ? parts.map((part) => part.text || '').join('') : ''
}

/**
 * The answer as it is written, rather than after it is finished.
 *
 * Retrieval and the citations are ready before the model is called, so the
 * visitor can be reading sources while the text arrives — which is most of the
 * difference between the assistant feeling immediate and feeling stalled.
 */
export async function streamAnswer(turn: ChatTurn, opts: { signal: AbortSignal }): Promise<ChatStream> {
  const provider = activeProvider()
  const { url, init } = provider === 'ollama' ? ollamaRequest(turn, true) : geminiRequest(turn, true)
  const response = await fetch(url, { ...init, signal: opts.signal })
  if (!response.ok) return { ok: false, status: response.status, detail: await readError(response) }
  if (!response.body) return { ok: false, status: 502, detail: 'The provider returned no body.' }

  const body = response.body
  return {
    ok: true,
    deltas: (async function* () {
      for await (const payload of dataLines(body)) {
        const text = deltaText(payload, provider)
        if (text) yield text
      }
    })(),
  }
}
