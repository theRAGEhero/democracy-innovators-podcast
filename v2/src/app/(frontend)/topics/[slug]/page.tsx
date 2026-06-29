import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

export const revalidate = 3600

async function getTopic(slug: string) {
  const payload = await getPayload({ config })
  const topics = await payload.find({ collection: 'topics', limit: 1, where: { slug: { equals: slug } } })
  if (!topics.docs[0]) return null
  const episodes = await payload.find({ collection: 'episodes', depth: 1, limit: 100, sort: '-publishedAt', where: { and: [{ topics: { contains: topics.docs[0].id } }, { _status: { equals: 'published' } }] } })
  return { topic: topics.docs[0], episodes: episodes.docs }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const result = await getTopic((await params).slug)
  return result ? { title: result.topic.name, description: result.topic.description || `Podcast conversations about ${result.topic.name}.` } : {}
}

export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const result = await getTopic((await params).slug)
  if (!result) notFound()
  return <main className="inner-page"><Link className="back-link" href="/topics">← All topics</Link><header className="page-intro"><p className="section-label">Topic dossier · {result.episodes.length} conversations</p><h1>{result.topic.name}</h1><p>{result.topic.description || `Explore interviews connected to ${result.topic.name.toLowerCase()} across the Democracy Innovators archive.`}</p></header><div className="profile-episodes">{result.episodes.map((episode) => <Link href={`/episode/${episode.slug}`} key={episode.id}>{episode.title}<span>→</span></Link>)}</div></main>
}
