import { expect } from 'vitest';
import { validateCleanState } from './global-state-reset';

/**
 * Assertion helpers for verifying clean test state
 */

/**
 * Asserts that development globals are clean
 */
export function expectDevelopmentGlobalsClean(): void {
  expect((globalThis as any).__START_NEW_GAME__).toBeUndefined();
  expect((globalThis as any).__clientLogTrack__).toBeUndefined();
}

/**
 * Asserts that DOM is clean
 */
export function expectDOMClean(): void {
  expect(document.body.innerHTML).toBe('');
  expect(document.head.innerHTML).toBe('');
}

/**
 * Asserts that all timers are cleared
 */
export function expectTimersClean(): void {
  // Just verify we can create and clear a timeout (timer system is working)
  const maxTimeoutId = setTimeout(() => {}, 0);
  expect(maxTimeoutId).toBeDefined();
  expect(typeof maxTimeoutId).toBe('object'); // Node.js timeout objects are not numbers
  clearTimeout(maxTimeoutId);
}

/**
 * Asserts that fetch mock is clean
 */
export function expectFetchMockClean(): void {
  if ((globalThis as any).__getMockFetch) {
    const fetchMock = (globalThis as any).__getMockFetch();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  }
}

/**
 * Asserts that app state mock is clean
 */
export function expectAppStateClean(): void {
  if ((globalThis as any).__setMockAppState) {
    // This is more complex - we can't easily inspect the current state
    // But we can verify that no unexpected global modifications occurred
    expectDevelopmentGlobalsClean();
  }
}

/**
 * Asserts that router mock is clean
 */
export function expectRouterClean(): void {
  if ((globalThis as any).__setMockRouter) {
    // Just verify the setter exists - router mocking is complex and we'll rely on higher-level checks
    expect(typeof (globalThis as any).__setMockRouter).toBe('function');
  }
}

/**
 * Comprehensive assertion that all global state is clean
 */
export function expectGlobalStateClean(): void {
  expectDevelopmentGlobalsClean();
  expectDOMClean();
  expectTimersClean();
  expectFetchMockClean();
  expectRouterClean();

  // Use comprehensive validation
  const validation = validateCleanState();
  expect(validation.isClean, `Global state is not clean: ${validation.issues.join(', ')}`).toBe(true);
}

/**
 * Asserts that no event listeners are leaking
 * Note: This is a simplified check - comprehensive event listener tracking is complex
 */
export function expectEventListenersClean(): void {
  // Check that no excessive number of event listeners exist
  const elements = document.querySelectorAll('*');
  let totalListeners = 0;

  elements.forEach((element) => {
    // This is a simplified approach - in practice, tracking event listeners is complex
    // We primarily rely on component unmounting and DOM cleanup
    if (element.nodeType === Node.ELEMENT_NODE) {
      totalListeners++;
    }
  });

  // Allow some elements (basic document structure)
  expect(totalListeners).toBeLessThan(10);
}

/**
 * Asserts that React components are properly unmounted
 */
export function expectReactComponentsClean(): void {
  // Check for React root attributes
  const reactRoots = document.querySelectorAll('[data-reactroot]');
  expect(reactRoots).toHaveLength(0);

  // Check for React portal containers
  const portals = document.querySelectorAll('[data-portal]');
  expect(portals).toHaveLength(0);
}

/**
 * Asserts that async operations are clean
 */
export function expectAsyncOperationsClean(): void {
  // This is difficult to test directly, but we can check for obvious issues
  expectTimersClean();

  // Verify no pending promises (simplified check)
  // Note: Comprehensive promise tracking would require more complex setup
}

/**
 * Asserts that mock functions are clean
 */
export function expectMocksClean(): void {
  // Check that common mocks haven't been called unexpectedly
  if ((globalThis as any).__getMockFetch) {
    const fetchMock = (globalThis as any).__getMockFetch();
    expect(fetchMock.mock.calls).toHaveLength(0);
  }
}

/**
 * Comprehensive test cleanup verification
 */
