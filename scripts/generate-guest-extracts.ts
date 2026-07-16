import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import 'dotenv/config'

const API_ORIGIN = process.env.PAYLOAD_API_ORIGIN || 'http://127.0.0.1:8098'
const MODEL = process.env.GEMINI_PROFILE_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const CHECKPOINT_PATH = path.resolve('runtime/ai/guest-extracts.json')
const CREDENTIALS_PATH = path.resolve('runtime/admin-credentials.txt')
const APPLY = process.argv.includes('--apply')
const FORCE = process.argv.includes('--force')
const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='))
const LIMIT = limitArgument ? Number(limitArgument.split('=')[1]) : undefined

type Guest = {
  id: number
  name: string
  role?: string | null
  organizationLabel?: string | null
  episodes?: Array<number | { id: number }>
}

type Episode = {
  id: number
  title: string
  excerpt?: string | null
  transcriptText?: string | null
}

type Extract = {
  summary: string
  conversationSummary: string
  evidence: string[]
}

type CheckpointEntry = {
  guestId: number
  guestName: string
  episodeIds: number[]
  sourceHash: string
  model: string
  generatedAt: string
  appliedAt?: string
  extract: Extract
}

type Checkpoint = {
  version: 1
  entries: Record<string, CheckpointEntry>
}

function normalized(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/~/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function wordCount(value: string) {
  return normalized(value).split(' ').filter(Boolean).length
}

const contractions: Record<string, string[]> = {
  "i'm": ['i', 'am'],
  "it's": ['it', 'is'],
  "we're": ['we', 'are'],
  "we've": ['we', 'have'],
  "we'll": ['we', 'will'],
  "they're": ['they', 'are'],
  "they've": ['they', 'have'],
  "that's": ['that', 'is'],
  "there's": ['there', 'is'],
  "you're": ['you', 'are'],
  "you've": ['you', 'have'],
}

function canonicalWords(value: string) {
  const words: Array<{ value: string; start: number; end: number }> = []
  for (const match of value.matchAll(/[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu)) {
    const original = match[0]
    const start = match.index
    const end = start + original.length
    const lower = original.toLowerCase().replace(/\u2019/g, "'")
    for (const word of contractions[lower] || [lower]) words.push({ value: word, start, end })
  }
  return words
}

function findVerbatimEvidence(excerpt: string, source: string) {
  const expected = canonicalWords(excerpt)
  const available = canonicalWords(source)
  if (!expected.length) return undefined

  outer: for (let index = 0; index <= available.length - expected.length; index += 1) {
    for (let offset = 0; offset < expected.length; offset += 1) {
      if (available[index + offset].value !== expected[offset].value) continue outer
    }
    const first = available[index]
    const last = available[index + expected.length - 1]
    return normalized(source.slice(first.start, last.end))
  }
  return undefined
}

function loadCheckpoint(): Checkpoint {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { version: 1, entries: {} }
  return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8')) as Checkpoint
}

function saveCheckpoint(checkpoint: Checkpoint) {
  fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true })
  const temporaryPath = `${CHECKPOINT_PATH}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporaryPath, CHECKPOINT_PATH)
}

async function apiJSON<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(pathname, API_ORIGIN), {
    ...init,
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`API ${init?.method || 'GET'} ${pathname} returned ${response.status}.`)
  return response.json() as Promise<T>
}

function validateExtract(value: unknown, source: string): Extract {
  if (!value || typeof value !== 'object') throw new Error('Model output is not an object.')
  const candidate = value as Partial<Extract>
  const summary = typeof candidate.summary === 'string' ? normalized(candidate.summary) : ''
  const conversationSummary = typeof candidate.conversationSummary === 'string' ? normalized(candidate.conversationSummary) : ''
  const evidence = Array.isArray(candidate.evidence)
    ? candidate.evidence
      .filter((item): item is string => typeof item === 'string')
      .map((item) => findVerbatimEvidence(item, source))
      .filter((item): item is string => Boolean(item))
    : []

  const summaryWords = wordCount(summary)
  const conversationWords = wordCount(conversationSummary)
  if (summaryWords < 40 || summaryWords > 80) throw new Error(`Short profile has ${summaryWords} words; it must have 40-80.`)
  if (conversationWords < 90 || conversationWords > 200) throw new Error(`Conversation extract has ${conversationWords} words; it must have 90-200.`)
  if (evidence.length < 2 || evidence.length > 4) throw new Error(`Expected 2-4 evidence excerpts, received ${evidence.length}.`)

  const normalizedSource = normalized(source)
  for (const excerpt of evidence) {
    const words = wordCount(excerpt)
    if (words < 8 || words > 50) throw new Error(`Evidence excerpt has ${words} words.`)
    if (!normalizedSource.includes(excerpt)) throw new Error(`Evidence is not verbatim: ${excerpt}`)
  }

  return { summary, conversationSummary, evidence }
}

function buildSource(guest: Guest, episodes: Episode[]) {
  return episodes.map((episode) => [
    `EPISODE: ${episode.title}`,
    episode.excerpt ? `PUBLISHED EXCERPT: ${episode.excerpt}` : '',
    'TRANSCRIPT:',
    episode.transcriptText || '',
  ].filter(Boolean).join('\n')).join('\n\n--- NEXT EPISODE ---\n\n')
}

async function generateExtract(guest: Guest, source: string): Promise<Extract> {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.')
  const prompt = `You are editing an interview archive. Create an accurate profile for ${guest.name} using ONLY the supplied episode metadata and transcript.

Rules:
- Do not use outside knowledge or infer credentials, employers, achievements, beliefs, or identity.
- Attribute views to the guest. Do not present the host's statements as the guest's views.
- The short profile must be 40-80 words. Identify the guest from explicit transcript or episode statements, then state the main focus of the interview.
- The conversation summary must be 90-180 words. Capture the guest's substantive claims, methods, examples, cautions, or proposals. Be specific and neutral.
- If the automatic transcript is unclear, omit the uncertain claim rather than repairing it from assumptions.
- Return 2-4 evidence excerpts, each 8-50 words, copied VERBATIM from the supplied text. Evidence must support the profile and summary.
- Return only JSON with keys summary, conversationSummary, evidence.

SOURCE MATERIAL:
${source}`

  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const correction = lastError instanceof Error
        ? `\n\nYour previous response failed validation: ${lastError.message}\nCorrect that problem in this response.`
        : ''
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${prompt}${correction}` }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1800,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              required: ['summary', 'conversationSummary', 'evidence'],
              properties: {
                summary: { type: 'STRING' },
                conversationSummary: { type: 'STRING' },
                evidence: { type: 'ARRAY', minItems: 2, maxItems: 4, items: { type: 'STRING' } },
              },
            },
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(90_000),
      })
      if (!response.ok) throw new Error(`Gemini returned ${response.status}: ${(await response.text()).slice(0, 300)}`)
      const result = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim()
      if (!text) throw new Error('Gemini returned no text.')
      return validateExtract(JSON.parse(text), source)
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000))
    }
  }
  throw lastError
}

