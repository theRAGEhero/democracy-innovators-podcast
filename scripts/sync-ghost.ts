import fs from 'node:fs'
import path from 'node:path'

import 'dotenv/config'
import config from '@payload-config'
import { getPayload } from 'payload'

const ghostOrigin = process.env.GHOST_ORIGIN || 'https://democracyinnovators.com'
const ghostContentKey = process.env.GHOST_CONTENT_KEY
const runtimeRoot = path.resolve('runtime')

type GhostPost = {
  id: string
  slug: string
  title: string
  published_at: string
  custom_excerpt?: string | null
  excerpt?: string | null
  feature_image?: string | null
  html?: string | null
  plaintext?: string | null
}

const newGuestRules: Record<string, string[]> = {
  'marcello-coppa-on-the-feel-community-the-govtech-forum-technological-innovation-and-reform': ['Marcello Coppa'],
  'wietse-van-ransbeeck-about-go-vocal-and-how-to-integrate-participation-into-governance': ['Wietse van Ransbeeck'],
  'jorge-lagarto-about-labx-and-human-centric-design-in-the-public-sector': ['Jorge Lagarto'],
  'sylvain-le-bon-from-startinblox-about-data-spaces-democracy-and-interoperability': ['Sylvain Le Bon'],
  'cecile-green-seth-frey-on-the-commoning-standard-and-the-role-of-self-governance-for-democracy': ['Cecile Green', 'Seth Frey'],
  'ben-nelson-on-the-minerva-project-reforming-higher-education-and-its-role-for-democracy': ['Ben Nelson'],
  'paul-zeitz-about-permanent-citizens-assemblies-in-the-us-and-using-technology-to-scale-it': ['Paul Zeitz'],
  'giovanni-di-sotto-on-electronic-voting-security-and-democratic-innovation': ['Giovanni Di Sotto'],
  'antoine-vergne-from-missions-publiques-on-scaling-deliberative-decision-making-and-random-selection': ['Antoine Vergne'],
  'paolo-spada-on-participatory-budgeting-citizen-assemblies-and-scaling-democratic-innovation': ['Paolo Spada'],
}

const topicRules: Array<[string, RegExp]> = [
  ['Artificial intelligence', /\bAI\b|algorithm|agentic|generative/i],
  ['Civic technology', /civic tech|digital tool|platform|open source|govtech/i],
  ['Deliberative democracy', /deliberat|citizens.? assembl|public deliberation|random selection/i],
  ['Participation', /participat|collective decision|citizen engagement|commoning/i],
  ['Governance', /governance|government|public sector|institution|self-governance/i],
  ['Digital democracy', /digital democracy|e-voting|electronic voting|online communit|internet|data space|interoperability/i],
  ['Trust and security', /trust|security|cryptograph|misinformation|toxic/i],
]

function slugify(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function stripHTML(value = '') {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function excerptFor(post: GhostPost) {
  const text = stripHTML(post.custom_excerpt || post.excerpt || post.html || '')
    .replace(/^Donate on PayPal\s*/i, '')
    .replace(/^Automatic transcription[^.]*\.?\s*/i, '')
  if (text.length <= 320) return text
  return `${text.slice(0, 317).replace(/\s+\S*$/, '')}...`
}

async function downloadFeatureImage(post: GhostPost) {
  if (!post.feature_image) return undefined
  const extension = path.extname(new URL(post.feature_image).pathname).toLowerCase() || '.jpg'
  const relativePath = `episodes/${post.slug}${extension}`
  const destination = path.join(runtimeRoot, 'uploads', relativePath)
  fs.mkdirSync(path.dirname(destination), { recursive: true })

  if (!fs.existsSync(destination)) {
    const response = await fetch(post.feature_image)
    if (!response.ok) throw new Error(`Image download failed (${response.status}): ${post.feature_image}`)
    fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()))
  }

  return `/media/${relativePath}`
}

