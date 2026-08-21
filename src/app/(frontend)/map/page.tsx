import type { Metadata } from 'next'
import Link from 'next/link'

import { ArchiveMap } from '@/components/ArchiveMap'
import { getMapPoints } from '@/lib/map-points'

export const metadata: Metadata = {
  title: 'Map',
  description: 'Explore Democracy Innovators Podcast episodes, people and projects by geographic context.',
  alternates: { canonical: '/map' },
}

export const revalidate = 3600

export default async function MapPage() {
  const { docs: points } = await getMapPoints()

  return (
    <main className="inner-page map-page">
      <header className="page-intro">
        <p className="section-label">Archive map</p>
        <h1>Where democratic innovation appears.</h1>
        <p>Projects, people and conversations mapped by public affiliation, project location or verified geographic context.</p>
      </header>
      {points.length ? <ArchiveMap points={points} /> : (
        <section className="empty-map-state">
          <p className="section-label">Map unavailable</p>
          <h2>The map couldn’t be loaded right now.</h2>
          <p>
            Please try again shortly. In the meantime you can browse the archive by{' '}
            <Link href="/topics">topic</Link> or <Link href="/people">guest</Link>.
          </p>
        </section>
      )}
    </main>
  )
}
