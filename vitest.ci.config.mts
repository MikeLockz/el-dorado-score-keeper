/**
 * Vitest Configuration for CI/CD Environments
 *
 * This configuration is optimized for CI/CD execution with:
 * - Parallel execution enabled
 * - Smart caching for dependencies
 * - Enhanced reporting
 * - Retry logic integration
 * - Performance monitoring
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

// CI-optimized test options
const ciTestOptions = {
  setupFiles: ['tests/setup/global.ts', 'tests/setup/ci.ts'],

  // Enable parallel execution in CI
  pool: 'threads',
  poolOptions: {
    threads: {
      singleThread: false,
      isolate: false,
    },
  },
  fileParallelism: true,
  maxConcurrency: 4, // Adjust based on CI runner resources

  // Smart caching
  cache: {
    dir: '.vitest-cache',
  },

  // Enhanced reporting for CI
  reporters: ['default', 'github-actions', 'json', 'junit'],
  outputFile: {
    json: './test-results.json',
    junit: './test-results.xml',
  },

  // Retry logic for flaky tests
  retry: 2,
  hookTimeout: 30000,

  // Performance settings
  testTimeout: 10000,
  hookTimeout: 10000,

  // Coverage settings for CI
  coverage: {
    provider: 'v8',
    all: true,
    include: ['lib/state/**/*.ts', 'lib/components/**/*.ts', 'lib/utils/**/*.ts'],
    exclude: [
      '**/*.d.ts',
      'lib/state/selectors.ts',
      'lib/state/types.ts',
      'lib/state/io.ts',
      'tests/**/*',
      'vitest.config.*',
      'playwright.config.*',
    ],
    reportsDirectory: './coverage',
    thresholds: {
      lines: 85,
      functions: 65,
      branches: 80,
      statements: 85,
    },
  },

  // CI-specific globals
  globals: {
    __CI__: true,
    __COVERAGE__: true,
  },

  // Test environment optimization
  environment: 'jsdom',
  environmentOptions: {
    jsdom: {
      resources: 'usable',
      runScripts: 'dangerously',
    },
  },
} as const;

export default defineConfig({
  test: {
    ...ciTestOptions,
    projects: [
      {
        // Node.js tests (unit tests, logic tests)
        extends: true,
        test: {
          ...ciTestOptions,
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: [
            'tests/integration/**/*.test.tsx',
            'tests/ui/**/*.test.tsx',
            'tests/playwright/**/*',
          ],
          // Node.js specific settings
          globalSetup: ['./tests/setup/node.global.ts'],
          teardownTimeout: 5000,
        },
      },
      {
        // Browser tests (integration tests, UI tests)
        extends: true,
        test: {
          ...ciTestOptions,
          name: 'jsdom',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx', 'tests/**/*.test.jsx'],
          exclude: ['tests/playwright/**/*'],
          // Browser-specific settings
          setupFiles: ['tests/setup/global.ts', 'tests/setup/jsdom.ts', 'tests/setup/ci.ts'],
          globalSetup: ['./tests/setup/jsdom.global.ts'],
          teardownTimeout: 10000,

          // Browser optimization
          environmentOptions: {
            jsdom: {
              resources: 'usable',
              runScripts: 'dangerously',
              url: 'http://localhost:3000',
            },
          },
        },
      },
    ],
  },

  // Define task configuration for different CI scenarios
  test: {
    // Default test command
    globals: true,
    watch: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/playwright/**/*', '**/node_modules/**', '**/dist/**', '**/.next/**'],
    passWithNoTests: true,
  },

  // Coverage-specific configuration
  coverage: {
    reporter: ['text', 'json', 'html', 'lcov'],
    reporterOptions: {
      html: { subdir: 'html-report' },
      lcov: { file: 'coverage/lcov.info' },
    },
  },
});