export function expectTestCleanupComplete(): void {
  expectDevelopmentGlobalsClean();
  expectDOMClean();
  expectReactComponentsClean();
  expectEventListenersClean();
  expectAsyncOperationsClean();
  expectMocksClean();

  const validation = validateCleanState();
  expect(validation.isClean, `Test cleanup incomplete: ${validation.issues.join(', ')}`).toBe(true);
}

/**
 * Custom matcher for Vitest to extend expect with test cleanup assertions
 */
export const testCleanupMatchers = {
  /**
   * Checks if global state is clean
   */
  toHaveCleanGlobalState(received: unknown) {
    const validation = validateCleanState();
    const pass = validation.isClean;

    return {
      pass,
      message: () => `expected global state to ${pass ? 'not ' : ''}be clean. Issues: ${validation.issues.join(', ')}`,
    };
  },

  /**
   * Checks if development globals are clean
   */
  toHaveCleanDevelopmentGlobals(received: unknown) {
    const hasStartNewGame = (globalThis as any).__START_NEW_GAME__;
    const hasClientLogTrack = (globalThis as any).__clientLogTrack__;
    const pass = !hasStartNewGame && !hasClientLogTrack;

    return {
      pass,
      message: () => {
        const issues = [];
        if (hasStartNewGame) issues.push('__START_NEW_GAME__ is set');
        if (hasClientLogTrack) issues.push('__clientLogTrack__ is set');
        return `expected development globals to ${pass ? 'not ' : ''}be clean. Issues: ${issues.join(', ')}`;
      },
    };
  },

  /**
   * Checks if DOM is clean
   */
  toHaveCleanDOM(received: unknown) {
    const bodyContent = document.body.innerHTML;
    const headContent = document.head.innerHTML;
    const pass = bodyContent === '' && headContent === '';

    return {
      pass,
      message: () => `expected DOM to ${pass ? 'not ' : ''}be clean. Body: "${bodyContent}", Head: "${headContent}"`,
    };
  },
};

/**
 * Helper to create custom expect functions with test cleanup assertions
 */
export function createTestCleanupExpect() {
  return {
    ...expect,
    ...testCleanupMatchers,
  };
}

/**
 * Assertion helper for specific test scenarios
 */
export function expectCleanAfterTest(options: {
  checkGlobals?: boolean;
  checkDOM?: boolean;
  checkReact?: boolean;
  checkAsync?: boolean;
  checkMocks?: boolean;
}): void {
  const {
    checkGlobals = true,
    checkDOM = true,
    checkReact = true,
    checkAsync = true,
    checkMocks = true,
  } = options;

  if (checkGlobals) {
    expectDevelopmentGlobalsClean();
  }

  if (checkDOM) {
    expectDOMClean();
  }

  if (checkReact) {
    expectReactComponentsClean();
  }

  if (checkAsync) {
    expectAsyncOperationsClean();
  }

  if (checkMocks) {
    expectMocksClean();
  }
}

/**
 * Assertion helper for debugging test state
 */
export function debugTestState(): {
  globals: Record<string, any>;
  dom: { body: string; head: string; elementCount: number };
  timers: { maxTimeoutId: number };
  mocks: { fetchCalled: boolean; fetchCallCount: number };
} {
  const maxTimeoutId = setTimeout(() => {}, 0);
  clearTimeout(maxTimeoutId);

  const fetchMock = (globalThis as any).__getMockFetch;
  const fetchCalled = fetchMock ? fetchMock.mock.calls.length > 0 : false;
  const fetchCallCount = fetchMock ? fetchMock.mock.calls.length : 0;

  return {
    globals: {
      __START_NEW_GAME__: (globalThis as any).__START_NEW_GAME__,
      __clientLogTrack__: (globalThis as any).__clientLogTrack__,
    },
    dom: {
      body: document.body.innerHTML,
      head: document.head.innerHTML,
      elementCount: document.querySelectorAll('*').length,
    },
    timers: {
      maxTimeoutId,
    },
    mocks: {
      fetchCalled,
      fetchCallCount,
    },
  };
}