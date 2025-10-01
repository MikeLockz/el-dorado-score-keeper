import { defineConfig } from 'vitest/config';
import path from 'path';

const sharedTestOptions = {
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
} as const;

const coverageConfig = {
  provider: 'v8',
  all: true,
  include: ['lib/state/**/*.ts'],
  exclude: ['**/*.d.ts', 'lib/state/selectors.ts', 'lib/state/types.ts', 'lib/state/io.ts'],
  reportsDirectory: './coverage',
  thresholds: {
    lines: 85,
    functions: 65,
    branches: 80,
    statements: 85,
  },
} as const;

export default defineConfig({
  test: {
    coverage: coverageConfig,
    projects: [
      {
        extends: true,
        test: {
          ...sharedTestOptions,
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          ...sharedTestOptions,
          name: 'jsdom',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx', 'tests/**/*.test.jsx'],
          setupFiles: [...sharedTestOptions.setupFiles, 'tests/setup/jsdom.ts'],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
