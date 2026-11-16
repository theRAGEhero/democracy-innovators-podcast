import { describe, expect, it } from 'vitest'

import {
  createConfirmToken,
  confirmUrl,
  hashConfirmToken,
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from '@/lib/newsletter-tokens'

describe('confirmation tokens', () => {
  it('returns a URL-safe secret and only its hash to store', () => {
    const { token, hash } = createConfirmToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThanOrEqual(42)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    // The point of the exercise: the stored value is not the secret.
    expect(hash).not.toContain(token)
    expect(hashConfirmToken(token)).toBe(hash)
  })

  it('never repeats a token', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createConfirmToken().token))
    expect(tokens.size).toBe(200)
  })

  it('expires in 48 hours', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    expect(createConfirmToken(now).expiresAt).toBe('2026-01-03T00:00:00.000Z')
  })

  it('puts the token in a link the confirm page can read', () => {
    const { token } = createConfirmToken()
    expect(confirmUrl('https://example.org', token)).toBe(
      `https://example.org/newsletter/confirm?t=${encodeURIComponent(token)}`,
    )
  })
})

describe('unsubscribe tokens', () => {
  it('is reproducible, so a re-send carries the same link', () => {
    expect(unsubscribeToken(37)).toBe(unsubscribeToken(37))
    expect(unsubscribeToken(37)).toBe(unsubscribeToken('37'))
  })

  it('differs per subscriber', () => {
    expect(unsubscribeToken(37)).not.toBe(unsubscribeToken(38))
  })

  it('accepts its own token and rejects everything else', () => {
    const token = unsubscribeToken(37)
    expect(verifyUnsubscribeToken(37, token)).toBe(true)
    // Another subscriber's token must not unsubscribe this one.
    expect(verifyUnsubscribeToken(38, token)).toBe(false)
    expect(verifyUnsubscribeToken(37, `${token}x`)).toBe(false)
    expect(verifyUnsubscribeToken(37, token.slice(0, -1))).toBe(false)
    expect(verifyUnsubscribeToken(37, '')).toBe(false)
    expect(verifyUnsubscribeToken(37, undefined)).toBe(false)
    expect(verifyUnsubscribeToken(37, null)).toBe(false)
    expect(verifyUnsubscribeToken(37, 37 as unknown as string)).toBe(false)
  })

  it('builds a link carrying both the id and the token', () => {
    const url = new URL(unsubscribeUrl('https://example.org', 37))
    expect(url.pathname).toBe('/newsletter/unsubscribe')
    expect(url.searchParams.get('s')).toBe('37')
    expect(verifyUnsubscribeToken(37, url.searchParams.get('t'))).toBe(true)
  })
})
