import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'

export const Guests: CollectionConfig = {
  slug: 'guests',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'role', 'updatedAt'],
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', required: true, index: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'role', type: 'text' },
    { name: 'organizationLabel', type: 'text', label: 'Organization (display)' },
    { name: 'portraitUrl', type: 'text', label: 'Portrait URL' },
    {
      name: 'summary',
      type: 'textarea',
      label: 'Short profile',
      admin: { description: 'Concise public introduction, ideally 45-80 words.' },
    },
    {
      name: 'conversationSummary',
      type: 'textarea',
      label: 'From the conversation',
      admin: { description: 'What this guest discussed in the podcast transcript.' },
    },
    {
      name: 'externalBiography',
      type: 'textarea',
      label: 'Externally verified biography',
    },
    {
      name: 'officialLinks',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'url', type: 'text', required: true },
      ],
    },
    {
      name: 'episodes',
      type: 'relationship',
      relationTo: 'episodes',
      hasMany: true,
    },
    {
      name: 'topics',
      type: 'relationship',
      relationTo: 'topics',
      hasMany: true,
    },
    {
      name: 'organizations',
      type: 'relationship',
      relationTo: 'organizations',
      hasMany: true,
    },
    {
      name: 'projects',
      type: 'relationship',
      relationTo: 'projects',
      hasMany: true,
    },
    {
      name: 'sources',
      type: 'relationship',
      relationTo: 'sources',
      hasMany: true,
    },
    { name: 'lastVerifiedAt', type: 'date', label: 'Last verified' },
  ],
  versions: { drafts: true },
}
