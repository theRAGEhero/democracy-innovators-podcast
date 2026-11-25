// Process-local courtesy limits for public routes. Production Nginx overwrites
// X-Real-IP from the actual peer; X-Forwarded-For remains a development fallback.
// Expiry work is sampled and each scope is capped, so attacker-controlled key
// cardinality cannot turn every request into a full-map scan.

type Bucket = { count: number; resetAt: number }

const MAX_KEYS_PER_SCOPE = 5_000
const PRUNE_SAMPLE_SIZE = 32
const buckets = new Map<string, Map<string, Bucket>>()

function prune(scope: Map<string, Bucket>, now: number) {
  let checked = 0
  for (const [key, bucket] of scope) {
    if (bucket.resetAt <= now) scope.delete(key)
    checked += 1
    if (checked >= PRUNE_SAMPLE_SIZE) break
  }
}

function trim(scope: Map<string, Bucket>) {
  while (scope.size > MAX_KEYS_PER_SCOPE) {
    const oldest = scope.keys().next().value
    if (oldest === undefined) break
    scope.delete(oldest)
  }
}

export function clientKey(request: Request): string {
  const realIp = request.headers.get('x-real-ip')?.trim()
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return realIp || forwarded || 'unknown'
}

export function isRateLimited(
  request: Request,
  { scope, limit, windowMs }: { scope: string; limit: number; windowMs: number },
): boolean {
  const now = Date.now()
  let bucketsForScope = buckets.get(scope)
  if (!bucketsForScope) {
    bucketsForScope = new Map()
    buckets.set(scope, bucketsForScope)
  }
  prune(bucketsForScope, now)

  const key = clientKey(request)
  const current = bucketsForScope.get(key)
  if (!current || current.resetAt <= now) {
    bucketsForScope.delete(key)
    bucketsForScope.set(key, { count: 1, resetAt: now + windowMs })
    trim(bucketsForScope)
    return false
  }

  current.count += 1
  bucketsForScope.delete(key)
  bucketsForScope.set(key, current)
  return current.count > limit
}

export function clearRateLimits() {
  buckets.clear()
}

export function trackedKeys(scope: string): number {
  return buckets.get(scope)?.size ?? 0
}
