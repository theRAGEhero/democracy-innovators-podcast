import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'

// The subscriber list.
//
// `create` is closed even though the public form writes here: the route uses
// overrideAccess, which keeps Payload's generic REST endpoint from handing the
// whole list — or accepting writes into it — from anonymous callers.
//
// The consent columns are not decoration. GDPR Art. 7(1) puts the burden of
// demonstrating consent on the controller, so the date, the address that gave
// it and where it came from live on the row.

/**
 * SQLite's unique index is case-sensitive, and a COLLATE NOCASE here would
 * diverge from the schema the integration suite builds with `push: true`. One
 * hook instead, so the admin, the public route and the CSV importer agree.
 */
const normaliseEmail: CollectionBeforeValidateHook = ({ data }) => {
  if (data?.email) data.email = String(data.email).trim().toLowerCase()
  return data
}

export const NewsletterSubscribers: CollectionConfig = {
  slug: 'newsletter-subscribers',
  access: {
    create: () => false,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['email', 'status', 'source', 'consentAt', 'confirmedAt'],
    useAsTitle: 'email',
    group: 'Newsletter',
    description: 'Newsletter subscribers and the consent recorded for each one.',
  },
  hooks: { beforeValidate: [normaliseEmail] },
  fields: [
    { name: 'email', type: 'email', required: true, unique: true, index: true },
    { name: 'name', type: 'text', maxLength: 120 },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: ['pending', 'confirmed', 'unsubscribed', 'bounced', 'complained'],
      required: true,
      index: true,
      admin: { description: 'Only `confirmed` subscribers are ever sent a mailing.' },
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'web',
      options: ['web', 'import', 'admin'],
      required: true,
    },
    {
      name: 'consentAt',
      type: 'date',
      admin: { description: 'When consent was given. For imported rows, the original signup date.' },
    },
    { name: 'confirmedAt', type: 'date' },
    { name: 'unsubscribedAt', type: 'date' },
    { name: 'confirmSentAt', type: 'date', admin: { readOnly: true } },
    // Only the hash is kept: a leaked backup then carries no working
    // confirmation links. The raw token exists once, in one email.
    { name: 'confirmTokenHash', type: 'text', index: true, admin: { readOnly: true, hidden: true } },
    { name: 'confirmTokenExpiresAt', type: 'date', admin: { readOnly: true, hidden: true } },
    { name: 'signupIp', type: 'text', admin: { readOnly: true } },
    { name: 'signupUserAgent', type: 'text', admin: { readOnly: true } },
    { name: 'bounceCount', type: 'number', defaultValue: 0, min: 0, admin: { readOnly: true } },
    { name: 'lastError', type: 'textarea', admin: { readOnly: true } },
    { name: 'notes', type: 'textarea' },
  ],
}
