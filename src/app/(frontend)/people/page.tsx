import { getGuests } from '@/lib/content'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'People',
  description: 'Meet the researchers, practitioners and builders interviewed by Democracy Innovators Podcast.',
}

export const revalidate = 3600

export default async function PeoplePage() {
  const { docs: guests } = await getGuests()
  return (
    <main className="inner-page">
      <header className="page-intro people-intro">
        <p className="section-label">People · {guests.length} profiles</p>
        <h1>The civic archive</h1>
        <p>Researchers, public innovators and builders sharing practical knowledge about democratic change.</p>
      </header>
      <div className="directory-grid">
        {guests.map((guest, index) => (
          <Link className="directory-person" href={`/people/${guest.slug}`} key={guest.id}>
            <span className="directory-number">{String(index + 1).padStart(2, '0')}</span>
            {guest.portraitUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" loading="lazy" src={guest.portraitUrl} />
            ) : <span className="directory-portrait">{guest.name.slice(0, 1)}</span>}
            <h2>{guest.name}</h2>
            <p>{guest.summary}</p>
            <span className="text-link">View profile →</span>
          </Link>
        ))}
      </div>
    </main>
  )
}
