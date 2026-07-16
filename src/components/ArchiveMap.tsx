'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import type { MapPoint } from '@/payload-types'
import { projectPoint } from '@/lib/map-coordinates'

type Filter = 'all' | 'project' | 'person'

function markerPosition(point: MapPoint, index: number) {
  const position = projectPoint(point.longitude, point.latitude)
  const offset = ((index % 5) - 2) * 0.45
  return { x: position.x + offset, y: position.y + offset }
}

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
        <svg aria-hidden="true" className="world-plot" preserveAspectRatio="xMidYMid meet" viewBox="0 0 100 50">
          <rect className="map-ocean" height="50" width="100" />
          <path className="map-land" d="M13 16c6-5 17-6 25-2 5 3 6 8 2 11-5 4-17 5-24 2-6-3-8-8-3-11ZM45 12c10-4 24-3 33 2 8 4 9 10 3 14-8 5-24 5-34 0-8-4-9-12-2-16ZM46 29c6-2 13 0 16 4 3 5-1 10-8 11-6 0-11-3-12-8-1-3 1-6 4-7ZM72 34c5-3 13-2 16 1 4 4 1 8-5 9-6 1-12-1-14-5-1-2 0-4 3-5Z" />
          {[20, 40, 60, 80].map((x) => <line className="map-gridline" key={`x-${x}`} x1={x} x2={x} y1="0" y2="50" />)}
          {[12.5, 25, 37.5].map((y) => <line className="map-gridline" key={`y-${y}`} x1="0" x2="100" y1={y} y2={y} />)}
          {visible.map((point, index) => {
            const { x, y } = markerPosition(point, index)
            return <circle className={`map-marker ${point.kind}`} cx={x} cy={y} key={point.id} r={point.confidence === 'High' ? 0.72 : 0.52} />
          })}
        </svg>
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
