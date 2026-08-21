import fs from 'node:fs'
import path from 'node:path'

import 'dotenv/config'
import config from '@payload-config'
import { getPayload } from 'payload'

import { normalizeChapters, formatTimestamp } from '@/lib/chapters'
import { extractYouTubeId } from '@/lib/embeds'

// Exports YouTube-ready chapter blocks (0:00 Title ...) for every episode that
// has a YouTube video, so they can be pasted into each video's description —
// YouTube then generates chapters/Key Moments automatically. Read-only.

async function main() {
  const payload = await getPayload({ config })
  const { docs: episodes } = await payload.find({ collection: 'episodes', depth: 0, limit: 1000 })

  const blocks: string[] = []
  let withVideo = 0
  for (const episode of episodes) {
    const chapters = normalizeChapters(episode.chapters)
    if (chapters.length < 3) continue
    const youtubeId = extractYouTubeId(episode.videoUrl, episode.html)
    if (!youtubeId) continue
    withVideo += 1

    // YouTube requires the first stamp to be 0:00.
    const lines = chapters.map((c, i) => `${i === 0 ? '0:00' : formatTimestamp(c.startTime)} ${c.title}`)
    blocks.push(
      [
        `### ${episode.title}`,
        `https://www.youtube.com/watch?v=${youtubeId}`,
        '',
        'Chapters:',
        ...lines,
        '',
        '—'.repeat(20),
        '',
      ].join('\n'),
    )
  }

  const outPath = path.resolve('runtime/youtube-chapters.txt')
  fs.writeFileSync(outPath, blocks.join('\n'))
  payload.logger.info(`Wrote ${withVideo} episode chapter blocks to ${outPath}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
