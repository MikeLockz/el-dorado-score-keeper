import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';

const routes: Array<{ path: string; screenshot: string }> = [
  { path: '/landing', screenshot: 'landing.png' },
  { path: '/single-player', screenshot: 'single-player.png' },
  { path: '/settings', screenshot: 'settings.png' },
];

test.describe('Styling smoke screenshots', () => {
  for (const { path, screenshot } of routes) {
    test(`${path} baseline screenshot`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.addStyleTag({
        content: '* { transition-duration: 0s !important; animation-duration: 0s !important; }',
      });
      await page.evaluate(() => {
        const root = document.documentElement;
        if (!root.getAttribute('data-theme')) {
          root.setAttribute('data-theme', 'light');
        }
      });
      await expect(page).toHaveScreenshot(screenshot, { fullPage: true });

      if (path === '/landing') {
        const metrics = await page.evaluate(() => {
          const navigation = performance.getEntriesByType('navigation')[0] as
            | PerformanceNavigationTiming
            | undefined;
          const paintEntries = performance.getEntriesByType('paint') as PerformanceEntry[];
          const lcpEntries = performance.getEntriesByType(
            'largest-contentful-paint',
          ) as PerformanceEntry[];
          const layoutShiftEntries = performance.getEntriesByType('layout-shift') as Array<
            PerformanceEntry & { value: number }
          >;

          const paintTimings = Object.fromEntries(
            paintEntries.map((entry) => [entry.name, entry.startTime]),
          );

          return {
            collectedAt: new Date().toISOString(),
            navigation: navigation
              ? {
                  domContentLoaded: navigation.domContentLoadedEventEnd,
                  load: navigation.loadEventEnd,
                  firstByte: navigation.responseStart,
                  transferSize: navigation.transferSize,
                  encodedBodySize: navigation.encodedBodySize,
                  decodedBodySize: navigation.decodedBodySize,
                }
              : null,
            paint: paintTimings,
            largestContentfulPaint: lcpEntries.length
              ? lcpEntries[lcpEntries.length - 1].startTime
              : null,
            cumulativeLayoutShift: layoutShiftEntries.reduce((acc, entry) => acc + entry.value, 0),
          };
        });

        const metricsPath = resolve(
          'docs/migrations/styling/baseline-metrics/landing-web-vitals.json',
        );
        await mkdir(dirname(metricsPath), { recursive: true });
        await writeFile(metricsPath, JSON.stringify(metrics, null, 2));
      }
    });
  }
});
