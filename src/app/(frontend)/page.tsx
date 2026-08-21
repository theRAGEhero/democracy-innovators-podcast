import { EpisodeRow } from '@/components/EpisodeRow'
import { MobilePlatformBar } from '@/components/MobilePlatformBar'
import { getEpisodes, getGuests } from '@/lib/content'
import { getServerSideURL } from '@/lib/getURL'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { PlayEpisodeButton } from '@/components/PlayEpisodeButton'
import { normalizeChapters } from '@/lib/chapters'
import { extractCastopodEpisodeUrl } from '@/lib/embeds'

export const revalidate = 3600

export const metadata: Metadata = { alternates: { canonical: '/' } }

export default async function HomePage() {
  const [{ docs: episodes }, { docs: guests }] = await Promise.all([getEpisodes(7), getGuests(6)])
  const featured = episodes[0]
  const origin = getServerSideURL()
  const siteJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: origin,
        name: 'Democracy Innovators Podcast',
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${origin}/search?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: 'Democracy Innovators',
        url: origin,
        logo: { '@type': 'ImageObject', url: `${origin}/logo.png` },
        description: 'Independent conversations about democracy, governance and civic technology.',
        founder: [
          { '@type': 'Person', name: 'Alessandro Oppo' },
          { '@type': 'Person', name: 'Carlo Michaelis' },
        ],
        sameAs: [
          'https://open.spotify.com/show/7e1DjGuFaHZlgDc6e7xmnr',
          'https://www.youtube.com/@DemocracyInnovatorsPodcast',
          'https://podcast.democracyinnovators.com/@podcast',
        ],
      },
      {
        '@type': 'PodcastSeries',
        '@id': `${origin}/#podcast`,
        name: 'Democracy Innovators Podcast',
        url: origin,
        description: 'Independent conversations about democracy, governance and civic technology.',
        image: `${origin}/logo.png`,
        inLanguage: 'en',
        webFeed: 'https://podcast.democracyinnovators.com/@podcast/feed.xml',
        publisher: { '@id': `${origin}/#organization` },
        sameAs: [
          'https://open.spotify.com/show/7e1DjGuFaHZlgDc6e7xmnr',
          'https://www.youtube.com/@DemocracyInnovatorsPodcast',
          'https://podcast.democracyinnovators.com/@podcast',
        ],
      },
    ],
  }

  return (
    <main className="home-page">
      <script dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }} type="application/ld+json" />
      <section className="home-hero">
        <p className="section-label">Podcast · Living civic archive</p>
        <h1>Conversations with people redesigning democracy.</h1>
        <p className="hero-deck">
          An independent record of the tools, institutions and practical experiments changing how
          collective decisions are made.
        </p>
        <div className="hero-actions">
          {featured?.audioUrl ? <PlayEpisodeButton className="primary-button" label="Play the latest" episode={{ id: featured.id, slug: featured.slug, title: featured.title, audioUrl: featured.audioUrl, coverUrl: featured.squareCoverUrl || featured.featureImageUrl, castopodUrl: extractCastopodEpisodeUrl(featured.html), chapters: normalizeChapters(featured.chapters) }} /> : <Link className="primary-button" href={featured ? `/episode/${featured.slug}` : '/episodes'}>Listen to the latest</Link>}
          <Link className="text-link" href="/people">
            Explore the people <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {featured ? (
        <section className="featured-story">
          <div className="feature-copy">
            <p className="section-label">Latest conversation</p>
            <h2>
              <Link href={`/episode/${featured.slug}`}>{featured.title}</Link>
            </h2>
            <p>{featured.excerpt}</p>
            <div className="feature-actions">
              {featured.audioUrl ? <PlayEpisodeButton episode={{ id: featured.id, slug: featured.slug, title: featured.title, audioUrl: featured.audioUrl, coverUrl: featured.squareCoverUrl || featured.featureImageUrl, castopodUrl: extractCastopodEpisodeUrl(featured.html), chapters: normalizeChapters(featured.chapters) }} label="Play" /> : null}
              <Link className="text-link" href={`/episode/${featured.slug}`}>Read and listen <span aria-hidden="true">→</span></Link>
            </div>
          </div>
          {featured.featureImageUrl ? (
            <Image alt={`${featured.title} cover art`} className="feature-image" src={featured.featureImageUrl} width={1200} height={800} priority sizes="(max-width: 900px) 100vw, 600px" />
          ) : null}
        </section>
      ) : null}

      <section className="archive-section">
        <div className="section-heading">
          <div>
            <p className="section-label">Recent episodes</p>
            <h2>From the archive</h2>
          </div>
          <Link className="text-link" href="/episodes">All episodes →</Link>
        </div>
        <div className="episode-list">
          {episodes.slice(1).map((episode, index) => (
            <EpisodeRow episode={episode} index={index} key={episode.id} />
          ))}
        </div>
      </section>

      <section className="people-preview">
        <div className="section-heading">
          <div>
            <p className="section-label">People</p>
            <h2>A growing index of democratic innovators</h2>
          </div>
          <Link className="text-link" href="/people">Open the directory →</Link>
        </div>
        <div className="people-grid">
          {guests.map((guest) => (
            <Link className="person-card" href={`/people/${guest.slug}`} key={guest.id}>
              <span className="person-initials" aria-hidden="true">
                {guest.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </span>
              <strong>{guest.name}</strong>
              <span>{guest.role || 'Podcast guest'}</span>
            </Link>
          ))}
        </div>
      </section>
      <MobilePlatformBar latest={featured?.audioUrl ? { id: featured.id, slug: featured.slug, title: featured.title, audioUrl: featured.audioUrl, coverUrl: featured.squareCoverUrl || featured.featureImageUrl, castopodUrl: extractCastopodEpisodeUrl(featured.html), chapters: normalizeChapters(featured.chapters) } : null} />
    </main>
  )
}
