import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'

// Cookieless, aggregate-only visit counter. Stores one row per path with a
// running total. No cookies, no IP, no per-visitor identifiers — so it needs
// no consent under GDPR/ePrivacy. See /privacy.
export const PageViews: CollectionConfig = {
  slug: 'page-views',
  access: {
    create: () => false,
    delete: authenticated,
    read: authenticated,
    update: () => false,
  },
  admin: {
    defaultColumns: ['path', 'count', 'updatedAt'],
    useAsTitle: 'path',
  },
  fields: [
    { name: 'path', type: 'text', required: true, index: true, unique: true },
    { name: 'count', type: 'number', required: true, defaultValue: 0, min: 0 },
  ],
}
