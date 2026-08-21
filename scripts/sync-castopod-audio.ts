import 'dotenv/config'
import { createClient } from '@libsql/client'
import { fetchCastopodFeed, findCastopodEpisode } from './lib/castopod-feed'

async function main() {
  const apply = process.argv.includes('--apply')
  const databaseUrl = process.env.DATABASE_URL || 'file:./runtime/database/payload.db'
  const db = createClient({ url: databaseUrl })
  const [feed, result] = await Promise.all([
    fetchCastopodFeed(),
    db.execute("SELECT id, title, slug, html, audio_url AS audioUrl, square_cover_url AS squareCoverUrl FROM episodes WHERE _status = 'published'"),
  ])
  let matched = 0
  let updated = 0
  let covers = 0
  const unmatched: string[] = []

  for (const row of result.rows) {
    const episode = {
      id: Number(row.id),
      title: String(row.title || ''),
      slug: String(row.slug || ''),
      html: String(row.html || ''),
      audioUrl: String(row.audioUrl || ''),
      squareCoverUrl: String(row.squareCoverUrl || ''),
    }
    const needsAudio = !episode.audioUrl
    // The square cover is refreshed whenever it drifts: Castopod re-renders the
    // file when the artwork changes, and the URL moves with it.
    const match = needsAudio || !episode.squareCoverUrl ? findCastopodEpisode(episode, feed) : null
    if (!match) {
      if (needsAudio || !episode.squareCoverUrl) unmatched.push(episode.title)
      continue
    }
    const willSetCover = Boolean(match.item.coverUrl) && match.item.coverUrl !== episode.squareCoverUrl
    if (!needsAudio && !willSetCover) continue
    matched += 1
    const what = [needsAudio ? 'audio' : null, willSetCover ? 'cover' : null].filter(Boolean).join('+')
    console.log(`${apply ? 'UPDATE' : 'WOULD UPDATE'} [${match.matchedBy}/${what}] ${episode.title}`)
    if (apply) {
      if (needsAudio) {
        await db.execute({ sql: "UPDATE episodes SET audio_url = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND (audio_url IS NULL OR trim(audio_url) = '')", args: [match.item.audioUrl, episode.id] })
        updated += 1
      }
      if (willSetCover) {
        await db.execute({ sql: "UPDATE episodes SET square_cover_url = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", args: [match.item.coverUrl, episode.id] })
        await db.execute({ sql: "UPDATE _episodes_v SET version_square_cover_url = ? WHERE parent_id = ?", args: [match.item.coverUrl, episode.id] })
        covers += 1
      }
    }
  }

  console.log(`Feed items: ${feed.length}; matched: ${matched}; audio updated: ${updated}; covers updated: ${covers}; unmatched: ${unmatched.length}`)
  for (const title of unmatched) console.log(`UNMATCHED ${title}`)
  if (!apply) console.log('Dry run only. Re-run with --apply after reviewing matches.')
  db.close()
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
