import config from '@payload-config'
import { getPayload } from 'payload'

export type ApiOperation = 'embedding' | 'chat' | 'other'

const MESSAGE_LIMIT = 400

// Shared heuristic for "the provider refused us because of quota/rate limits",
// used both to drive retries and to decide what gets recorded.
export function isRateLimitError(error: unknown): boolean {
  const text =
    error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error ?? '')
  return /\b429\b|quota|rate limit|resource_exhausted/i.test(text)
}

function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Record one rate-limit / quota refusal, aggregated per provider+operation+day.
 * Best-effort: never throws, so callers can fire it from an error path without
 * risking a second failure.
 */
export async function recordApiLimit(event: {
  provider: string
  operation: ApiOperation
  model?: string | null
  status?: number | null
  message?: string | null
}): Promise<void> {
  try {
    const day = dayKey()
    const key = `${event.provider}:${event.operation}:${day}`
    const payload = await getPayload({ config })
    const now = new Date().toISOString()
    const message = (event.message || '').slice(0, MESSAGE_LIMIT) || undefined

    const existing = await payload.find({
      collection: 'api-limits',
      where: { key: { equals: key } },
      limit: 1,
      overrideAccess: true,
    })

    if (existing.docs[0]) {
      const doc = existing.docs[0]
      await payload.update({
        collection: 'api-limits',
        id: doc.id,
        data: {
          count: (doc.count || 0) + 1,
          lastStatus: event.status ?? doc.lastStatus,
          lastMessage: message ?? doc.lastMessage,
          lastAt: now,
        },
        overrideAccess: true,
      })
      return
    }

    await payload.create({
      collection: 'api-limits',
      data: {
        key,
        day,
        provider: event.provider,
        operation: event.operation,
        model: event.model || undefined,
        count: 1,
        lastStatus: event.status ?? undefined,
        lastMessage: message,
        lastAt: now,
      },
      overrideAccess: true,
    })
  } catch {
    // Telemetry must never break the caller.
  }
}
