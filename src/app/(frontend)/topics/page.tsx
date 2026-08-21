import { getTopics } from '@/lib/content'
import { getServerSideURL } from '@/lib/getURL'
import { collectionJsonLd } from '@/lib/seo'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Topics', description: 'Themes explored across the Democracy Innovators archive.', alternates: { canonical: '/topics' } }

export default async function TopicsPage() {
  const { docs: topics } = await getTopics()
  const origin = getServerSideURL()
  const jsonLd = collectionJsonLd({ url: `${origin}/topics`, name: 'Topics', items: topics.map((topic) => ({ name: topic.name, url: `${origin}/topics/${topic.slug}` })) })
  return <main className="inner-page"><script dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} type="application/ld+json" /><header className="page-intro"><p className="section-label">Knowledge index</p><h1>Topics</h1><p>Recurring questions, methods and technologies across the archive.</p></header><div className="topics-grid">{topics.map((topic) => <Link href={`/topics/${topic.slug}`} key={topic.id}><span>{topic.name}</span><span>Explore →</span></Link>)}</div></main>
}
