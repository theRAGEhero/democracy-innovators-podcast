import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import 'dotenv/config'
import config from '@payload-config'
import { getPayload } from 'payload'

const email = process.env.INITIAL_ADMIN_EMAIL || 'admin@democracyinnovators.com'
const credentialsFile = path.resolve('runtime/admin-credentials.txt')

async function main() {
  const payload = await getPayload({ config })
  const existing = await payload.find({ collection: 'users', limit: 1 })

  if (existing.docs.length) {
    payload.logger.info('An administrator already exists; no credentials were changed.')
    process.exit(0)
  }

  const password = crypto.randomBytes(24).toString('base64url')
  await payload.create({ collection: 'users', data: { email, password } })

  fs.writeFileSync(credentialsFile, `Payload admin\nEmail: ${email}\nPassword: ${password}\n`, {
    mode: 0o600,
  })
  payload.logger.info(`Created initial administrator. Credentials saved to ${credentialsFile}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
