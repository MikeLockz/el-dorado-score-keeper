import { vi } from 'vitest';
import { captureDevelopmentGlobals } from './component-lifecycle';

/**
 * Global state monitoring utilities for detecting test pollution and leaks
 */

interface GlobalStateSnapshot {
  timestamp: number;
  testName?: string;
  appState: {
    exists: boolean;
    state: any;
    height: number;
    ready: boolean;
    isBatchPending: boolean;
  };
  router: {
    exists: boolean;
    pushCalls: number;
    replaceCalls: number;
    refreshCalls: number;
  };
  params: {
    exists: boolean;
    paramCount: number;
    keys: string[];
  };
  developmentGlobals: {
    __START_NEW_GAME__: any;
    __clientLogTrack__: any;
  };
  dom: {
    bodyHTML: string;
    headHTML: string;
    elementCount: number;
    reactRoots: number;
  };
  timers: {
    maxTimeoutId: number;
    activeTimeouts: number;
  };
  mocks: {
    fetchCalls: number;
    fetchMockExists: boolean;
  };
  eventListeners: {
    estimatedCount: number;
    elementsWithListeners: number;
  };
}

interface StateLeakReport {
  testName: string;
  leaked: boolean;
  changes: {
    appState: boolean;
    router: boolean;
    params: boolean;
    developmentGlobals: boolean;
    dom: boolean;
    timers: boolean;
    mocks: boolean;
    eventListeners: boolean;
  };
  before: GlobalStateSnapshot;
  after: GlobalStateSnapshot;
  details: string[];
}

/**
 * Creates a global state monitor for tracking test pollution
 */
