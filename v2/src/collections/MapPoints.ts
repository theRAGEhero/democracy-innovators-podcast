import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'

export const MapPoints: CollectionConfig = {
  slug: 'map-points',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['title', 'kind', 'country', 'confidence', 'updatedAt'],
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', required: true, index: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'kind', type: 'select', options: ['person', 'project'], required: true, index: true },
    { name: 'country', type: 'text', required: true, index: true },
    { name: 'iso2', type: 'text', label: 'ISO 3166-1 alpha-2' },
    { name: 'cityOrPlace', type: 'text', label: 'City or place' },
    { name: 'latitude', type: 'number', required: true, min: -90, max: 90 },
    { name: 'longitude', type: 'number', required: true, min: -180, max: 180 },
    { name: 'confidence', type: 'select', defaultValue: 'Medium', options: ['High', 'Medium', 'Low'], required: true, index: true },
    { name: 'episodeNo', type: 'text', label: 'Episode number' },
    { name: 'episodeTitle', type: 'text', index: true },
    { name: 'timeLabel', type: 'text', label: 'Time anchor' },
    { name: 'researchNotes', type: 'textarea' },
    { name: 'needsVerification', type: 'textarea' },
    {
      name: 'sourceUrls',
      type: 'array',
      fields: [{ name: 'url', type: 'text', required: true }],
    },
    { name: 'episode', type: 'relationship', relationTo: 'episodes' },
    { name: 'project', type: 'relationship', relationTo: 'projects' },
  ],
}
