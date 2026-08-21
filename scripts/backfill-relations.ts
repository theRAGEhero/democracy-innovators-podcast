import 'dotenv/config'
import config from '@payload-config'
import { getPayload } from 'payload'

// One-off backfill: creates guest profiles for episodes imported without them
// and assigns topics to episodes that have none, so every episode is reachable
// from a topic hub and a guest profile. Safe to re-run (idempotent).

// Same heuristics used by scripts/sync-ghost.ts.
const topicRules: Array<[string, RegExp]> = [
  ['Artificial intelligence', /\bAI\b|artificial intelligence|algorithm|agentic|generative|machine learning/i],
  ['Civic technology', /civic tech|digital tool|platform|open source|govtech|civic app/i],
  ['Deliberative democracy', /deliberat|citizens.? assembl|public deliberation|random selection|sortition|mini-public/i],
  ['Participation', /participat|collective decision|citizen engagement|commoning|co-creation/i],
  ['Governance', /governance|government|public sector|institution|self-governance|policy/i],
  ['Digital democracy', /digital democracy|e-voting|electronic voting|online communit|internet|data space|interoperability|fediverse|decentrali/i],
  ['Trust and security', /\btrust\b|security|cryptograph|misinformation|disinformation|toxic|polaris|polariz/i],
]

// Guests missing after the Ghost import (episode slug prefix -> guest name).
const missingGuests: Record<string, string> = {
  'alice-casiraghi': 'Alice Casiraghi',
  kenobit: 'Kenobit',
  'anthony-zacharzewski': 'Anthony Zacharzewski',
  'simon-horton': 'Simon Horton',
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
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

async function main() {
  const apply = !process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  const { docs: topics } = await payload.find({ collection: 'topics', depth: 0, limit: 100 })
  const topicIdByName = new Map(topics.map((topic) => [topic.name, topic.id]))
  const { docs: episodes } = await payload.find({ collection: 'episodes', depth: 0, limit: 1000 })

  let guestsCreated = 0
  let guestsLinked = 0
  let topicsAssigned = 0

  for (const episode of episodes) {
    const existingGuests = (episode.guests || []).map((g) => (typeof g === 'object' ? g.id : g))
    const existingTopics = (episode.topics || []).map((t) => (typeof t === 'object' ? t.id : t))
    const data: Record<string, unknown> = {}

    // --- guests -------------------------------------------------------------
    if (existingGuests.length === 0) {
      const entry = Object.entries(missingGuests).find(([prefix]) => episode.slug.startsWith(prefix))
      if (entry) {
        const [, name] = entry
        const guestSlug = slugify(name)
        const found = await payload.find({ collection: 'guests', depth: 0, limit: 1, where: { slug: { equals: guestSlug } } })
        let guest = found.docs[0]
        if (!guest) {
          guest = await payload.create({
            collection: 'guests',
            data: {
              name,
              slug: guestSlug,
              summary: (episode.excerpt || '').slice(0, 300) || `${name} joined the Democracy Innovators Podcast.`,
              conversationSummary: stripHTML(episode.html || '').slice(0, 600),
              episodes: [episode.id],
              _status: 'published',
            },
            overrideAccess: true,
          })
          guestsCreated += 1
        }
        data.guests = [guest.id]
        guestsLinked += 1
      }
    }

    // --- topics -------------------------------------------------------------
    if (existingTopics.length === 0) {
      const haystack = `${episode.title} ${episode.excerpt || ''} ${(episode.transcriptText || '').slice(0, 4000)}`
      const matched = topicRules
        .filter(([, pattern]) => pattern.test(haystack))
        .map(([name]) => topicIdByName.get(name))
        .filter((id): id is number => typeof id === 'number')
        .slice(0, 3)
      if (matched.length) {
        data.topics = matched
        topicsAssigned += 1
      }
    }

    if (Object.keys(data).length && apply) {
      await payload.update({ collection: 'episodes', id: episode.id, data, overrideAccess: true })
    }
    if (Object.keys(data).length) {
      payload.logger.info(
        `${apply ? '✓' : '(dry)'} ${episode.slug.slice(0, 50)} — ${Object.keys(data).join(', ')}`,
      )
    }
  }

  payload.logger.info(
    `\nBackfill ${apply ? 'complete' : '(dry run)'}: ${guestsCreated} guests created, ${guestsLinked} episodes linked to a guest, ${topicsAssigned} episodes given topics.`,
  )
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
