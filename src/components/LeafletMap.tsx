'use client'

import { useEffect, useRef } from 'react'
import type { Map as LeafletMapType } from 'leaflet'

import type { MapPoint } from '@/payload-types'

import 'leaflet/dist/leaflet.css'

const KIND_COLORS: Record<string, string> = {
  person: '#c45e3a',
  project: '#255a78',
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function popupHtml(point: MapPoint): string {
  const place = point.cityOrPlace || point.country || ''
  const meta = `${point.kind}${point.confidence ? ` · ${point.confidence} confidence` : ''}`
  const episodeLink =
    point.episode && typeof point.episode === 'object' && point.episode.slug
      ? `<a href="/episode/${escapeHtml(point.episode.slug)}">${escapeHtml(point.episodeNo || 'Episode')} →</a>`
      : point.episodeTitle
        ? `<span>${escapeHtml(point.episodeTitle)}</span>`
        : ''
  return `<div class="map-popup">
    <strong>${escapeHtml(point.title)}</strong>
    <span class="map-popup-meta">${escapeHtml(meta)}</span>
    ${place ? `<span>${escapeHtml(place)}</span>` : ''}
    ${episodeLink}
  </div>`
}

export default function LeafletMap({ points }: { points: MapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMapType | null>(null)

  useEffect(() => {
    let cancelled = false
    let markerLayer: import('leaflet').LayerGroup | null = null

    async function render() {
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current) return

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, { scrollWheelZoom: false }).setView([25, 10], 2)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 18,
        }).addTo(mapRef.current)
      }

      const map = mapRef.current
      markerLayer = L.layerGroup().addTo(map)

      const latLngs: [number, number][] = []
      for (const point of points) {
        if (typeof point.latitude !== 'number' || typeof point.longitude !== 'number') continue
        const latLng: [number, number] = [point.latitude, point.longitude]
        latLngs.push(latLng)
        L.circleMarker(latLng, {
          radius: point.confidence === 'High' ? 7 : 5,
          color: '#fff',
          weight: 1.5,
          fillColor: KIND_COLORS[point.kind] || '#788878',
          fillOpacity: 0.9,
        })
          .bindPopup(popupHtml(point))
          .addTo(markerLayer)
      }

      if (latLngs.length) {
        map.fitBounds(latLngs, { padding: [30, 30], maxZoom: 6 })
      }
    }

    void render()

    return () => {
      cancelled = true
      if (markerLayer) markerLayer.remove()
    }
  }, [points])

  // Tear the map down only when the component unmounts.
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  return <div ref={containerRef} className="leaflet-map" role="application" aria-label="Map of archive locations" />
}
