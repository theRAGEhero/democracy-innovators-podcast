import type { Access, CollectionConfig } from 'payload'
import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'

/** Anyone may read a comment once it has been approved; an editor sees them all.
 *  Without this, Payload's generic endpoint returns pending and rejected
 *  submissions that no one ever chose to publish. */
const approvedOrAuthenticated: Access = ({ req: { user } }) =>
  user ? true : { status: { equals: 'approved' } }

export const Comments: CollectionConfig = {
  slug: 'comments',
  access: {
    create: anyone,
    delete: authenticated,
    read: approvedOrAuthenticated,
    update: authenticated,
  },
  admin: { defaultColumns: ['name', 'episode', 'status', 'createdAt'], useAsTitle: 'name' },
  fields: [
    { name: 'episode', type: 'relationship', relationTo: 'episodes', required: true },
    { name: 'name', type: 'text', required: true, maxLength: 80 },
    {
      name: 'email',
      type: 'email',
      required: true,
      // The field said "private" and nothing enforced it. Collection-level
      // access decides which documents are visible; only field-level access
      // decides which of their fields are.
      access: { read: ({ req: { user } }) => Boolean(user) },
      admin: { description: 'Private — never shown publicly.' },
    },
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
