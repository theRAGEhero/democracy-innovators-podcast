import 'dotenv/config'

import { rmSync } from 'node:fs'
import { afterAll } from 'vitest'

const testDatabasePath = `/tmp/democracy-innovators-vitest-${process.pid}.db`

// Integration tests must never open or mutate the production SQLite database.
process.env.DATABASE_URL = `file:${testDatabasePath}`
rmSync(testDatabasePath, { force: true })

afterAll(() => {
  rmSync(testDatabasePath, { force: true })
  rmSync(`${testDatabasePath}-shm`, { force: true })
  rmSync(`${testDatabasePath}-wal`, { force: true })
})
