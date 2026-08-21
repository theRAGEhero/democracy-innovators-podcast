import 'dotenv/config'
import crypto from 'node:crypto'
import fs from 'node:fs'
import config from '@payload-config'
import { getPayload } from 'payload'

function upsertEnvValue(contents: string, name: string, value: string): string {
  const line = `${name}=${value}`
  const pattern = new RegExp(`^${name}=.*$`, 'm')

  if (pattern.test(contents)) return contents.replace(pattern, line)
  return `${contents}${contents && !contents.endsWith('\n') ? '\n' : ''}${line}\n`
}

// Enables an API key on a user and prints the plaintext key (stored encrypted).
async function main() {
  const args = process.argv.slice(2)
  const outputEnvIndex = args.indexOf('--output-env')
  const outputEnvPath = outputEnvIndex >= 0 ? args[outputEnvIndex + 1] : undefined
  if (outputEnvIndex >= 0 && !outputEnvPath) throw new Error('--output-env requires a file path')

  const positionalArgs = args.filter((arg, index) => arg !== '--output-env' && index !== outputEnvIndex + 1)
  const email = positionalArgs[0] || 'admin@democracyinnovators.com'
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'users', limit: 1, where: { email: { equals: email } } })
  const user = docs[0]
  if (!user) throw new Error(`User not found: ${email}`)

  const apiKey = crypto.randomBytes(24).toString('hex')
  await payload.update({
    collection: 'users',
    id: user.id,
    data: { enableAPIKey: true, apiKey },
    overrideAccess: true,
  })

  payload.logger.info('API key created.')
  if (outputEnvPath) {
    const apiURL = process.env.STREAM_API_URL || process.env.NEXT_PUBLIC_SERVER_URL || 'https://stream.democracyinnovators.com'
    let contents = fs.existsSync(outputEnvPath) ? fs.readFileSync(outputEnvPath, 'utf8') : ''
    contents = upsertEnvValue(contents, 'STREAM_API_URL', apiURL)
    contents = upsertEnvValue(contents, 'STREAM_API_KEY', apiKey)
    fs.writeFileSync(outputEnvPath, contents, { encoding: 'utf8', mode: 0o600 })
    fs.chmodSync(outputEnvPath, 0o600)
    console.log(`API key saved to ${outputEnvPath} (fingerprint: ...${apiKey.slice(-8)})`)
    process.exit(0)
  }

  console.log('\n==============================================')
  console.log('USER:    ', email)
  console.log('API KEY: ', apiKey)
  console.log('HEADER:  Authorization: users API-Key ' + apiKey)
  console.log('==============================================\n')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
