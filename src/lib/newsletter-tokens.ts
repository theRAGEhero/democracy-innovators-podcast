// Confirmation uses a random, expiring secret stored only as a hash. Unsubscribe
// links are derived instead so every mailing can reproduce them without storing
// a raw token. Version 2 binds that derivation to a random per-row key, so a
// deleted row's numeric ID cannot transfer its capability to a replacement row.
// Existing version-1 rows retain their original links; replacement rows use v2.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const CONFIRM_TTL_MS = 48 * 60 * 60 * 1000

export type UnsubscribeIdentity = {
  id: number | string
  unsubscribeKey?: string | null
  unsubscribeTokenVersion?: number | null
}

function tokenSecret(): string | null {
  return process.env.NEWSLETTER_TOKEN_SECRET || process.env.PAYLOAD_SECRET || null
}

function hmac(value: string): string {
  const secret = tokenSecret()
  if (!secret) throw new Error('NEWSLETTER_TOKEN_SECRET (or PAYLOAD_SECRET) must be set to build unsubscribe links')
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function hashConfirmToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createConfirmToken(now = new Date()): {
  token: string
  hash: string
  expiresAt: string
} {
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    hash: hashConfirmToken(token),
    expiresAt: new Date(now.getTime() + CONFIRM_TTL_MS).toISOString(),
  }
}

export function unsubscribeToken(subscriber: UnsubscribeIdentity): string {
  if (subscriber.unsubscribeTokenVersion === 1) return hmac(`unsub:v1:${subscriber.id}`)
  if (!subscriber.unsubscribeKey) throw new Error('A version-2 subscriber needs an unsubscribe key')
  return hmac(`unsub:v2:${subscriber.id}:${subscriber.unsubscribeKey}`)
}

export function verifyUnsubscribeToken(subscriber: UnsubscribeIdentity, provided: unknown): boolean {
  if (typeof provided !== 'string' || !provided || !tokenSecret()) return false
  if (subscriber.unsubscribeTokenVersion !== 1 && !subscriber.unsubscribeKey) return false
  const expected = unsubscribeToken(subscriber)
  if (expected.length !== provided.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}

export function confirmUrl(origin: string, token: string): string {
  return `${origin}/newsletter/confirm?t=${encodeURIComponent(token)}`
}

export function unsubscribeUrl(origin: string, subscriber: UnsubscribeIdentity): string {
  const token = encodeURIComponent(unsubscribeToken(subscriber))
  return `${origin}/newsletter/unsubscribe?s=${encodeURIComponent(String(subscriber.id))}&t=${token}`
}

export function unsubscribeApiUrl(origin: string, subscriber: UnsubscribeIdentity): string {
  const token = encodeURIComponent(unsubscribeToken(subscriber))
  return `${origin}/api/newsletter/unsubscribe?s=${encodeURIComponent(String(subscriber.id))}&t=${token}`
}
