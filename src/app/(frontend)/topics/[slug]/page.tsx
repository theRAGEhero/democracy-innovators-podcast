import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { getServerSideURL } from '@/lib/getURL'
import { breadcrumbJsonLd, collectionJsonLd, metaDescription } from '@/lib/seo'

export const revalidate = 3600

async function getTopic(slug: string) {
  const payload = await getPayload({ config })
  const topics = await payload.find({ collection: 'topics', limit: 1, where: { slug: { equals: slug } } })
  if (!topics.docs[0]) return null
  const episodes = await payload.find({ collection: 'episodes', depth: 1, limit: 100, sort: '-publishedAt', where: { and: [{ topics: { contains: topics.docs[0].id } }, { _status: { equals: 'published' } }] } })
  return { topic: topics.docs[0], episodes: episodes.docs }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = (await params).slug
  const result = await getTopic(slug)
  if (!result) return { robots: { index: false, follow: false } }
  const description =
    metaDescription(result.topic.description) || `Podcast conversations about ${result.topic.name}.`
  return {
    title: result.topic.name,
    description,
    alternates: { canonical: `/topics/${slug}` },
    openGraph: {
      type: 'website',
      title: result.topic.name,
      description,
      url: `/topics/${slug}`,
    },
  }
}

export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const result = await getTopic((await params).slug)
  if (!result) notFound()
  const origin = getServerSideURL()
  const jsonLd = [
    breadcrumbJsonLd([
      { name: 'Home', url: origin },
      { name: 'Topics', url: `${origin}/topics` },
      { name: result.topic.name, url: `${origin}/topics/${result.topic.slug}` },
    ]),
    collectionJsonLd({
      url: `${origin}/topics/${result.topic.slug}`,
      name: result.topic.name,
      items: result.episodes.map((episode) => ({ name: episode.title, url: `${origin}/episode/${episode.slug}` })),
    }),
  ]
  return <main className="inner-page"><script dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} type="application/ld+json" /><Link className="back-link" href="/topics">← All topics</Link><header className="page-intro"><p className="section-label">Topic dossier · {result.episodes.length} conversations</p><h1>{result.topic.name}</h1><p>{result.topic.description || `Explore interviews connected to ${result.topic.name.toLowerCase()} across the Democracy Innovators archive.`}</p></header><div className="profile-episodes">{result.episodes.map((episode) => <Link href={`/episode/${episode.slug}`} key={episode.id}>{episode.title}<span>→</span></Link>)}</div></main>
}
