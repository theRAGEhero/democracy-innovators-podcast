import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import 'dotenv/config'
import config from '@payload-config'
import { getPayload } from 'payload'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const legacyRoot = path.resolve(dirname, '../..')
const episodesFile = path.join(legacyRoot, 'public/data/episodes.json')
const commentsFile = path.join(legacyRoot, 'data/comments.json')

type LegacyEpisode = {
  id?: string | number
  slug: string
  title: string
  publishedAt?: string
  featureImage?: string | null
  excerpt?: string
  html?: string
}

const guestRules: Array<[string, string[]]> = [
  ['stefaan-verhulst', ['Stefaan Verhulst']],
  ['yuting-jiang', ['Yuting Jiang']],
  ['helene', ['Helene Landemore']],
  ['nathan-schneider', ['Nathan Schneider']],
  ['massimo-bugani', ['Massimo Bugani']],
  ['matt-stempeck', ['Matt Stempeck']],
  ['samuel-vance-law', ['Samuel Vance-Law']],
  ['simone-maria-parazzoli', ['Simone Maria Parazzoli']],
  ['marco-cappato-francesco-vecchi', ['Marco Cappato', 'Francesco Vecchi']],
  ['vir-sanghavi', ['Vir Sanghavi']],
  ['bruce-schneier', ['Bruce Schneier']],
  ['tiago-peixoto', ['Tiago Peixoto']],
  ['jonathan-moskovic', ['Jonathan Moskovic']],
  ['carol-romero-andres-pereira', ['Carol Romero', 'Andres Pereira de Lucena']],
  ['alex-blaga', ['Alex Blaga']],
  ['sonia-bussu', ['Sonia Bussu']],
  ['graham-wetherall', ['Graham Wetherall-Grujic']],
  ['richard-bartlett', ['Richard Bartlett']],
  ['martin-carcasson', ['Martin Carcasson']],
  ['tomas-rakos', ['Tomas Rakos']],
  ['margo-loor', ['Margo Loor']],
  ['daniel-mackisack', ['Daniel Mackisack']],
  ['guido-saracco', ['Guido Saracco']],
  ['andrew-gray', ['Andrew Gray']],
  ['magnus-strobel', ['Magnus Strobel']],
  ['robert-bjarnason', ['Robert Bjarnason']],
  ['evelien-nieuwenburg', ['Evelien Nieuwenburg']],
  ['guillaume-saunier-lucien-langton', ['Guillaume Saunier', 'Lucien Langton']],
  ['gianluca-sgueo', ['Gianluca Sgueo']],
  ['stephen-boucher', ['Stephen Boucher']],
  ['michihito-matsuda', ['Michihito Matsuda']],
  ['oliver-klingefjord', ['Oliver Klingefjord']],
  ['gareth-farry', ['Gareth Farry']],
  ['tate-berenbaum', ['Tate Berenbaum']],
  ['bjorn-bedsted', ['Bjorn Bedsted']],
  ['josef-lentsch', ['Josef Lentsch']],
  ['lukas-salecker', ['Lukas Salecker']],
  ['geert-lovink', ['Geert Lovink']],
  ['marcin-wozniak', ['Marcin Wozniak']],
  ['0harmonica', ['Artem Zhiganov']],
  ['valentin-chaput', ['Valentin Chaput']],
]

const topicRules: Array<[string, RegExp]> = [
  ['Artificial intelligence', /\bAI\b|algorithm|agentic|generative/i],
  ['Civic technology', /civic tech|digital tool|platform|open source/i],
  ['Deliberative democracy', /deliberat|citizens.? assembl|public deliberation/i],
  ['Participation', /participat|collective decision|citizen engagement/i],
  ['Governance', /governance|government|public sector|institution/i],
  ['Digital democracy', /digital democracy|e-voting|online communit|internet/i],
  ['Trust and security', /trust|security|cryptograph|misinformation|toxic/i],
]

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
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

