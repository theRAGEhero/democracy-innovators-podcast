import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'

export const Episodes: CollectionConfig = {
  slug: 'episodes',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['title', 'publishedAt', 'updatedAt'],
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'legacyId', type: 'text', index: true },
    { name: 'publishedAt', type: 'date', required: true, index: true },
    { name: 'excerpt', type: 'textarea' },
    { name: 'featureImageUrl', type: 'text', label: 'Feature image URL' },
    {
      name: 'squareCoverUrl',
      type: 'text',
      label: 'Square cover URL',
      admin: { description: 'Square artwork from Castopod. Populated by `npm run audio:sync`.' },
    },
    { name: 'audioUrl', type: 'text', label: 'Audio URL' },
    { name: 'videoUrl', type: 'text', label: 'Video URL' },
    {
      name: 'html',
      type: 'textarea',
      label: 'Imported episode HTML',
      admin: { description: 'Trusted legacy HTML imported from Ghost.' },
    },
    { name: 'transcriptText', type: 'textarea', label: 'Plain transcript' },
    {
      name: 'chapters',
      type: 'json',
      label: 'Chapters',
      admin: { description: 'Array of { startTime (seconds), title, description }. Imported from Castopod chapter JSON.' },
    },
    {
      name: 'guests',
      type: 'relationship',
      relationTo: 'guests',
      hasMany: true,
    },
    {
      name: 'topics',
      type: 'relationship',
      relationTo: 'topics',
      hasMany: true,
    },
    {
      name: 'projects',
      type: 'relationship',
      relationTo: 'projects',
      hasMany: true,
    },
    {
      name: 'organizations',
      type: 'relationship',
      relationTo: 'organizations',
      hasMany: true,
    },
    {
      name: 'sources',
      type: 'relationship',
      relationTo: 'sources',
      hasMany: true,
    },
  ],
  versions: { drafts: true },
}
