import { createClient } from '@libsql/client'

// Whether this instance can actually serve, not merely whether it is running.
//
// This used to return a literal `ok`, which meant a container with an
// unreadable database reported healthy for as long as the process stayed up.
// The one thing that makes this site useless while still answering requests is
// losing the archive, so that is what the check reads.
//
// Worth knowing: Docker healthchecks restart nothing. `unless-stopped` reacts
// to a process exiting, not to an unhealthy report, so this status is only as
// useful as whatever reads it — a monitor, or a watchdog that restarts on
// `unhealthy`.

export const dynamic = 'force-dynamic'

let client: ReturnType<typeof createClient> | null = null

function db() {
  if (!client) client = createClient({ url: process.env.DATABASE_URL || 'file:./runtime/database/payload.db' })
  return client
}

export async function GET() {
  try {
    const result = await db().execute('SELECT count(*) AS n FROM archive_chunks')
    const passages = Number((result.rows[0] as { n?: unknown } | undefined)?.n ?? 0)
    // An empty index is a real failure here: it means the archive is present
    // but unsearchable, which is the state a plain liveness check hides.
    if (!passages) {
      return Response.json({ status: 'degraded', service: 'democracy-innovators-podcast', passages }, { status: 503 })
    }
    return Response.json({ status: 'ok', service: 'democracy-innovators-podcast', passages })
  } catch (error) {
    return Response.json(
      {
        status: 'error',
        service: 'democracy-innovators-podcast',
        error: error instanceof Error ? error.message : 'database unreachable',
      },
      { status: 503 },
    )
  }
}
