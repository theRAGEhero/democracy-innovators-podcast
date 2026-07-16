import { getEpisode, getEpisodes } from '@/lib/content'
import { Comments } from '@/components/Comments'
import { MobileEpisodeBar } from '@/components/MobileEpisodeBar'
import { getServerSideURL } from '@/lib/getURL'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const revalidate = 3600

export async function generateStaticParams() {
  const { docs } = await getEpisodes()
  return docs.map((episode) => ({ slug: episode.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const episode = await getEpisode((await params).slug)
  if (!episode) return {}
  return {
    title: episode.title,
    description: episode.excerpt || undefined,
    alternates: { canonical: `/episode/${episode.slug}` },
    openGraph: {
      images: episode.featureImageUrl ? [episode.featureImageUrl] : undefined,
      type: 'article',
    },
  }
}

export default async function EpisodePage({ params }: { params: Promise<{ slug: string }> }) {
  const episode = await getEpisode((await params).slug)
  if (!episode) notFound()

  const guests = (episode.guests || []).filter((guest) => typeof guest === 'object')
  const topics = (episode.topics || []).filter((topic) => typeof topic === 'object')
  const organizations = (episode.organizations || []).filter((organization) => typeof organization === 'object')
  const projects = (episode.projects || []).filter((project) => typeof project === 'object')
  const usefulLinks = [
    ...guests.flatMap((guest) => guest.officialLinks?.map((link) => ({ label: link.label || guest.name, url: link.url })) || []),
    ...organizations.filter((organization) => organization.website).map((organization) => ({ label: organization.name, url: organization.website! })),
    ...projects.filter((project) => project.website).map((project) => ({ label: project.name, url: project.website! })),
  ].filter((link, index, links) => links.findIndex((item) => item.url === link.url) === index)
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'PodcastEpisode',
    name: episode.title,
    description: episode.excerpt,
    datePublished: episode.publishedAt,
    url: `${getServerSideURL()}/episode/${episode.slug}`,
    image: episode.featureImageUrl || undefined,
    partOfSeries: {
      '@type': 'PodcastSeries',
      name: 'Democracy Innovators Podcast',
      url: getServerSideURL(),
    },
  }

  return (
    <main className="episode-page">
      <script dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} type="application/ld+json" />
      <Link className="back-link" href="/episodes">← All episodes</Link>
      <header className="episode-hero">
        <div className="episode-heading">
          <p className="section-label">Podcast conversation</p>
          <h1>{episode.title}</h1>
          <p className="episode-deck">{episode.excerpt}</p>
          {guests.length ? (
            <div className="entity-links">
              {guests.map((guest) => (
                <Link href={`/people/${guest.slug}`} key={guest.id}>{guest.name}</Link>
              ))}
            </div>
          ) : null}
        </div>
        {episode.featureImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="episode-cover" src={episode.featureImageUrl} />
        ) : null}
      </header>

      {topics.length ? (
        <aside className="topic-strip" aria-label="Episode topics">
          <span>Filed under</span>
          {topics.map((topic) => <Link href={`/topics/${topic.slug}`} key={topic.id}>{topic.name}</Link>)}
        </aside>
      ) : null}

      <section className="transcript-layout">
        <aside className="transcript-aside">
          <p className="section-label">Transcript</p>
          <p>Automatically transcribed and lightly formatted. It may contain errors.</p>
          <p>Use “Ask the archive” to explore this conversation with cited answers.</p>
          {usefulLinks.length ? (
            <div className="useful-links">
              <p className="section-label">Useful links</p>
              {usefulLinks.map((link) => (
                <a href={link.url} key={link.url} rel="noreferrer" target="_blank">{link.label} ↗</a>
              ))}
            </div>
          ) : null}
        </aside>
        <article className="episode-content" dangerouslySetInnerHTML={{ __html: episode.html || '' }} id="episode-player" />
      </section>
      <Comments episodeId={episode.id} />
      <MobileEpisodeBar title={episode.title} url={`${getServerSideURL()}/episode/${episode.slug}`} />
    </main>
  )
}
