import 'dotenv/config'

import { rmSync } from 'node:fs'
import { afterAll } from 'vitest'

const testDatabasePath = `/tmp/democracy-innovators-vitest-${process.pid}.db`

// Integration tests must never open or mutate the production SQLite database.
process.env.DATABASE_URL = `file:${testDatabasePath}`
// The temp file starts empty and the committed migrations only ALTER an
// existing schema, so let Payload create the tables here (see payload.config).
process.env.PAYLOAD_SCHEMA_PUSH = 'true'
rmSync(testDatabasePath, { force: true })

afterAll(() => {
  rmSync(testDatabasePath, { force: true })
  rmSync(`${testDatabasePath}-shm`, { force: true })
  rmSync(`${testDatabasePath}-wal`, { force: true })
})