function guestNamesFor(slug: string) {
  return guestRules.find(([fragment]) => slug.includes(fragment))?.[1] ?? []
}

async function upsert(
  payload: Awaited<ReturnType<typeof getPayload>>,
  collection: 'episodes' | 'guests' | 'topics',
  slug: string,
  data: Record<string, unknown>,
) {
  const existing = await payload.find({ collection, limit: 1, where: { slug: { equals: slug } } })
  if (existing.docs[0]) {
    return payload.update({ collection, id: existing.docs[0].id, data: data as never })
  }
  return payload.create({ collection, data: data as never })
}

async function main() {
  const payload = await getPayload({ config })
  const dataset = JSON.parse(fs.readFileSync(episodesFile, 'utf8')) as { episodes: LegacyEpisode[] }

  const topicIds = new Map<string, number>()
  for (const [name] of topicRules) {
    const topic = await upsert(payload, 'topics', slugify(name), { name, slug: slugify(name) })
    topicIds.set(name, Number(topic.id))
  }

  const guestIds = new Map<string, number>()
  for (const episode of dataset.episodes) {
    const conversation = stripHTML(episode.html).slice(0, 900)
    for (const name of guestNamesFor(episode.slug)) {
      const slug = slugify(name)
      const guest = await upsert(payload, 'guests', slug, {
        name,
        slug,
        summary: `${name} joined Democracy Innovators Podcast for a conversation about ${episode.title
          .replace(new RegExp(`^${name}\\s+(about|on)\\s+`, 'i'), '')
          .replace(/^[^:]+:\s*/, '')}.`,
        conversationSummary: conversation,
        portraitUrl: episode.featureImage || undefined,
        _status: 'published',
      })
      guestIds.set(name, Number(guest.id))
    }
  }

  const episodeIds = new Map<string, number>()
  for (const episode of dataset.episodes) {
    const searchable = `${episode.title} ${episode.excerpt || ''}`
    const topics = topicRules.filter(([, pattern]) => pattern.test(searchable)).map(([name]) => topicIds.get(name)!)
    const guests = guestNamesFor(episode.slug).map((name) => guestIds.get(name)!).filter(Boolean)
    const doc = await upsert(payload, 'episodes', episode.slug, {
      title: episode.title,
      slug: episode.slug,
      legacyId: String(episode.id || ''),
      publishedAt: episode.publishedAt || new Date().toISOString(),
      excerpt: episode.excerpt || '',
      featureImageUrl: episode.featureImage || undefined,
      html: episode.html || '',
      transcriptText: stripHTML(episode.html),
      guests,
      topics,
      _status: 'published',
    })
    episodeIds.set(episode.slug, Number(doc.id))
  }

  for (const [name, guestId] of guestIds) {
    const episodes = dataset.episodes
      .filter((episode) => guestNamesFor(episode.slug).includes(name))
      .map((episode) => episodeIds.get(episode.slug)!)
    await payload.update({ collection: 'guests', id: guestId, data: { episodes } })
  }

  if (fs.existsSync(commentsFile)) {
    const store = JSON.parse(fs.readFileSync(commentsFile, 'utf8')) as {
      comments?: Array<{ id: string; slug: string; name: string; message: string; status?: string }>
    }
    for (const comment of store.comments || []) {
      const episode = episodeIds.get(comment.slug)
      if (!episode) continue
      const duplicate = await payload.find({
        collection: 'comments',
        limit: 1,
        where: { and: [{ episode: { equals: episode } }, { message: { equals: comment.message } }] },
      })
      if (!duplicate.docs.length) {
        await payload.create({
          collection: 'comments',
          data: {
            episode,
            name: comment.name,
            message: comment.message,
            status: comment.status === 'approved' ? 'approved' : 'pending',
          },
        })
      }
    }
  }

  payload.logger.info(`Imported ${episodeIds.size} episodes and ${guestIds.size} guest profiles.`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
