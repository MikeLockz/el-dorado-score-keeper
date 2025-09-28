import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 60_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['html', { outputFolder: 'coverage/playwright-report', open: 'never' }], ['list']]
    : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100',
    headless: true,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  },
  webServer: {
    command: process.env.PLAYWRIGHT_WEB_SERVER ?? 'pnpm exec next dev --port 3100',
    port: 3100,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
