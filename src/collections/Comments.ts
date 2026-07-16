import type { CollectionConfig } from 'payload'
import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'

export const Comments: CollectionConfig = {
  slug: 'comments',
  access: {
    create: anyone,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: { defaultColumns: ['name', 'episode', 'status', 'createdAt'], useAsTitle: 'name' },
  fields: [
    { name: 'episode', type: 'relationship', relationTo: 'episodes', required: true },
    { name: 'name', type: 'text', required: true, maxLength: 80 },
    { name: 'message', type: 'textarea', required: true, maxLength: 1200 },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: ['pending', 'approved', 'rejected'],
      required: true,
    },
  ],
}
