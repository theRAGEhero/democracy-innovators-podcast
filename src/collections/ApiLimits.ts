import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'

// Daily tally of upstream API rate-limit / quota responses (e.g. Gemini 429),
// so it is visible in the admin whether the current plan is being outgrown.
// One row per provider+operation+day keeps growth bounded.
export const ApiLimits: CollectionConfig = {
  slug: 'api-limits',
  access: {
    create: () => false,
    delete: authenticated,
    read: authenticated,
    update: () => false,
  },
  admin: {
    defaultColumns: ['day', 'provider', 'operation', 'count', 'lastStatus'],
    useAsTitle: 'key',
    description: 'Times an upstream API refused a call because of quota or rate limits.',
  },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, index: true, admin: { readOnly: true } },
    { name: 'day', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'provider', type: 'text', required: true, admin: { readOnly: true } },
    {
      name: 'operation',
      type: 'select',
      required: true,
      options: ['embedding', 'chat', 'other'],
      admin: { readOnly: true },
    },
    { name: 'model', type: 'text', admin: { readOnly: true } },
    { name: 'count', type: 'number', required: true, defaultValue: 0, min: 0, admin: { readOnly: true } },
    { name: 'lastStatus', type: 'number', admin: { readOnly: true } },
    { name: 'lastMessage', type: 'textarea', admin: { readOnly: true } },
    { name: 'lastAt', type: 'date', admin: { readOnly: true } },
  ],
}
