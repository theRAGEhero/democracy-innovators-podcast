// The two capabilities a subscriber link carries, and why they are built
// differently.
//
// CONFIRM is a random secret, stored only as a hash, cleared once used and
// expiring in 48 hours. It exists for one message, so a leaked backup should
// not carry a working confirmation link for anybody.
//
// UNSUBSCRIBE cannot work that way. It ships in every mailing, so the send
// worker has to be able to produce it on demand — and a hash, by construction,
// cannot be turned back into a link. Storing the raw token instead would defeat
// the point of hashing. So it is derived rather than stored: nothing secret sits
// in the database at all, a re-send produces the same link, and verification is
// a keyed recomputation.
//
// The trade-off: changing the secret invalidates every unsubscribe link ever
// emailed, so it belongs in the backup alongside the database. `v1` in the
// message is the seam for rotating it deliberately.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const CONFIRM_TTL_MS = 48 * 60 * 60 * 1000

/** Falls back to PAYLOAD_SECRET so the feature works without new configuration.
 *  Setting NEWSLETTER_TOKEN_SECRET separates the two lifetimes: rotating the
 *  Payload secret logs everyone out, which is a thing you might want to do
 *  without breaking unsubscribe links. */
function tokenSecret(): string | null {
  return process.env.NEWSLETTER_TOKEN_SECRET || process.env.PAYLOAD_SECRET || null
}

export function hashConfirmToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * A fresh confirmation secret and what to store for it.
 *
 * base64url, not hex: shorter, and free of the "+" and "/" that a mail client's
 * link rewriter likes to mangle. 256 bits of CSPRNG output, so there is nothing
 * for a slow KDF to protect — SHA-256 is the right hash here.
 */
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

export function unsubscribeToken(subscriberId: number | string): string {
  const secret = tokenSecret()
  // Refusing loudly is correct: a mailing carrying an unverifiable unsubscribe
  // link is worse than a mailing that does not go out.
  if (!secret) throw new Error('NEWSLETTER_TOKEN_SECRET (or PAYLOAD_SECRET) must be set to build unsubscribe links')
  return createHmac('sha256', secret).update(`unsub:v1:${subscriberId}`).digest('base64url')
}

/** Constant-time, because here we really are comparing a provided string
 *  against a secret we computed. The length check comes first because
 *  timingSafeEqual throws on a mismatch, and a fixed-size digest's length is
 *  public anyway. */
export function verifyUnsubscribeToken(subscriberId: number | string, provided: unknown): boolean {
  if (typeof provided !== 'string' || !provided) return false
  if (!tokenSecret()) return false
  const expected = unsubscribeToken(subscriberId)
  if (expected.length !== provided.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}

export function confirmUrl(origin: string, token: string): string {
  return `${origin}/newsletter/confirm?t=${encodeURIComponent(token)}`
}

export function unsubscribeUrl(origin: string, subscriberId: number | string): string {
  const token = encodeURIComponent(unsubscribeToken(subscriberId))
  return `${origin}/newsletter/unsubscribe?s=${encodeURIComponent(String(subscriberId))}&t=${token}`
}

/** The one-click target a mail client POSTs to, per RFC 8058. Separate from the
 *  page above, which only ever renders a button. */
export function unsubscribeApiUrl(origin: string, subscriberId: number | string): string {
  const token = encodeURIComponent(unsubscribeToken(subscriberId))
  return `${origin}/api/newsletter/unsubscribe?s=${encodeURIComponent(String(subscriberId))}&t=${token}`
}
