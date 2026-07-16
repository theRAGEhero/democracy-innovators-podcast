import type { Metadata } from 'next'

import { ArchiveMap } from '@/components/ArchiveMap'
import { getMapPoints } from '@/lib/map-points'

export const metadata: Metadata = {
  title: 'Map',
  description: 'Explore Democracy Innovators Podcast episodes, people and projects by geographic context.',
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
          <p className="section-label">No map data yet</p>
          <h2>Import the researched geography dataset to populate this map.</h2>
          <p>Run <code>npm run map:import -- /path/to/dataset.xlsx</code> after the local database is configured.</p>
        </section>
      )}
    </main>
  )
}
