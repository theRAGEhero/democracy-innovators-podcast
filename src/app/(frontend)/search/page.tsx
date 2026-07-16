import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'

export const metadata: Metadata = { title: 'Search', description: 'Search the Democracy Innovators archive.' }

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = (await searchParams).q?.trim() || ''
  const payload = await getPayload({ config })
  const [episodes, guests] = query ? await Promise.all([
    payload.find({ collection: 'episodes', limit: 30, where: { or: [{ title: { like: query } }, { excerpt: { like: query } }, { transcriptText: { like: query } }] } }),
    payload.find({ collection: 'guests', limit: 30, where: { or: [{ name: { like: query } }, { summary: { like: query } }, { conversationSummary: { like: query } }] } }),
  ]) : [{ docs: [] }, { docs: [] }]
  return <main className="inner-page"><header className="page-intro"><p className="section-label">Archive search</p><h1>Find an idea</h1><form action="/search" className="search-form"><label htmlFor="q">Search people, episodes and transcripts</label><div><input defaultValue={query} id="q" name="q" placeholder="Try deliberative AI" type="search"/><button type="submit">Search</button></div></form></header>{query ? <div className="search-results"><p className="section-label">Results for “{query}”</p>{guests.docs.map((guest) => <Link href={`/people/${guest.slug}`} key={`g-${guest.id}`}><span>Person</span><strong>{guest.name}</strong></Link>)}{episodes.docs.map((episode) => <Link href={`/episode/${episode.slug}`} key={`e-${episode.id}`}><span>Episode</span><strong>{episode.title}</strong></Link>)}</div> : null}</main>
}
