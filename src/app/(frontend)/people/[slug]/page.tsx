import { getGuest, getGuests } from '@/lib/content'
import { getServerSideURL } from '@/lib/getURL'
import { breadcrumbJsonLd } from '@/lib/seo'
import { EpisodeRow } from '@/components/EpisodeRow'
import type { Episode } from '@/payload-types'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const revalidate = 3600

export async function generateStaticParams() {
  const { docs } = await getGuests()
  return docs.map((guest) => ({ slug: guest.slug }))
}

// This page is a record of participation, not a biography: it answers "which
// conversations was this person part of", so it carries no profile prose.
function participationLine(count: number, name: string) {
  return count === 1
    ? `One Democracy Innovators Podcast conversation with ${name}.`
    : `${count} Democracy Innovators Podcast conversations with ${name}.`
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const guest = await getGuest((await params).slug)
  if (!guest) return { robots: { index: false, follow: false } }
  const count = (guest.episodes || []).filter((episode) => typeof episode === 'object').length
  const description = participationLine(count, guest.name)
  return {
    title: guest.name,
    description,
    alternates: { canonical: `/people/${guest.slug}` },
    openGraph: {
      type: 'profile',
      title: guest.name,
      description,
      url: `/people/${guest.slug}`,
      images: guest.portraitUrl ? [{ url: guest.portraitUrl, alt: `Portrait of ${guest.name}` }] : undefined,
    },
    twitter: guest.portraitUrl ? { images: [guest.portraitUrl] } : undefined,
  }
}

export default async function GuestPage({ params }: { params: Promise<{ slug: string }> }) {
  const guest = await getGuest((await params).slug)
  if (!guest) notFound()
  const episodes = (guest.episodes || [])
    .filter((episode): episode is Episode => typeof episode === 'object')
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
  const topics = (guest.topics || []).filter((topic) => typeof topic === 'object')
  const origin = getServerSideURL()
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      url: `${origin}/people/${guest.slug}`,
      dateModified: guest.updatedAt,
      mainEntity: {
        '@type': 'Person',
        name: guest.name,
        url: `${origin}/people/${guest.slug}`,
        image: guest.portraitUrl || undefined,
        ...(topics.length ? { knowsAbout: topics.map((topic) => topic.name) } : {}),
        sameAs: guest.officialLinks?.map((link) => link.url) || [],
        ...(episodes.length
          ? {
              subjectOf: episodes.map((episode) => ({
                '@type': 'PodcastEpisode',
                name: episode.title,
                url: `${origin}/episode/${episode.slug}`,
              })),
            }
          : {}),
      },
    },
    breadcrumbJsonLd([
      { name: 'Home', url: origin },
      { name: 'People', url: `${origin}/people` },
      { name: guest.name, url: `${origin}/people/${guest.slug}` },
    ]),
  ]

  return (
    <main className="profile-page">
      <script dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} type="application/ld+json" />
      <Link className="back-link" href="/people">← People directory</Link>

      <header className="participation-hero">
        {guest.portraitUrl ? (
          <Image alt={`Portrait of ${guest.name}`} className="participation-portrait" src={guest.portraitUrl} width={400} height={400} priority sizes="140px" />
        ) : (
          <div className="participation-portrait participation-monogram">
            {guest.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
          </div>
        )}
        <div>
          <p className="section-label">
            {episodes.length === 1 ? 'One conversation' : `${episodes.length} conversations`}
          </p>
          <h1>{guest.name}</h1>
          {topics.length ? (
            <div className="entity-links">
              {topics.map((topic) => <Link href={`/topics/${topic.slug}`} key={topic.id}>{topic.name}</Link>)}
            </div>
          ) : null}
        </div>
      </header>

      {episodes.length ? (
        <section className="participation-episodes">
          <div className="episode-list">
            {episodes.map((episode, index) => (
              <EpisodeRow episode={episode} index={index} key={episode.id} />
            ))}
          </div>
        </section>
      ) : (
        <p className="participation-empty">No published conversations yet.</p>
      )}

      {guest.officialLinks?.length ? (
        <section className="participation-links">
          <p className="section-label">Links</p>
          <div className="entity-links">
            {guest.officialLinks.map((link) => (
              <a href={link.url} key={link.id || link.url} rel="noreferrer" target="_blank">{link.label} ↗</a>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
