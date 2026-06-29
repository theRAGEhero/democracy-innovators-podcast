import type { CollectionConfig } from 'payload'
import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'

export const Sources: CollectionConfig = {
  slug: 'sources',
  access: { create: authenticated, delete: authenticated, read: anyone, update: authenticated },
  admin: { defaultColumns: ['title', 'publisher', 'retrievedAt'], useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'url', type: 'text', required: true, unique: true },
    { name: 'publisher', type: 'text' },
    { name: 'retrievedAt', type: 'date', required: true },
    { name: 'notes', type: 'textarea' },
  ],
}
