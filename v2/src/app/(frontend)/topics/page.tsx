import { getTopics } from '@/lib/content'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Topics', description: 'Themes explored across the Democracy Innovators archive.' }

export default async function TopicsPage() {
  const { docs: topics } = await getTopics()
  return <main className="inner-page"><header className="page-intro"><p className="section-label">Knowledge index</p><h1>Topics</h1><p>Recurring questions, methods and technologies across the archive.</p></header><div className="topics-grid">{topics.map((topic) => <Link href={`/topics/${topic.slug}`} key={topic.id}><span>{topic.name}</span><span>Explore →</span></Link>)}</div></main>
}
