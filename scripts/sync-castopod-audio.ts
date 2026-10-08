import 'dotenv/config'
import { createClient } from '@libsql/client'
import { fetchCastopodFeed, findCastopodEpisode } from './lib/castopod-feed'

async function main() {
  const apply = process.argv.includes('--apply')
  const databaseUrl = process.env.DATABASE_URL || 'file:./runtime/database/payload.db'
  const db = createClient({ url: databaseUrl })
  const [feed, result] = await Promise.all([
    fetchCastopodFeed(),
    db.execute("SELECT id, title, slug, html, audio_url AS audioUrl, square_cover_url AS squareCoverUrl, episode_number AS episodeNumber, episode_series AS episodeSeries FROM episodes WHERE _status = 'published'"),
  ])
  let matched = 0
  let updated = 0
  let covers = 0
  let numbers = 0
  const unmatched: string[] = []

  for (const row of result.rows) {
    const episode = {
      id: Number(row.id),
      title: String(row.title || ''),
      slug: String(row.slug || ''),
      html: String(row.html || ''),
      audioUrl: String(row.audioUrl || ''),
      squareCoverUrl: String(row.squareCoverUrl || ''),
      episodeNumber: row.episodeNumber === null || row.episodeNumber === undefined ? null : Number(row.episodeNumber),
      episodeSeries: row.episodeSeries ? String(row.episodeSeries) : null,
    }
    const needsAudio = !episode.audioUrl
    // Always look the episode up now. The match used to be skipped once audio
    // and cover were present, which is every episode — so the number, which
    // only the feed knows, would never have been written.
    const match = findCastopodEpisode(episode, feed)
    if (!match) {
      if (needsAudio || !episode.squareCoverUrl) unmatched.push(episode.title)
      continue
    }
    const willSetCover = Boolean(match.item.coverUrl) && match.item.coverUrl !== episode.squareCoverUrl
    const willSetNumber = match.item.number !== episode.episodeNumber || match.item.series !== episode.episodeSeries
    if (!needsAudio && !willSetCover && !willSetNumber) continue
    matched += 1
    const what = [
      needsAudio ? 'audio' : null,
      willSetCover ? 'cover' : null,
      willSetNumber ? `no.${match.item.number ?? '-'}${match.item.series === 'ita' ? ' ita' : ''}` : null,
    ].filter(Boolean).join('+')
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
      if (willSetNumber) {
        await db.execute({
          sql: "UPDATE episodes SET episode_number = ?, episode_series = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
          args: [match.item.number, match.item.series, episode.id],
        })
        // episodes keeps drafts, so the versions table carries the same columns.
        await db.execute({
          sql: 'UPDATE _episodes_v SET version_episode_number = ?, version_episode_series = ? WHERE parent_id = ?',
          args: [match.item.number, match.item.series, episode.id],
        })
        numbers += 1
      }
    }
  }

  console.log(`Feed items: ${feed.length}; matched: ${matched}; audio updated: ${updated}; covers updated: ${covers}; numbers updated: ${numbers}; unmatched: ${unmatched.length}`)
  for (const title of unmatched) console.log(`UNMATCHED ${title}`)
  if (!apply) console.log('Dry run only. Re-run with --apply after reviewing matches.')
  db.close()
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
