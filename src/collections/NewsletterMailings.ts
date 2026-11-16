import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { authenticated } from '@/access/authenticated'

// One mailing: an episode (or an announcement), the rendered email, and where
// the send got to.
//
// The rendered `bodyHtml` / `bodyText` are stored rather than built at send
// time, so a later edit to the episode cannot change what already went out, and
// so the admin can show exactly what was sent.
//
// `delete` is closed for two reasons: Payload emits ON DELETE set null for the
// required relationship on newsletter-deliveries, so a delete raises a SQLite
// foreign-key error anyway — and a mailing that has been sent is a record.

/**
 * One episode, one mailing.
 *
 * The unique index on episode_id in the migration is the real guard; this hook
 * exists because that index cannot be expressed in Payload field config and so
 * is absent from the schema the test suite builds with `push: true`. It also
 * gives the editor a sentence instead of a constraint violation.
 */
const rejectDuplicateEpisode: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  const kind = data?.kind ?? originalDoc?.kind
  const episode = data?.episode ?? originalDoc?.episode
  const allowDuplicate = data?.allowDuplicate ?? originalDoc?.allowDuplicate
  if (kind !== 'episode' || !episode || allowDuplicate) return data

  const episodeId = typeof episode === 'object' ? episode.id : episode
  const existing = await req.payload.find({
    collection: 'newsletter-mailings',
    where: { and: [{ episode: { equals: episodeId } }, { kind: { equals: 'episode' } }] },
    limit: 2,
    depth: 0,
    overrideAccess: true,
  })
  const clash = existing.docs.find((doc) => doc.id !== originalDoc?.id)
  if (clash) {
    throw new APIError(
      `That episode already has a mailing (#${clash.id}, status "${clash.status}"). `
      + 'Tick "Allow duplicate" if you really mean to send it twice.',
      400,
    )
  }
  return data
}

export const NewsletterMailings: CollectionConfig = {
  slug: 'newsletter-mailings',
  access: {
    create: authenticated,
    delete: () => false,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['title', 'status', 'recipientCount', 'sentCount', 'failedCount', 'createdAt'],
    useAsTitle: 'title',
    group: 'Newsletter',
    description: 'Episode mailings. Build, preview, send a test, then send.',
  },
  hooks: { beforeValidate: [rejectDuplicateEpisode] },
  fields: [
    { name: 'title', type: 'text', required: true, admin: { description: 'Internal label. Not the subject line.' } },
    {
      name: 'kind',
      type: 'select',
      defaultValue: 'episode',
      options: ['episode', 'announcement'],
      required: true,
      index: true,
    },
    {
      name: 'episode',
      type: 'relationship',
      relationTo: 'episodes',
      index: true,
      // Not `required`, because an announcement has no episode. SQLite treats
      // NULLs as distinct in a unique index, so announcements stay unconstrained.
      validate: (value: unknown, options: unknown) => {
        const siblingData = (options as { siblingData?: { kind?: string } })?.siblingData
        if (siblingData?.kind === 'episode' && !value) return 'An episode mailing needs an episode.'
        return true
      },
    },
    { name: 'subject', type: 'text', maxLength: 150, admin: { description: 'Filled in by Build. At least 10 characters.' } },
    { name: 'preheader', type: 'text', maxLength: 160, admin: { description: 'The line the inbox shows after the subject.' } },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: ['draft', 'ready', 'sending', 'sent', 'paused', 'failed'],
      required: true,
      index: true,
    },
    { name: 'bodyHtml', type: 'textarea', admin: { readOnly: true, description: 'Frozen at Build. This is what is sent.' } },
    { name: 'bodyText', type: 'textarea', admin: { readOnly: true } },
    {
      name: 'htmlBytes',
      type: 'number',
      admin: {
        readOnly: true,
        description: 'Gmail clips the HTML part around 102,000 bytes, hiding the footer. Build refuses over 90,000.',
      },
    },
    {
      name: 'excerptSource',
      type: 'select',
      options: ['turns', 'labels', 'plain'],
      admin: {
        readOnly: true,
        description:
          'Which transcript tier the excerpt came from. `plain` means no speaker names were found — worth a look.',
      },
    },
    {
      name: 'allowDuplicate',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Permit a second mailing for an episode that already has one.' },
    },
    {
      name: 'allowOldEpisode',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Permit sending an episode published more than 60 days ago.' },
    },
    { name: 'recipientCount', type: 'number', defaultValue: 0, min: 0, admin: { readOnly: true } },
    { name: 'sentCount', type: 'number', defaultValue: 0, min: 0, admin: { readOnly: true } },
    { name: 'failedCount', type: 'number', defaultValue: 0, min: 0, admin: { readOnly: true } },
    { name: 'queuedAt', type: 'date', admin: { readOnly: true } },
    { name: 'startedAt', type: 'date', admin: { readOnly: true } },
    { name: 'completedAt', type: 'date', admin: { readOnly: true } },
    { name: 'testSentTo', type: 'text', admin: { readOnly: true } },
    { name: 'lastError', type: 'textarea', admin: { readOnly: true } },
  ],
}
