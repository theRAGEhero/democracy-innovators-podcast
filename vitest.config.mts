import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Every spec that boots Payload builds the whole schema into a fresh temp
    // database, because push is off for the real one and the temp one starts
    // empty. That costs ~20-30s per worker, and with the files running in
    // parallel the 10s default hook budget simply loses the race — which is
    // what made api.int.spec.ts fail intermittently for months while passing
    // whenever it was run on its own.
    hookTimeout: 180_000,
    testTimeout: 60_000,
  },
})
