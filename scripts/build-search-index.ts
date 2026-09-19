import 'dotenv/config'

import { rebuildSearchIndex, searchKeyword, toMatchQuery } from '../src/lib/archive-search'

// Builds the keyword index, and optionally shows what a query finds.
//
// The index is derived data: every row comes from archive_chunks, so this can
// be run at any time and is safe to repeat. The endpoint also builds it lazily
// on first use — this script exists so a deploy can do it deliberately rather
// than making the first visitor pay for it.
//
//   npm run search:index
//   npm run search:index -- --query "participatory budgeting"

async function main() {
  const args = process.argv.slice(2)
  const at = args.indexOf('--query')
  const query = at >= 0 ? args[at + 1] : null

  const indexed = await rebuildSearchIndex()
  console.log(`Indexed ${indexed} passages.`)

  if (!query) return

  console.log(`\nFTS query: ${toMatchQuery(query)}`)
  const hits = await searchKeyword(query, 5)
  if (!hits.length) {
    console.log('No matches.')
    return
  }
  for (const hit of hits) {
    const when = hit.startTime === null ? '—' : `${Math.floor(hit.startTime / 60)}:${String(Math.floor(hit.startTime % 60)).padStart(2, '0')}`
    console.log(`\n· ${hit.episodeTitle.slice(0, 60)}`)
    console.log(`  ${when}  ${hit.speaker || 'unattributed'}  score ${hit.score}`)
    console.log(`  ${hit.url}`)
    console.log(`  ${hit.text.slice(0, 160).replace(/\s+/g, ' ')}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