export function createGlobalStateMonitor() {
  const snapshots: GlobalStateSnapshot[] = [];
  const reports: StateLeakReport[] = [];

  function captureSnapshot(testName?: string): GlobalStateSnapshot {
    const maxTimeoutId = setTimeout(() => {}, 0);
    clearTimeout(maxTimeoutId);

    // Get app state reference
    let appStateInfo = { exists: false, state: null, height: 0, ready: false, isBatchPending: false };
    try {
      // Try to access the current app state through the global setter
      const mockAppState = (globalThis as any).__setMockAppState;
      if (mockAppState) {
        // This is tricky - we can't easily get the current state
        // So we'll just check if the setter exists
        appStateInfo.exists = true;
      }
    } catch (error) {
      // Can't access app state
    }

    // Get router state
    let routerInfo = { exists: false, pushCalls: 0, replaceCalls: 0, refreshCalls: 0 };
    try {
      const routerRef = (globalThis as any).__setMockRouter;
      if (routerRef) {
        routerInfo.exists = true;
        // Try to get mock calls if possible
        const mockRouter = routerRef({});
        if (mockRouter && mockRouter.push) {
          routerInfo.pushCalls = mockRouter.push.mock?.calls?.length || 0;
          routerInfo.replaceCalls = mockRouter.replace.mock?.calls?.length || 0;
          routerInfo.refreshCalls = mockRouter.refresh.mock?.calls?.length || 0;
        }
      }
    } catch (error) {
      // Can't access router
    }

    // Get params state
    let paramsInfo = { exists: false, paramCount: 0, keys: [] as string[] };
    try {
      const paramsRef = (globalThis as any).__setMockParams;
      if (paramsRef) {
        paramsInfo.exists = true;
        const params = paramsRef({});
        if (params) {
          paramsInfo.paramCount = Object.keys(params).length;
          paramsInfo.keys = Object.keys(params);
        }
      }
    } catch (error) {
      // Can't access params
    }

    // Get development globals
    const devGlobals = captureDevelopmentGlobals();

    // Get DOM state
    const bodyHTML = document.body.innerHTML;
    const headHTML = document.head.innerHTML;
    const elementCount = document.querySelectorAll('*').length;
    const reactRoots = document.querySelectorAll('[data-reactroot]').length;

    // Get mock state
    let mockInfo = { fetchCalls: 0, fetchMockExists: false };
    try {
      const fetchMock = (globalThis as any).__getMockFetch;
      if (fetchMock) {
        mockInfo.fetchMockExists = true;
        mockInfo.fetchCalls = fetchMock.mock?.calls?.length || 0;
      }
    } catch (error) {
      // Can't access fetch mock
    }

    // Estimate event listeners (simplified)
    const elementsWithListeners = document.querySelectorAll('*').length;
    const estimatedCount = elementsWithListeners; // Rough estimate

    const snapshot: GlobalStateSnapshot = {
      timestamp: Date.now(),
      testName,
      appState: appStateInfo,
      router: routerInfo,
      params: paramsInfo,
      developmentGlobals: devGlobals,
      dom: {
        bodyHTML,
        headHTML,
        elementCount,
        reactRoots,
      },
      timers: {
        maxTimeoutId,
        activeTimeouts: maxTimeoutId > 1 ? maxTimeoutId - 1 : 0,
      },
      mocks: mockInfo,
      eventListeners: {
        estimatedCount,
        elementsWithListeners,
      },
    };

    snapshots.push(snapshot);
    return snapshot;
  }

  function compareSnapshots(before: GlobalStateSnapshot, after: GlobalStateSnapshot): StateLeakReport {
    const testName = after.testName || before.testName || 'Unknown Test';

    const changes = {
      appState: compareAppState(before.appState, after.appState),
      router: compareRouter(before.router, after.router),
      params: compareParams(before.params, after.params),
      developmentGlobals: compareDevelopmentGlobals(before.developmentGlobals, after.developmentGlobals),
      dom: compareDOM(before.dom, after.dom),
      timers: compareTimers(before.timers, after.timers),
      mocks: compareMocks(before.mocks, after.mocks),
      eventListeners: compareEventListeners(before.eventListeners, after.eventListeners),
    };

    const leaked = Object.values(changes).some(Boolean);
    const details = generateLeakDetails(before, after, changes);

    const report: StateLeakReport = {
      testName,
      leaked,
      changes,
      before,
      after,
      details,
    };

    reports.push(report);
    return report;
  }

  function compareAppState(before: GlobalStateSnapshot['appState'], after: GlobalStateSnapshot['appState']): boolean {
    return (
      before.exists !== after.exists ||
      before.height !== after.height ||
      before.ready !== after.ready ||
      before.isBatchPending !== after.isBatchPending
    );
  }

  function compareRouter(before: GlobalStateSnapshot['router'], after: GlobalStateSnapshot['router']): boolean {
    return (
      before.exists !== after.exists ||
      before.pushCalls !== after.pushCalls ||
      before.replaceCalls !== after.replaceCalls ||
      before.refreshCalls !== after.refreshCalls
    );
  }

  function compareParams(before: GlobalStateSnapshot['params'], after: GlobalStateSnapshot['params']): boolean {
    return (
      before.exists !== after.exists ||
      before.paramCount !== after.paramCount ||
      JSON.stringify(before.keys.sort()) !== JSON.stringify(after.keys.sort())
    );
  }

  function compareDevelopmentGlobals(
    before: GlobalStateSnapshot['developmentGlobals'],
    after: GlobalStateSnapshot['developmentGlobals']
  ): boolean {
    return (
      before.__START_NEW_GAME__ !== after.__START_NEW_GAME__ ||
      before.__clientLogTrack__ !== after.__clientLogTrack__
    );
  }

  function compareDOM(before: GlobalStateSnapshot['dom'], after: GlobalStateSnapshot['dom']): boolean {
    return (
      before.bodyHTML !== after.bodyHTML ||
      before.headHTML !== after.headHTML ||
      before.elementCount !== after.elementCount ||
      before.reactRoots !== after.reactRoots
    );
  }

  function compareTimers(before: GlobalStateSnapshot['timers'], after: GlobalStateSnapshot['timers']): boolean {
    return before.activeTimeouts !== after.activeTimeouts;
  }

  function compareMocks(before: GlobalStateSnapshot['mocks'], after: GlobalStateSnapshot['mocks']): boolean {
    return before.fetchCalls !== after.fetchCalls || before.fetchMockExists !== after.fetchMockExists;
  }

  function compareEventListeners(
    before: GlobalStateSnapshot['eventListeners'],
    after: GlobalStateSnapshot['eventListeners']
  ): boolean {
    return before.estimatedCount !== after.estimatedCount;
  }

  function generateLeakDetails(
    before: GlobalStateSnapshot,
    after: GlobalStateSnapshot,
    changes: StateLeakReport['changes']
  ): string[] {
    const details: string[] = [];

    if (changes.appState) {
      details.push('App state changed');
    }
    if (changes.router) {
      details.push(`Router calls changed (push: ${before.router.pushCalls}→${after.router.pushCalls}, replace: ${before.router.replaceCalls}→${after.router.replaceCalls})`);
    }
    if (changes.params) {
      details.push(`Params changed (${before.params.paramCount}→${after.params.paramCount} params)`);
    }
    if (changes.developmentGlobals) {
      const devGlobals = [];
      if (before.developmentGlobals.__START_NEW_GAME__ !== after.developmentGlobals.__START_NEW_GAME__) {
        devGlobals.push('__START_NEW_GAME__');
      }
      if (before.developmentGlobals.__clientLogTrack__ !== after.developmentGlobals.__clientLogTrack__) {
        devGlobals.push('__clientLogTrack__');
      }
      details.push(`Development globals changed: ${devGlobals.join(', ')}`);
    }
    if (changes.dom) {
      details.push(`DOM changed (elements: ${before.dom.elementCount}→${after.dom.elementCount}, react roots: ${before.dom.reactRoots}→${after.dom.reactRoots})`);
    }
    if (changes.timers) {
      details.push(`Active timers changed (${before.timers.activeTimeouts}→${after.timers.activeTimeouts})`);
    }
    if (changes.mocks) {
      details.push(`Mock calls changed (fetch: ${before.mocks.fetchCalls}→${after.mocks.fetchCalls})`);
    }
    if (changes.eventListeners) {
      details.push(`Event listeners changed (${before.eventListeners.estimatedCount}→${after.eventListeners.estimatedCount})`);
    }

    return details;
  }

  function verifyNoLeaks(testName?: string): boolean {
    if (snapshots.length < 2) {
      return true; // Not enough data to detect leaks
    }

    const before = snapshots[snapshots.length - 2];
    const after = snapshots[snapshots.length - 1];

    if (testName) {
      after.testName = testName;
    }

    const report = compareSnapshots(before, after);

    if (report.leaked) {
      console.warn(`⚠️  Test pollution detected in "${report.testName}":`, report.details);
      return false;
    }

    return true;
  }

  function generateReport(): string {
    if (reports.length === 0) {
      return 'No test reports available';
    }

    const totalTests = reports.length;
    const leakedTests = reports.filter(r => r.leaked).length;
    const cleanTests = totalTests - leakedTests;

    let report = `📊 Global State Monitor Report\n`;
    report += `Total tests monitored: ${totalTests}\n`;
    report += `Clean tests: ${cleanTests}\n`;
    report += `Tests with leaks: ${leakedTests}\n`;
    report += `Clean rate: ${((cleanTests / totalTests) * 100).toFixed(1)}%\n\n`;

    if (leakedTests > 0) {
      report += `🚨 Tests with pollution:\n`;
      reports
        .filter(r => r.leaked)
        .forEach(r => {
          report += `  ❌ ${r.testName}: ${r.details.join(', ')}\n`;
        });
    }

    // Analyze common leak patterns
    const leakTypes = analyzeLeakPatterns();
    if (Object.keys(leakTypes).length > 0) {
      report += `\n🔍 Common leak patterns:\n`;
      Object.entries(leakTypes).forEach(([type, count]) => {
        report += `  ${type}: ${count} occurrences\n`;
      });
    }

    return report;
  }

  function analyzeLeakPatterns(): Record<string, number> {
    const patterns: Record<string, number> = {};

    reports.forEach(report => {
      if (report.changes.developmentGlobals) {
        patterns['Development globals'] = (patterns['Development globals'] || 0) + 1;
      }
      if (report.changes.dom) {
        patterns['DOM pollution'] = (patterns['DOM pollution'] || 0) + 1;
      }
      if (report.changes.timers) {
        patterns['Timer leaks'] = (patterns['Timer leaks'] || 0) + 1;
      }
      if (report.changes.mocks) {
        patterns['Mock state'] = (patterns['Mock state'] || 0) + 1;
      }
      if (report.changes.router) {
        patterns['Router calls'] = (patterns['Router calls'] || 0) + 1;
      }
    });

    return patterns;
  }

  function clearSnapshots(): void {
    snapshots.length = 0;
  }

  function clearReports(): void {
    reports.length = 0;
  }

  function reset(): void {
    clearSnapshots();
    clearReports();
  }

  function getLatestSnapshot(): GlobalStateSnapshot | null {
    return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  }

  function getAllReports(): StateLeakReport[] {
    return [...reports];
  }

  return {
    captureSnapshot,
    verifyNoLeaks,
    generateReport,
    analyzeLeakPatterns,
    clearSnapshots,
    clearReports,
    reset,
    getLatestSnapshot,
    getAllReports,
    get snapshots() { return [...snapshots]; },
    get reports() { return [...reports]; },
  };
}

/**
 * Global monitor instance for easy access across tests
 */
export const globalStateMonitor = createGlobalStateMonitor();

/**
 * Higher-order function to wrap tests with monitoring
 */
export function withStateMonitoring<T>(testName: string, testFn: () => T): T {
  globalStateMonitor.captureSnapshot(`${testName} - before`);

  try {
    const result = testFn();
    globalStateMonitor.captureSnapshot(`${testName} - after`);
    globalStateMonitor.verifyNoLeaks(testName);
    return result;
  } catch (error) {
    globalStateMonitor.captureSnapshot(`${testName} - error`);
    throw error;
  }
}

/**
 * Vitest extension to add global state monitoring to describe blocks
 */
export function describeWithMonitoring(name: string, fn: () => void) {
  describe(name, () => {
    beforeEach(() => {
      globalStateMonitor.captureSnapshot();
    });

    afterEach(() => {
      globalStateMonitor.captureSnapshot();
      globalStateMonitor.verifyNoLeaks();
    });

    fn();
  });
}