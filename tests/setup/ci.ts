/**
 * CI Environment Setup
 *
 * This setup file configures the test environment for CI/CD execution,
 * including performance monitoring, failure diagnostics, and retry logic.
 */

import { vi } from 'vitest';

// CI-specific environment detection
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

// Performance monitoring setup
if (isCI) {
  // Enable performance monitoring
  globalThis.__PERFORMANCE_MONITORING__ = true;

  // Configure test performance tracking
  const startTestTime = new Map<string, number>();
  const testMetrics = new Map<
    string,
    {
      startTime: number;
      endTime: number;
      memoryBefore: number;
      memoryAfter: number;
      attempt: number;
    }
  >();

  // Hook into test lifecycle for performance tracking
  const originalDescribe = global.describe;
  const originalIt = global.it;

  global.describe = (name: string, fn: any) => {
    return originalDescribe(name, (...args: any) => {
      const suiteName = name;

      const wrappedFn = () => {
        // Track suite start time
        const suiteStartTime = performance.now();

        const result = fn(...args);

        // Report suite performance
        const suiteEndTime = performance.now();
        console.log(
          `⏱️  Suite "${suiteName}" completed in ${((suiteEndTime - suiteStartTime) / 1000).toFixed(2)}s`,
        );

        return result;
      };

      return originalDescribe(name, wrappedFn);
    });
  };

  global.it = (name: string, fn: any, timeout?: number) => {
    return originalIt(
      name,
      async (...args: any) => {
        const testName = `${global.describe?.name || 'unknown'}: ${name}`;
        const attempt = testMetrics.get(testName)?.attempt || 1;

        // Start performance tracking
        const startTime = performance.now();
        const memoryBefore = getMemoryUsage();
        startTestTime.set(testName, startTime);

        try {
          // Execute test
          const result = await fn(...args);

          // Record successful execution
          const endTime = performance.now();
          const memoryAfter = getMemoryUsage();

          testMetrics.set(testName, {
            startTime,
            endTime,
            memoryBefore,
            memoryAfter,
            attempt,
          });

          const duration = endTime - startTime;
          const memoryDelta = memoryAfter - memoryBefore;

          // Log performance metrics for slow tests
          if (duration > 5000) {
            console.warn(`⚠️  Slow test detected: ${testName} (${(duration / 1000).toFixed(2)}s)`);
          }

          if (memoryDelta > 10 * 1024 * 1024) {
            // 10MB
            console.warn(
              `⚠️  High memory usage: ${testName} (${(memoryDelta / 1024 / 1024).toFixed(2)}MB)`,
            );
          }

          return result;
        } catch (error) {
          // Record failed execution
          const endTime = performance.now();
          const memoryAfter = getMemoryUsage();

          testMetrics.set(testName, {
            startTime,
            endTime,
            memoryBefore,
            memoryAfter,
            attempt,
          });

          // Add performance context to error
          (error as any).performanceContext = {
            duration: endTime - startTime,
            memoryDelta: memoryAfter - memoryBefore,
            attempt,
          };

          throw error;
        }
      },
      timeout,
    );
  };
}

// Get memory usage (approximation)
function getMemoryUsage(): number {
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    return (performance as any).memory.usedJSHeapSize;
  }
  return 0;
}

// CI-specific global configuration
if (isCI) {
  // Set CI-specific environment variables
  process.env.NODE_ENV = 'test';
  process.env.TZ = 'UTC';

  // Disable animations and other performance-harming features
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('requestIdleCallback', vi.fn());

  // Disable IntersectionObserver for performance
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
  );

  // Mock ResizeObserver for performance
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
  );

  // Console performance warnings
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    originalConsoleError(...args);

    // Log stack traces for debugging
    if (args[0] instanceof Error) {
      console.error('Stack trace:', args[0].stack);
    }
  };

  // Performance monitoring hooks
  beforeAll(() => {
    console.log('🚀 CI Test Environment Initialized');
    console.log(`   Node Version: ${process.version}`);
    console.log(`   Platform: ${process.platform}`);
    console.log(`   Memory Available: ${(require('os').freemem() / 1024 / 1024).toFixed(2)}MB`);
  });

  afterAll(() => {
    console.log('✅ CI Test Environment Cleanup');

    // Report final performance summary
    const allMetrics = Array.from(testMetrics.values());
    if (allMetrics.length > 0) {
      const totalDuration = allMetrics.reduce((sum, m) => sum + (m.endTime - m.startTime), 0);
      const totalMemoryDelta = allMetrics.reduce(
        (sum, m) => sum + (m.memoryAfter - m.memoryBefore),
        0,
      );
      const averageDuration = totalDuration / allMetrics.length;
      const maxDuration = Math.max(...allMetrics.map((m) => m.endTime - m.startTime));

      console.log('📊 Performance Summary:');
      console.log(`   Total Tests: ${allMetrics.length}`);
      console.log(`   Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
      console.log(`   Average Duration: ${(averageDuration / 1000).toFixed(2)}s`);
      console.log(`   Max Duration: ${(maxDuration / 1000).toFixed(2)}s`);
      console.log(`   Total Memory Delta: ${(totalMemoryDelta / 1024 / 1024).toFixed(2)}MB`);
    }
  });
}

// Cleanup utilities for test isolation
beforeEach(() => {
  // Clear any pending timers
  const maxTimeoutId = setTimeout(() => {}, 0);
  for (let i = 1; i <= maxTimeoutId; i++) {
    clearTimeout(i);
  }

  const maxIntervalId = setInterval(() => {}, 1000000);
  for (let i = 1; i <= maxIntervalId; i++) {
    clearInterval(i);
  }

  // Clear mock storage
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }
});

afterEach(() => {
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
});

// Export CI utilities for use in tests
export const CIUtils = {
  isCI: () => isCI,
  getTestMetrics: () => Array.from(testMetrics.values()),
  getTestMetric: (testName: string) => testMetrics.get(testName),
  clearTestMetrics: () => testMetrics.clear(),
};
