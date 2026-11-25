import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'

const revokeSessionsOnPasswordChange: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (operation === 'update' && (data?.password || (data?.salt && data?.hash))) {
    data.sessions = []
  }
  return data
}

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
  },
  auth: {
    useAPIKey: true,
    cookies: { secure: process.env.NODE_ENV === 'production' },
  },
  hooks: { beforeValidate: [revokeSessionsOnPasswordChange] },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
  ],
  timestamps: true,
}
