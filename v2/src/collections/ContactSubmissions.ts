import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'

export const ContactSubmissions: CollectionConfig = {
  slug: 'contact-submissions',
  access: {
    create: () => false,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'email', 'subject', 'status', 'createdAt'],
    useAsTitle: 'subject',
  },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 120 },
    { name: 'email', type: 'email', required: true, index: true },
    { name: 'organization', type: 'text', maxLength: 160 },
    { name: 'subject', type: 'text', required: true, maxLength: 180 },
    { name: 'message', type: 'textarea', required: true, maxLength: 3000 },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'new',
      options: ['new', 'replied', 'archived'],
      required: true,
      index: true,
    },
    { name: 'emailSent', type: 'checkbox', defaultValue: false, label: 'Email notification sent' },
    { name: 'userAgent', type: 'text', admin: { readOnly: true } },
    { name: 'ipAddress', type: 'text', admin: { readOnly: true } },
  ],
}
