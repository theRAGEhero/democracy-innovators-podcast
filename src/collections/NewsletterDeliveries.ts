import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'

// One row per recipient per mailing: the thing that makes a send resumable and
// a double send impossible.
//
// Written only by the send worker (with overrideAccess), never by hand, so
// `create` and `update` are closed the way ApiLimits closes them.
//
// `email` is denormalised on purpose. If a subscriber later changes address or
// asks to be erased, this row must still stand alone as the record of what was
// sent where — which is also what Art. 7(1) asks the controller to be able to
// show.
export const NewsletterDeliveries: CollectionConfig = {
  slug: 'newsletter-deliveries',
  access: {
    create: () => false,
    delete: authenticated,
    read: authenticated,
    update: () => false,
  },
  admin: {
    defaultColumns: ['email', 'mailing', 'status', 'attempts', 'sentAt'],
    useAsTitle: 'email',
    group: 'Newsletter',
    description: 'Per-recipient delivery log. One row per subscriber per mailing.',
  },
  fields: [
    { name: 'mailing', type: 'relationship', relationTo: 'newsletter-mailings', required: true, index: true },
    { name: 'subscriber', type: 'relationship', relationTo: 'newsletter-subscribers', required: true, index: true },
    { name: 'email', type: 'text', required: true, index: true, admin: { readOnly: true } },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: ['pending', 'sending', 'sent', 'failed', 'skipped'],
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description:
          'A row left in `sending` means the outcome is unknown — it is never retried automatically, '
          + 'because a possible duplicate is worse than a possible miss. Check the provider console.',
      },
    },
    { name: 'attempts', type: 'number', defaultValue: 0, min: 0, required: true, admin: { readOnly: true } },
    { name: 'providerMessageId', type: 'text', admin: { readOnly: true } },
    { name: 'lastError', type: 'textarea', admin: { readOnly: true } },
    { name: 'sentAt', type: 'date', admin: { readOnly: true } },
  ],
}
