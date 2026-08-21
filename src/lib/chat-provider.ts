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
export type ChatTurn = { system: string; user: string }

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

async function askGemini(turn: ChatTurn, signal: AbortSignal): Promise<ChatResult> {
  const model = activeModel('gemini')
  const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY || '',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: turn.system }] },
      contents: [{ role: 'user', parts: [{ text: turn.user }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 900, thinkingConfig: { thinkingBudget: 0 } },
    }),
    signal,
  })
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
  const base = (process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULT_BASE).replace(/\/$/, '')
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OLLAMA_API_KEY || ''}`,
    },
    body: JSON.stringify({
      model: activeModel('ollama'),
      messages: [
        { role: 'system', content: turn.system },
        { role: 'user', content: turn.user },
      ],
      temperature: 0.1,
      max_tokens: 900,
      stream: false,
    }),
    signal,
  })
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
