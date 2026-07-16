import fs from 'node:fs'
import path from 'node:path'

import 'dotenv/config'

const API_ORIGIN = process.env.PAYLOAD_API_ORIGIN || 'http://127.0.0.1:8098'
const AUDIT_PATH = path.resolve('runtime/ai/episode-summaries.json')
const CREDENTIALS_PATH = path.resolve('runtime/admin-credentials.txt')
const APPLY = process.argv.includes('--apply')

type AuditEntry = {
  episodeId: number
  title: string
  slug: string
  oldExcerpt: string
  newExcerpt: string
  source: 'codex'
  reviewedAt: string
  appliedAt?: string
}

type AuditFile = {
  version: 1
  generatedBy: 'codex'
  targetField: 'episodes.excerpt'
  entries: AuditEntry[]
}

function normalized(value = '') {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function wordCount(value: string) {
  return normalized(value).split(' ').filter(Boolean).length
}

function looksLikeTranscriptOpening(value: string) {
  return /donate on paypal|automatic transcription|welcome (?:on|to) another episode|thank you for your time|\b[A-Z][\p{L} .'-]{1,40}\s*\(\d{1,2}:\d{2}\)|(?:^|\s)[~⁓](?:\s|$)/iu.test(value)
}

async function apiJSON<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(pathname, API_ORIGIN), {
    ...init,
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`API ${init?.method || 'GET'} ${pathname} returned ${response.status}: ${(await response.text()).slice(0, 300)}`)
  return response.json() as Promise<T>
}

function readAdminCredentials() {
  const contents = fs.readFileSync(CREDENTIALS_PATH, 'utf8')
  const email = contents.match(/^Email:\s*(.+)$/m)?.[1]?.trim()
  const password = contents.match(/^Password:\s*(.+)$/m)?.[1]?.trim()
  if (!email || !password) throw new Error(`Admin credentials are missing from ${CREDENTIALS_PATH}.`)
  return { email, password }
}

function readAudit() {
  if (!fs.existsSync(AUDIT_PATH)) throw new Error(`Missing audit file: ${AUDIT_PATH}`)
  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8')) as AuditFile
  if (audit.version !== 1 || audit.generatedBy !== 'codex' || audit.targetField !== 'episodes.excerpt') {
    throw new Error('Audit file has an unexpected format.')
  }
  for (const entry of audit.entries) {
    const words = wordCount(entry.newExcerpt)
    if (words < 35 || words > 90) throw new Error(`${entry.title}: summary has ${words} words.`)
    if (looksLikeTranscriptOpening(entry.newExcerpt)) throw new Error(`${entry.title}: summary still looks like transcript boilerplate.`)
  }
  return audit
}

async function applyAudit(audit: AuditFile) {
  const credentials = readAdminCredentials()
  const login = await apiJSON<{ token: string }>('/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  })
  if (!login.token) throw new Error('Payload login did not return a token.')

  for (const entry of audit.entries) {
    if (entry.appliedAt) continue
    await apiJSON(`/api/episodes/${entry.episodeId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `JWT ${login.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ excerpt: entry.newExcerpt, _status: 'published' }),
    })
    entry.appliedAt = new Date().toISOString()
    fs.writeFileSync(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, { mode: 0o600 })
    console.log(`Applied ${entry.title}.`)
  }
}

async function main() {
  const audit = readAudit()
  console.log(`Loaded ${audit.entries.length} Codex-authored episode summaries.`)
  if (!APPLY) {
    for (const entry of audit.entries) console.log(`${entry.episodeId}: ${entry.newExcerpt}`)
    console.log('Dry run complete. Re-run with --apply to publish the summaries.')
    return
  }
  await applyAudit(audit)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
