import { describe, expect, it } from 'vitest'

import {
  createConfirmToken,
  confirmUrl,
  hashConfirmToken,
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from '@/lib/newsletter-tokens'

const v1 = { id: 37, unsubscribeKey: 'legacy-key', unsubscribeTokenVersion: 1 }
const v2 = { id: 37, unsubscribeKey: 'row-specific-key', unsubscribeTokenVersion: 2 }

describe('confirmation tokens', () => {
  it('returns a URL-safe secret and only its hash to store', () => {
    const { token, hash } = createConfirmToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThanOrEqual(42)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
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
    expect(unsubscribeToken(v2)).toBe(unsubscribeToken(v2))
    expect(unsubscribeToken(v2)).toBe(unsubscribeToken({ ...v2, id: '37' }))
  })

  it('differs per row key as well as per subscriber ID', () => {
    expect(unsubscribeToken(v2)).not.toBe(unsubscribeToken({ ...v2, id: 38 }))
    expect(unsubscribeToken(v2)).not.toBe(unsubscribeToken({ ...v2, unsubscribeKey: 'other-key' }))
  })

  it('accepts its own token and rejects wrong keys and malformed input', () => {
    const token = unsubscribeToken(v2)
    expect(verifyUnsubscribeToken(v2, token)).toBe(true)
    expect(verifyUnsubscribeToken({ ...v2, id: 38 }, token)).toBe(false)
    expect(verifyUnsubscribeToken({ ...v2, unsubscribeKey: 'other-key' }, token)).toBe(false)
    expect(verifyUnsubscribeToken(v2, `${token}x`)).toBe(false)
    expect(verifyUnsubscribeToken(v2, token.slice(0, -1))).toBe(false)
    expect(verifyUnsubscribeToken(v2, '')).toBe(false)
    expect(verifyUnsubscribeToken(v2, undefined)).toBe(false)
    expect(verifyUnsubscribeToken(v2, null)).toBe(false)
  })

  it('keeps legacy links for their original row but rejects them for a recycled ID', () => {
    const legacy = unsubscribeToken(v1)
    expect(verifyUnsubscribeToken(v1, legacy)).toBe(true)
    expect(verifyUnsubscribeToken(v2, legacy)).toBe(false)
  })

  it('builds a link carrying both the id and the token', () => {
    const url = new URL(unsubscribeUrl('https://example.org', v2))
    expect(url.pathname).toBe('/newsletter/unsubscribe')
    expect(url.searchParams.get('s')).toBe('37')
    expect(verifyUnsubscribeToken(v2, url.searchParams.get('t'))).toBe(true)
  })
})
