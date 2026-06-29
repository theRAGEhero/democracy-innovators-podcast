import { EpisodeRow } from '@/components/EpisodeRow'
import { MobilePlatformBar } from '@/components/MobilePlatformBar'
import { getEpisodes, getGuests } from '@/lib/content'
import Link from 'next/link'

export const revalidate = 3600

export default async function HomePage() {
  const [{ docs: episodes }, { docs: guests }] = await Promise.all([getEpisodes(7), getGuests(6)])
  const featured = episodes[0]

  return (
    <main className="home-page">
      <section className="home-hero">
        <p className="section-label">Podcast · Living civic archive</p>
        <h1>Conversations with people redesigning democracy.</h1>
        <p className="hero-deck">
          An independent record of the tools, institutions and practical experiments changing how
          collective decisions are made.
        </p>
        <div className="hero-actions">
          <Link className="primary-button" href={featured ? `/episode/${featured.slug}` : '/episodes'}>
            Listen to the latest
          </Link>
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
            <Link className="text-link" href={`/episode/${featured.slug}`}>
              Read and listen <span aria-hidden="true">→</span>
            </Link>
          </div>
          {featured.featureImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="feature-image" src={featured.featureImageUrl} />
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
      <MobilePlatformBar />
    </main>
  )
}
