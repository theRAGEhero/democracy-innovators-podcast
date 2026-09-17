import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { clearRateLimits, isRateLimited, trackedKeys } from '@/lib/rate-limit'

// What an anonymous caller can see.
//
// Payload's generated REST endpoints answer with the collection's own access
// rules, not with the filters the website's queries happen to apply. Two things
// were leaking through that gap: unpublished episodes, and the email address
// attached to every comment.

let payload: Payload

const anonymous = { overrideAccess: false } as const

/** create() on a drafts collection leaves the document in draft whatever you
 *  pass, so publishing is a second, explicit step. */
async function publish(title: string, slug: string) {
  const created = await payload.create({
    collection: 'episodes',
    data: { title, slug, publishedAt: new Date().toISOString() },
    overrideAccess: true,
  })
  return payload.update({
    collection: 'episodes',
    id: created.id,
    data: { _status: 'published' },
    overrideAccess: true,
  })
}

describe('what the public API exposes', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })

    await publish('Published one', 'published-one')
    await payload.create({
      collection: 'episodes',
      data: { title: 'Not ready yet', slug: 'not-ready-yet', publishedAt: new Date().toISOString() },
      draft: true,
      overrideAccess: true,
    })
  }, 60_000)

  it('does not hand drafts to anonymous callers', async () => {
    const { docs } = await payload.find({ collection: 'episodes', depth: 0, ...anonymous })
    expect(docs.map((doc) => doc.slug)).toContain('published-one')
    expect(docs.map((doc) => doc.slug)).not.toContain('not-ready-yet')
  })

  it('still shows drafts to an editor', async () => {
    const { docs } = await payload.find({ collection: 'episodes', depth: 0, overrideAccess: true })
    expect(docs.map((doc) => doc.slug)).toContain('not-ready-yet')
  })

  it('keeps an unapproved comment out of public view, and the address out of an approved one', async () => {
    const episode = await publish('Has comments', 'has-comments')
    await payload.create({
      collection: 'comments',
      data: { episode: episode.id, name: 'Waiting', email: 'pending@example.com', message: 'not yet approved', status: 'pending' },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'comments',
      data: { episode: episode.id, name: 'Published', email: 'approved@example.com', message: 'this one is public', status: 'approved' },
      overrideAccess: true,
    })

    const { docs } = await payload.find({ collection: 'comments', depth: 0, ...anonymous })
    expect(docs.map((doc) => doc.name)).toEqual(['Published'])
    // The address was documented as private and nothing enforced it.
    expect(docs[0].email).toBeUndefined()

    const asEditor = await payload.find({ collection: 'comments', depth: 0, overrideAccess: true })
    expect(asEditor.docs.map((doc) => doc.email).filter(Boolean)).toHaveLength(2)
  })
})

describe('the shared rate limiter', () => {
  const scope = 'test'
  const request = (ip: string) => new Request('https://example.test/', { headers: { 'x-forwarded-for': ip } })

  it('lets a caller through up to the limit, then refuses', () => {
    clearRateLimits()
    const options = { scope, limit: 2, windowMs: 60_000 }
    expect(isRateLimited(request('1.1.1.1'), options)).toBe(false)
    expect(isRateLimited(request('1.1.1.1'), options)).toBe(false)
    expect(isRateLimited(request('1.1.1.1'), options)).toBe(true)
  })

  it('budgets each caller separately', () => {
    clearRateLimits()
    const options = { scope, limit: 1, windowMs: 60_000 }
    expect(isRateLimited(request('1.1.1.1'), options)).toBe(false)
    expect(isRateLimited(request('2.2.2.2'), options)).toBe(false)
  })

  it('keeps separate budgets per scope', () => {
    clearRateLimits()
    expect(isRateLimited(request('1.1.1.1'), { scope: 'a', limit: 1, windowMs: 60_000 })).toBe(false)
    expect(isRateLimited(request('1.1.1.1'), { scope: 'b', limit: 1, windowMs: 60_000 })).toBe(false)
  })

  it('releases expired entries instead of keeping a key per address forever', async () => {
    clearRateLimits()
    const options = { scope, limit: 1, windowMs: 1 }
    for (let i = 0; i < 25; i += 1) isRateLimited(request(`10.0.0.${i}`), options)
    expect(trackedKeys(scope)).toBeGreaterThan(1)
    await new Promise((resolve) => setTimeout(resolve, 10))
    // The next call prunes what has expired: the old addresses go, this one stays.
    isRateLimited(request('10.1.1.1'), options)
    expect(trackedKeys(scope)).toBe(1)
  })

  it('reads the client from the first forwarded entry, not the proxies after it', () => {
    clearRateLimits()
    const options = { scope, limit: 1, windowMs: 60_000 }
    const viaProxies = new Request('https://example.test/', { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1, 10.0.0.2' } })
    expect(isRateLimited(viaProxies, options)).toBe(false)
    expect(isRateLimited(request('9.9.9.9'), options)).toBe(true)
  })
})
