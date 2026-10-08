import 'dotenv/config'

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

// Bring the guest portraits onto this server.
//
// Episode covers were localised from the start; portraits never were, so 64 of
// 68 guests still point at democracyinnovators.com/content/images/…. That was
// harmless while the blog served that domain. The moment it stops, every face
// in the directory, every guest's social card and the Person JSON-LD image go
// blank at once.
//
// The filename carries a hash of the source URL, exactly as downloadFeatureImage
// does in sync-ghost.ts: a name built from the slug alone matches a file that
// already exists, so a replaced image is skipped in silence and stays stale.

const runtimeRoot = path.resolve('runtime')

async function download(url: string, slug: string): Promise<string> {
  const extension = path.extname(new URL(url).pathname).toLowerCase() || '.jpg'
  const source = crypto.createHash('sha1').update(url).digest('hex').slice(0, 8)
  const relativePath = `guests/${slug}-${source}${extension}`
  const destination = path.join(runtimeRoot, 'uploads', relativePath)
  fs.mkdirSync(path.dirname(destination), { recursive: true })

  if (!fs.existsSync(destination)) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${response.status} ${url}`)
    fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()))
  }
  return `/media/${relativePath}`
}

async function main() {
  const apply = process.argv.includes('--apply')
  const payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'guests',
    depth: 0,
    limit: 500,
    where: { portraitUrl: { contains: 'democracyinnovators.com' } },
  })

  console.log(`${docs.length} portraits still hosted on the blog.\n`)
  let done = 0
  let failed = 0

  for (const guest of docs) {
    const url = String(guest.portraitUrl || '')
    if (!url) continue
    try {
      const local = await download(url, String(guest.slug))
      console.log(`${apply ? '✓' : '·'} ${String(guest.name).slice(0, 34).padEnd(36)} ${local}`)
      if (apply) {
        await payload.update({ collection: 'guests', id: guest.id, data: { portraitUrl: local }, overrideAccess: true })
      }
      done += 1
    } catch (error) {
      console.log(`✗ ${String(guest.name).slice(0, 34).padEnd(36)} ${error instanceof Error ? error.message : String(error)}`)
      failed += 1
    }
  }

  console.log(`\n${apply ? 'Done' : 'Dry run'}: ${done} rehosted, ${failed} failed.`)
  if (!apply) console.log('Re-run with --apply.')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
