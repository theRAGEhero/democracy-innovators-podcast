import config from '@payload-config'
import { createClient } from '@libsql/client'
import { getPayload } from 'payload'

import { hashConfirmToken } from '@/lib/newsletter-tokens'

export type ConfirmationOutcome = 'confirmed' | 'spent' | 'expired'

export async function confirmSubscription(token: string | undefined): Promise<ConfirmationOutcome> {
  if (!token) return 'spent'

  const payload = await getPayload({ config })
  const found = await payload.find({
    collection: 'newsletter-subscribers',
    where: { confirmTokenHash: { equals: hashConfirmToken(token) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const subscriber = found.docs[0]
  if (!subscriber) return 'spent'

  const expiresAt = subscriber.confirmTokenExpiresAt
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return 'expired'

  const now = new Date().toISOString()
  const client = createClient({ url: process.env.DATABASE_URL || 'file:./runtime/database/payload.db' })
  try {
    const result = await client.execute({
      sql: `UPDATE newsletter_subscribers
            SET status = 'confirmed', confirmed_at = ?, consent_at = ?,
                confirm_token_hash = NULL, confirm_token_expires_at = NULL, updated_at = ?
            WHERE id = ? AND confirm_token_hash = ? AND status = 'pending'`,
      args: [now, subscriber.consentAt || now, now, subscriber.id, hashConfirmToken(token)],
    })
    return result.rowsAffected === 1 ? 'confirmed' : 'spent'
  } finally {
    client.close()
  }
}
