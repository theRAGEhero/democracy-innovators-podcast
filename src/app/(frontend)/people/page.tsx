import { getGuests } from '@/lib/content'
import { getServerSideURL } from '@/lib/getURL'
import { collectionJsonLd } from '@/lib/seo'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'People',
  description: 'Meet the researchers, practitioners and builders interviewed by Democracy Innovators Podcast.',
  alternates: { canonical: '/people' },
}

export const revalidate = 3600

const episodeCount = (guest: { episodes?: unknown }) =>
  (Array.isArray(guest.episodes) ? guest.episodes : []).length

export default async function PeoplePage() {
  const { docs: guests } = await getGuests()
  const origin = getServerSideURL()
  const jsonLd = collectionJsonLd({
    url: `${origin}/people`,
    name: 'People',
    items: guests.map((guest) => ({ name: guest.name, url: `${origin}/people/${guest.slug}` })),
  })
  return (
    <main className="inner-page">
      <script dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} type="application/ld+json" />
      <header className="page-intro people-intro">
        <p className="section-label">People · {guests.length} profiles</p>
        <h1>The civic archive</h1>
        <p>Researchers, public innovators and builders sharing practical knowledge about democratic change. Each entry lists the conversations they took part in.</p>
      </header>
      <div className="directory-grid">
        {guests.map((guest, index) => (
          <Link className="directory-person" href={`/people/${guest.slug}`} key={guest.id}>
            <span className="directory-number">{String(index + 1).padStart(2, '0')}</span>
            {guest.portraitUrl ? (
              <Image alt={`Portrait of ${guest.name}`} src={guest.portraitUrl} width={600} height={600} loading="lazy" sizes="(max-width: 620px) 45vw, 280px" />
            ) : <span className="directory-portrait">{guest.name.slice(0, 1)}</span>}
            <h2>{guest.name}</h2>
            <p className="directory-count">
              {episodeCount(guest)} {episodeCount(guest) === 1 ? 'conversation' : 'conversations'}
            </p>
            <span className="text-link">See conversations →</span>
          </Link>
        ))}
      </div>
    </main>
  )
}
