// One limiter for every public route.
//
// There were three of these, each written slightly differently: the chatbot
// read `x-real-ip` then the *last* `x-forwarded-for` entry, comments read the
// *first*, contact read the last again, and `/api/track` had none at all. None
// of them ever removed an expired entry, so each kept one key per address it
// had ever seen, for the life of the process.
//
// Behind a reverse proxy the client is the first entry `x-forwarded-for`, not
// the last: later entries are the proxies themselves, and a caller can prepend
// whatever it likes. Neither end is trustworthy on its own, which is why this
// is a courtesy limit on honest traffic rather than a security control.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Map<string, Bucket>>()

/** Drop everything already expired. Called on write, so the map cannot outgrow
 *  the number of addresses actually active inside one window. */
function prune(scope: Map<string, Bucket>, now: number) {
  for (const [key, bucket] of scope) {
    if (bucket.resetAt <= now) scope.delete(key)
  }
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * True when this caller has already had its allowance for the window.
 *
 * `scope` separates budgets: a burst of page-view beacons should not use up
 * someone's questions to the assistant.
 */
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
    bucketsForScope.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  current.count += 1
  return current.count > limit
}

/** Test seam, and a way to reset between requests in development. */
export function clearRateLimits() {
  buckets.clear()
}

/** How many addresses are being tracked right now, for the test that proves
 *  expired entries are actually released. */
export function trackedKeys(scope: string): number {
  return buckets.get(scope)?.size ?? 0
}