async function main() {
  if (!ghostContentKey) throw new Error('GHOST_CONTENT_KEY is not configured.')
  const api = new URL('/ghost/api/content/posts/', ghostOrigin)
  api.searchParams.set('key', ghostContentKey)
  api.searchParams.set('limit', 'all')
  api.searchParams.set('include', 'tags,authors')
  api.searchParams.set('formats', 'html,plaintext')
  api.searchParams.set('order', 'published_at asc')

  const response = await fetch(api)
  if (!response.ok) throw new Error(`Ghost API returned ${response.status}.`)
  const dataset = await response.json() as { posts: GhostPost[] }
  const snapshotDir = path.join(runtimeRoot, 'ghost')
  fs.mkdirSync(snapshotDir, { recursive: true })
  fs.writeFileSync(path.join(snapshotDir, 'posts.json'), `${JSON.stringify(dataset, null, 2)}\n`)

  const payload = await getPayload({ config })
  const current = await payload.find({ collection: 'episodes', depth: 0, limit: 1000 })
  const existingSlugs = new Set(current.docs.map((episode) => episode.slug))
  const missing = dataset.posts.filter((post) => !existingSlugs.has(post.slug))

  const topicIds = new Map<string, number>()
  for (const [name] of topicRules) {
    const slug = slugify(name)
    const result = await payload.find({ collection: 'topics', depth: 0, limit: 1, where: { slug: { equals: slug } } })
    const topic = result.docs[0] || await payload.create({ collection: 'topics', data: { name, slug } })
    topicIds.set(name, Number(topic.id))
  }

  let importedGuests = 0
  for (const post of missing) {
    const guests: number[] = []
    for (const name of newGuestRules[post.slug] || []) {
      const slug = slugify(name)
      const result = await payload.find({ collection: 'guests', depth: 0, limit: 1, where: { slug: { equals: slug } } })
      let guest = result.docs[0]
      if (!guest) {
        guest = await payload.create({
          collection: 'guests',
          data: {
            name,
            slug,
            summary: `${name} joined Democracy Innovators Podcast for a conversation about ${post.title}.`,
            conversationSummary: stripHTML(post.html || '').slice(0, 900),
            portraitUrl: post.feature_image || undefined,
            _status: 'published',
          },
        })
        importedGuests += 1
      }
      guests.push(Number(guest.id))
    }

    let featureImageUrl = post.feature_image || undefined
    try {
      featureImageUrl = await downloadFeatureImage(post)
    } catch (error) {
      payload.logger.warn(error instanceof Error ? error.message : String(error))
    }

    const searchable = `${post.title} ${post.custom_excerpt || ''} ${(post.plaintext || '').slice(0, 1200)}`
    const topics = topicRules.filter(([, pattern]) => pattern.test(searchable)).map(([name]) => topicIds.get(name)!)
    const youtubeId = post.html?.match(/youtube\.com\/embed\/([^?"&]+)/i)?.[1]
    const episode = await payload.create({
      collection: 'episodes',
      data: {
        title: post.title,
        slug: post.slug,
        legacyId: post.id,
        publishedAt: post.published_at,
        excerpt: excerptFor(post),
        featureImageUrl,
        videoUrl: youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : undefined,
        html: post.html || '',
        transcriptText: post.plaintext || stripHTML(post.html || ''),
        guests,
        topics,
        _status: 'published',
      },
    })

    for (const guestId of guests) {
      const guest = await payload.findByID({ collection: 'guests', depth: 0, id: guestId })
      const episodeIds = (guest.episodes || []).map((item) => typeof item === 'object' ? item.id : item)
      await payload.update({ collection: 'guests', id: guestId, data: { episodes: [...new Set([...episodeIds, episode.id])] } })
    }
  }

  payload.logger.info(`Ghost sync complete: ${dataset.posts.length} downloaded, ${missing.length} episodes and ${importedGuests} guests imported.`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
