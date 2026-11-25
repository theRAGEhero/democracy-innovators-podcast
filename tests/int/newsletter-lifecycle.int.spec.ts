// @vitest-environment node

import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { confirmSubscription } from '@/lib/newsletter-confirm'
import { POST as unsubscribe } from '@/app/(payload)/api/newsletter/unsubscribe/route'
import { createConfirmToken, unsubscribeToken } from '@/lib/newsletter-tokens'

let payload: Payload

describe('newsletter capability lifecycle', () => {
  beforeAll(async () => {
    process.env.PAYLOAD_SECRET = 'integration-test-only-secret'
    const { default: config } = await import('@/payload.config')
    payload = await getPayload({ config })
  }, 60_000)

  it('assigns version-2 keys to new subscribers and rejects a legacy token after ID reuse', async () => {
    const original = await payload.create({
      collection: 'newsletter-subscribers',
      draft: false,
      data: { email: 'original@example.test', status: 'confirmed', source: 'web', unsubscribeTokenVersion: 1 },
      overrideAccess: true,
    })
    expect(original.unsubscribeKey).toBeTruthy()
    const legacyToken = unsubscribeToken(original)
    await payload.delete({ collection: 'newsletter-subscribers', id: original.id, overrideAccess: true })

    const replacement = await payload.create({
      collection: 'newsletter-subscribers',
      draft: false,
      data: { email: 'replacement@example.test', status: 'confirmed', source: 'web' },
      overrideAccess: true,
    })
    expect(replacement.id).toBe(original.id)
    expect(replacement.unsubscribeTokenVersion).toBe(2)
    expect(replacement.unsubscribeKey).not.toBe(original.unsubscribeKey)
    const response = await unsubscribe(new Request(`https://example.test/api/newsletter/unsubscribe?s=${original.id}&t=${encodeURIComponent(legacyToken)}`, { method: 'POST' }))
    expect(response.status).toBe(400)
    const current = await payload.findByID({ collection: 'newsletter-subscribers', id: replacement.id, overrideAccess: true })
    expect(current.status).toBe('confirmed')
  })

  it('does not confirm again after unsubscribe has consumed the pending state', async () => {
    const confirmation = createConfirmToken()
    const subscriber = await payload.create({
      collection: 'newsletter-subscribers',
      draft: false,
      data: {
        email: 'race@example.test',
        status: 'pending',
        source: 'web',
        confirmTokenHash: confirmation.hash,
        confirmTokenExpiresAt: confirmation.expiresAt,
      },
      overrideAccess: true,
    })
    const token = unsubscribeToken(subscriber)
    const response = await unsubscribe(new Request(`https://example.test/api/newsletter/unsubscribe?s=${subscriber.id}&t=${encodeURIComponent(token)}`, { method: 'POST' }))
    expect(response.status).toBe(200)
    expect(await confirmSubscription(confirmation.token)).toBe('spent')
    const current = await payload.findByID({ collection: 'newsletter-subscribers', id: subscriber.id, overrideAccess: true })
    expect(current.status).toBe('unsubscribed')
  })
})
