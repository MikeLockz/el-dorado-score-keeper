import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup/global.ts'],
    // Avoid tinypool shutdown quirks in some environments by using a single worker thread
    pool: 'threads',
    poolOptions: {
      threads: { singleThread: true },
    },
    // Run in a single context and share globals
    isolate: false,
    fileParallelism: false,
    maxConcurrency: 1,
    coverage: {
      provider: 'v8',
      all: true,
      reportsDirectory: './coverage',
      thresholds: {
        lines: 85,
        functions: 80,
        branches: 75,
        statements: 85,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
