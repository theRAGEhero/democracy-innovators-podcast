import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import type { NewsletterSubscriber } from '@/payload-types'

// A subscriber list is the one thing on this site that must never be readable
// by an anonymous caller, and Payload's generated REST endpoints answer with
// the collection's own access rules rather than with whatever filters the
// website happens to apply. So these assert the rules themselves.

let payload: Payload

const anonymous = { overrideAccess: false } as const

beforeAll(async () => {
  payload = await getPayload({ config: await config })
})

async function subscriber(email: string, status: NewsletterSubscriber['status'] = 'confirmed') {
  return payload.create({
    collection: 'newsletter-subscribers',
    draft: false,
    data: { email, status, source: 'web', consentAt: new Date().toISOString() },
    overrideAccess: true,
  })
}

describe('newsletter collections are closed to the public', () => {
  it('never shows a subscriber to an anonymous caller', async () => {
    await subscriber('reader@example.org')

    const asEditor = await payload.find({ collection: 'newsletter-subscribers', depth: 0, overrideAccess: true })
    expect(asEditor.docs.length).toBeGreaterThan(0)

    await expect(
      payload.find({ collection: 'newsletter-subscribers', depth: 0, ...anonymous }),
    ).rejects.toThrow()
  })

  it('refuses an anonymous write, so the public route must use overrideAccess', async () => {
    await expect(
      payload.create({
        collection: 'newsletter-subscribers',
        draft: false,
        data: { email: 'intruder@example.org', status: 'confirmed', source: 'web' },
        ...anonymous,
      }),
    ).rejects.toThrow()
  })

  it('hides mailings and the delivery log from anonymous callers', async () => {
    await expect(
      payload.find({ collection: 'newsletter-mailings', depth: 0, ...anonymous }),
    ).rejects.toThrow()
    await expect(
      payload.find({ collection: 'newsletter-deliveries', depth: 0, ...anonymous }),
    ).rejects.toThrow()
  })
})

describe('subscriber email normalisation', () => {
  // SQLite's unique index is case-sensitive, so without the beforeValidate hook
  // "A@Example.org" and "a@example.org" would both be stored and both be mailed.
  it('lowercases and trims on the way in', async () => {
    const created = await subscriber('  MiXeD@Example.ORG  ')
    expect(created.email).toBe('mixed@example.org')
  })

  it('collides with an existing address regardless of case', async () => {
    await subscriber('dupe@example.org')
    await expect(subscriber('DUPE@Example.org')).rejects.toThrow()
  })
})

describe('one mailing per episode', () => {
  async function episode(slug: string) {
    const created = await payload.create({
      collection: 'episodes',
      data: { title: slug, slug, publishedAt: new Date().toISOString() },
      overrideAccess: true,
    })
    return created.id
  }

  it('rejects a second episode mailing, with an explanation', async () => {
    const id = await episode('mailing-guard-one')
    await payload.create({
      collection: 'newsletter-mailings',
      data: { title: 'First', kind: 'episode', episode: id, status: 'draft' },
      overrideAccess: true,
    })
    // The unique index only exists in the hand-written migration, so under
    // push: true this is the application guard talking.
    await expect(
      payload.create({
        collection: 'newsletter-mailings',
        data: { title: 'Second', kind: 'episode', episode: id, status: 'draft' },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/already has a mailing/)
  })

  it('allows a deliberate duplicate when asked', async () => {
    const id = await episode('mailing-guard-two')
    await payload.create({
      collection: 'newsletter-mailings',
      data: { title: 'First', kind: 'episode', episode: id, status: 'draft' },
      overrideAccess: true,
    })
    const second = await payload.create({
      collection: 'newsletter-mailings',
      data: { title: 'Second', kind: 'episode', episode: id, allowDuplicate: true, status: 'draft' },
      overrideAccess: true,
    })
    expect(second.id).toBeTruthy()
  })

  it('leaves announcements unconstrained — they have no episode', async () => {
    for (const title of ['Moved one', 'Moved two']) {
      const created = await payload.create({
        collection: 'newsletter-mailings',
        data: { title, kind: 'announcement', status: 'draft' },
        overrideAccess: true,
      })
      expect(created.id).toBeTruthy()
    }
  })

  it('still requires an episode on an episode mailing', async () => {
    await expect(
      payload.create({
        collection: 'newsletter-mailings',
        data: { title: 'Nothing attached', kind: 'episode', status: 'draft' },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })
})
