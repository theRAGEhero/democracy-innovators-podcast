import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { getPayload } from 'payload'
import config from '@payload-config'

// Populates guests.officialLinks from a researched JSON map:
//   { "<guest id>": { name, links: [[label, url], ...] } }
// Runs through the Payload API rather than SQL so the drafts/versions tables
// stay consistent — see the migration notes for why that matters here.
async function main() {
  const apply = process.argv.includes('--apply')
  const file = process.argv.find((arg) => arg.endsWith('.json'))
  if (!file) throw new Error('Pass the path to the links JSON.')
  const map: Record<string, { name: string; links: [string, string][] }> = JSON.parse(readFileSync(file, 'utf8'))
  const payload = await getPayload({ config })

  let updated = 0
  let skipped = 0
  for (const [id, entry] of Object.entries(map)) {
    const guest = await payload.findByID({ collection: 'guests', id: Number(id) }).catch(() => null)
    if (!guest) { console.log(`MISSING id=${id} (${entry.name})`); continue }
    if (guest.name.trim().toLowerCase() !== entry.name.trim().toLowerCase()) {
      // The map is keyed by id; a name mismatch means the ids moved under us.
      console.log(`NAME MISMATCH id=${id}: db="${guest.name}" file="${entry.name}" — skipped`)
      skipped += 1
      continue
    }
    if (guest.officialLinks?.length) { console.log(`HAS LINKS ${guest.name} — skipped`); skipped += 1; continue }
    console.log(`${apply ? 'UPDATE' : 'WOULD UPDATE'} ${guest.name}: ${entry.links.map(([l]) => l).join(', ')}`)
    if (apply) {
      await payload.update({
        collection: 'guests',
        id: Number(id),
        data: { officialLinks: entry.links.map(([label, url]) => ({ label, url })) },
        draft: false,
        overrideAccess: true,
      })
      updated += 1
    }
  }
  console.log(`\nguests in file: ${Object.keys(map).length}; updated: ${updated}; skipped: ${skipped}`)
  if (!apply) console.log('Dry run. Re-run with --apply.')
  process.exit(0)
}

main().catch((error) => { console.error(error); process.exit(1) })
