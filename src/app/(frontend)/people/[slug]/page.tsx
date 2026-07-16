import { getGuest, getGuests } from '@/lib/content'
import { getServerSideURL } from '@/lib/getURL'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const revalidate = 3600

export async function generateStaticParams() {
  const { docs } = await getGuests()
  return docs.map((guest) => ({ slug: guest.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const guest = await getGuest((await params).slug)
  if (!guest) return {}
  return {
    title: guest.name,
    description: guest.summary || undefined,
    alternates: { canonical: `/people/${guest.slug}` },
  }
}

export default async function GuestPage({ params }: { params: Promise<{ slug: string }> }) {
  const guest = await getGuest((await params).slug)
  if (!guest) notFound()
  const episodes = (guest.episodes || []).filter((episode) => typeof episode === 'object')
  const topics = (guest.topics || []).filter((topic) => typeof topic === 'object')
  const sources = (guest.sources || []).filter((source) => typeof source === 'object')
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: `${getServerSideURL()}/people/${guest.slug}`,
    dateModified: guest.updatedAt,
    mainEntity: {
      '@type': 'Person',
      name: guest.name,
      description: guest.summary,
      image: guest.portraitUrl || undefined,
      sameAs: guest.officialLinks?.map((link) => link.url) || [],
    },
  }

  return (
    <main className="profile-page">
      <script dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} type="application/ld+json" />
      <Link className="back-link" href="/people">← People directory</Link>
      <header className="profile-hero">
        <div className="profile-identity">
          <p className="section-label">Guest profile</p>
          <h1>{guest.name}</h1>
          {guest.role ? <p className="profile-role">{guest.role}</p> : null}
          <p className="profile-summary">{guest.summary}</p>
        </div>
        {guest.portraitUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={`Portrait of ${guest.name}`} className="profile-portrait" src={guest.portraitUrl} />
        ) : <div className="profile-monogram">{guest.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>}
      </header>

      <div className="profile-grid">
        <section>
          <p className="section-label">From the conversation</p>
          <h2>Ideas discussed</h2>
          <p>{guest.conversationSummary}</p>
          <p className="source-note">This section is derived from the podcast transcript and may reflect automatic transcription errors.</p>
        </section>
        <aside>
          {topics.length ? <div><p className="section-label">Topics</p>{topics.map((topic) => <Link href={`/topics/${topic.slug}`} key={topic.id}>{topic.name}</Link>)}</div> : null}
          {guest.officialLinks?.length ? <div><p className="section-label">Official links</p>{guest.officialLinks.map((link) => <a href={link.url} key={link.id || link.url} rel="noreferrer" target="_blank">{link.label} ↗</a>)}</div> : null}
        </aside>
      </div>

      {episodes.length ? <section className="profile-episodes"><p className="section-label">Conversations</p><h2>On the podcast</h2>{episodes.map((episode) => <Link href={`/episode/${episode.slug}`} key={episode.id}>{episode.title}<span>→</span></Link>)}</section> : null}
      {sources.length ? <section className="profile-sources"><p className="section-label">Verified sources</p>{sources.map((source) => <a href={source.url} key={source.id} rel="noreferrer" target="_blank">{source.publisher || source.title}: {source.title}</a>)}</section> : null}
    </main>
  )
}
