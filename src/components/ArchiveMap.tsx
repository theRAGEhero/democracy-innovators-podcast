'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'

import type { MapPoint } from '@/payload-types'

// Leaflet touches `window`, so load the map client-side only.
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div className="leaflet-map leaflet-map-loading">Loading map…</div>,
})

type Filter = 'all' | 'project' | 'person'

export function ArchiveMap({ points }: { points: MapPoint[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const visible = useMemo(() => points.filter((point) => filter === 'all' || point.kind === filter), [filter, points])
  const highConfidence = visible.filter((point) => point.confidence === 'High').length

  return (
    <section className="map-explorer" aria-label="Archive geography map">
      <div className="map-toolbar">
        <div>
          <p className="section-label">Geographic context</p>
          <h2>{visible.length} mapped archive points</h2>
          <p>{highConfidence} high-confidence points. Locations describe public affiliation, project geography or organization context, not always nationality.</p>
        </div>
        <div className="map-filters" aria-label="Map filters">
          {(['all', 'project', 'person'] as const).map((value) => (
            <button aria-pressed={filter === value} key={value} onClick={() => setFilter(value)} type="button">
              {value === 'all' ? 'All' : value === 'person' ? 'People' : 'Projects'}
            </button>
          ))}
        </div>
      </div>

      <div className="map-board">
        <LeafletMap points={visible} />
      </div>

      <div className="map-results">
        {visible.map((point) => (
          <article className="map-result" key={point.id}>
            <div>
              <p className="meta-line">{point.kind} · {point.confidence} confidence</p>
              <h3>{point.title}</h3>
              <p>{point.cityOrPlace || point.country}</p>
            </div>
            <div>
              {point.episode && typeof point.episode === 'object' ? <Link href={`/episode/${point.episode.slug}`}>{point.episodeNo || 'Episode'} →</Link> : point.episodeTitle ? <span>{point.episodeNo || 'Episode'} · {point.episodeTitle}</span> : null}
              {point.project && typeof point.project === 'object' ? <span>{point.project.name}</span> : null}
              {point.timeLabel ? <span>{point.timeLabel}</span> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