function readAdminCredentials() {
  const contents = fs.readFileSync(CREDENTIALS_PATH, 'utf8')
  const email = contents.match(/^Email:\s*(.+)$/m)?.[1]?.trim()
  const password = contents.match(/^Password:\s*(.+)$/m)?.[1]?.trim()
  if (!email || !password) throw new Error(`Admin credentials are missing from ${CREDENTIALS_PATH}.`)
  return { email, password }
}

async function applyExtracts(checkpoint: Checkpoint, entries: CheckpointEntry[]) {
  const credentials = readAdminCredentials()
  const login = await apiJSON<{ token: string }>('/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  })
  if (!login.token) throw new Error('Payload login did not return a token.')

  for (const entry of entries) {
    if (entry.appliedAt && !FORCE) continue
    await apiJSON(`/api/guests/${entry.guestId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `JWT ${login.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: entry.extract.summary,
        conversationSummary: entry.extract.conversationSummary,
        _status: 'published',
      }),
    })
    entry.appliedAt = new Date().toISOString()
    checkpoint.entries[String(entry.guestId)] = entry
    saveCheckpoint(checkpoint)
    console.log(`Applied ${entry.guestName}.`)
  }
}

async function main() {
  const guestResult = await apiJSON<{ docs: Guest[]; totalDocs: number }>('/api/guests?limit=100&depth=0&sort=name')
  const allGuests = LIMIT ? guestResult.docs.slice(0, LIMIT) : guestResult.docs
  if (!allGuests.length) throw new Error('No guests found.')
  if (!LIMIT && allGuests.length !== guestResult.totalDocs) throw new Error('The guest API response was paginated.')

  const checkpoint = loadCheckpoint()
  const completeEntries: CheckpointEntry[] = []
  for (const [index, guest] of allGuests.entries()) {
    const episodeIds = (guest.episodes || []).map((episode) => typeof episode === 'number' ? episode : episode.id)
    if (!episodeIds.length) throw new Error(`${guest.name} has no linked episode.`)
    const episodes = await Promise.all(episodeIds.map((id) => apiJSON<Episode>(`/api/episodes/${id}?depth=0`)))
    const source = buildSource(guest, episodes)
    if (wordCount(source) < 100) throw new Error(`${guest.name} has insufficient transcript material.`)
    const sourceHash = crypto.createHash('sha256').update(source).digest('hex')
    const existing = checkpoint.entries[String(guest.id)]

    let entry = existing
    if (FORCE || !existing || existing.sourceHash !== sourceHash || existing.model !== MODEL) {
      console.log(`[${index + 1}/${allGuests.length}] Generating ${guest.name}...`)
      const extract = await generateExtract(guest, source)
      entry = {
        guestId: guest.id,
        guestName: guest.name,
        episodeIds,
        sourceHash,
        model: MODEL,
        generatedAt: new Date().toISOString(),
        extract,
      }
      checkpoint.entries[String(guest.id)] = entry
      saveCheckpoint(checkpoint)
    } else {
      console.log(`[${index + 1}/${allGuests.length}] Reusing validated extract for ${guest.name}.`)
    }
    completeEntries.push(entry)
  }

  console.log(`Validated ${completeEntries.length} guest extracts.`)
  if (APPLY) await applyExtracts(checkpoint, completeEntries)
  else console.log('Dry run complete. Re-run with --apply to publish the extracts.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
