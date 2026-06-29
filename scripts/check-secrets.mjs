import fs from 'node:fs'

const files = fs.readFileSync(0, 'utf8').split('\0').filter(Boolean)
const blockedPaths = [
  /(^|\/)\.env(?:\..+)?$/,
  /(^|\/)runtime\//,
  /(^|\/)logs?\//,
  /(^|\/)admin-credentials\.txt$/i,
  /\.(?:db|sqlite|sqlite3|pem|p12|pfx|key)$/i,
  /\.(?:zip|tar|tgz|gz)$/i,
]
const contentPatterns = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Google API key', /AIza[0-9A-Za-z_-]{30,}/],
  ['OpenAI-style API key', /sk-[0-9A-Za-z_-]{20,}/],
  ['GitHub token', /gh[pousr]_[0-9A-Za-z]{30,}/],
  ['Slack token', /xox[baprs]-[0-9A-Za-z-]{20,}/],
]

const findings = []
for (const file of files) {
  if (file.endsWith('.env.example')) continue
  if (blockedPaths.some((pattern) => pattern.test(file))) {
    findings.push(`${file}: sensitive filename`)
    continue
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue
  const buffer = fs.readFileSync(file)
  if (buffer.includes(0)) continue
  const text = buffer.toString('utf8')
  for (const [label, pattern] of contentPatterns) {
    if (pattern.test(text)) findings.push(`${file}: possible ${label}`)
  }
}

if (findings.length) {
  console.error('Secret check failed:')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exit(1)
}

console.log(`Secret check passed (${files.length} non-ignored files scanned).`)
