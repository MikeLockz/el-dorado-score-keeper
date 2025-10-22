import { vi } from 'vitest';
import { INITIAL_STATE, type AppState } from '@/lib/state';
import { cleanupDevelopmentGlobals, clearTimeoutsAndIntervals } from './component-lifecycle';

// Import types from jsdom setup
type MockAppState = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;
type ListGamesFn = (typeof import('@/lib/state/io'))['listGames'];
type RestoreGameFn = (typeof import('@/lib/state/io'))['restoreGame'];
type DeleteGameFn = (typeof import('@/lib/state/io'))['deleteGame'];
type NewGameConfirmMock = {
  show: (options?: any) => Promise<boolean>;
};

type RouterStub = ReturnType<typeof import('../setup/jsdom')['createRouter']>;
type ParamsRecord = Record<string, string | string[]>;

/**
 * Creates a clean default app state for tests
 */
function createDefaultAppState(): MockAppState {
  const state = structuredClone(INITIAL_STATE) as AppState;
  return {
    state,
    height: 0,
    ready: true,
    append: vi.fn(async () => 0),
    appendMany: vi.fn(async () => 0),
    isBatchPending: false,
    previewAt: async () => state,
    warnings: [],
    clearWarnings: vi.fn(),
    timeTravelHeight: null,
    setTimeTravelHeight: vi.fn(),
    timeTraveling: false,
    context: { mode: null, gameId: null, scorecardId: null },
  };
}

/**
 * Creates a clean default router for tests
 */
function createDefaultRouter(): RouterStub {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Resets all global state to clean defaults
 */
export function resetGlobalState(): void {
  // Reset app state to clean default
  const cleanAppState = createDefaultAppState();
  (globalThis as any).__setMockAppState(cleanAppState);

  // Reset router to clean default
  const cleanRouter = createDefaultRouter();
  (globalThis as any).__setMockRouter(cleanRouter);

  // Reset params to empty object
  (globalThis as any).__setMockParams({});

  // Clear all timers and intervals
  vi.clearAllTimers();
  clearTimeoutsAndIntervals();

  // Clean development globals
  cleanupDevelopmentGlobals();

  // Clear DOM completely
  document.body.innerHTML = '';
  document.head.innerHTML = '';

  // Reset any global event listeners
  if (document.body) {
    const newBody = document.createElement('body');
    document.body.parentNode?.replaceChild(newBody, document.body);
  }
}

/**
 * Resets all mock implementations to clean defaults
 */
export function resetMockImplementations(): void {
  // Reset app state mock
  const cleanAppState = createDefaultAppState();
  (globalThis as any).__setMockAppState(cleanAppState);

  // Reset router mock
  const cleanRouter = createDefaultRouter();
  (globalThis as any).__setMockRouter(cleanRouter);

  // Reset function mocks
  (globalThis as any).__setNewGameConfirm({ show: async () => true });
  (globalThis as any).__setListGamesMock(vi.fn(async () => []) as ListGamesFn);
  (globalThis as any).__setRestoreGameMock(vi.fn(async () => undefined) as RestoreGameFn);
  (globalThis as any).__setDeleteGameMock(vi.fn(async () => undefined) as DeleteGameFn);

  // Reset fetch mock
  const cleanFetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({}),
    text: async () => '',
  }));
  (globalThis as any).fetch = cleanFetch;

  // Reset params
  (globalThis as any).__setMockParams({});

  // Clear all vi mocks
  vi.clearAllMocks();
}

/**
 * Comprehensive reset of both global state and mocks
 */
export function resetAllState(): void {
  resetGlobalState();
  resetMockImplementations();
}

/**
 * Resets React component tree and DOM
 */
export function resetComponentTree(): void {
  // Unmount any React components
  const reactRoots = document.querySelectorAll('[data-reactroot]');
  reactRoots.forEach(root => {
    root.remove();
  });

  // Clear DOM completely
  document.body.innerHTML = '';
  document.head.innerHTML = '';

  // Create new body element to ensure clean slate
  const newBody = document.createElement('body');
  if (document.body.parentNode) {
    document.body.parentNode.replaceChild(newBody, document.body);
  } else {
    document.appendChild(newBody);
  }

  // Clean up development globals that might be set by components
  cleanupDevelopmentGlobals();
  clearTimeoutsAndIntervals();
}

/**
 * Resets async operations and timers
 */
export function resetAsyncOperations(): void {
  // Clear all Vitest timers
  vi.clearAllTimers();

  // Clear any native timers that might have leaked
  const maxTimeoutId = setTimeout(() => {}, 0);
  for (let i = 1; i <= maxTimeoutId; i++) {
    clearTimeout(i);
    clearInterval(i);
  }

  // Clear any pending microtasks
  vi.runAllTimers();
}

/**
 * Resets browser API mocks to clean state
 */
export function resetBrowserAPIs(): void {
  // Reset fetch mock
  const cleanFetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({}),
    text: async () => '',
  }));
  (globalThis as any).fetch = cleanFetch;

  // Reset any other browser API mocks that might exist
  if ((globalThis as any).__getMockFetch) {
    const mockFetch = (globalThis as any).__getMockFetch();
    mockFetch.mockClear();
  }

  // Restore original fetch if that function exists
  if ((globalThis as any).__restoreOriginalFetch) {
    (globalThis as any).__restoreOriginalFetch();
  }
}

/**
 * Comprehensive cleanup that handles all types of test pollution
 */
export function comprehensiveReset(): void {
  // Reset global state
  resetGlobalState();

  // Reset mocks
  resetMockImplementations();

  // Reset component tree and DOM
  resetComponentTree();

  // Reset async operations
  resetAsyncOperations();

  // Reset browser APIs
  resetBrowserAPIs();

  // Final cleanup of any remaining pollution
  vi.clearAllMocks();
  vi.clearAllTimers();
}

/**
 * Targeted reset for specific test scenarios
 */
export function createTargetedReset(options: {
  resetAppState?: boolean;
  resetMocks?: boolean;
  resetDOM?: boolean;
  resetAsync?: boolean;
  resetBrowserAPIs?: boolean;
}): () => void {
  return () => {
    if (options.resetAppState !== false) {
      const cleanAppState = createDefaultAppState();
      (globalThis as any).__setMockAppState(cleanAppState);
    }

    if (options.resetMocks !== false) {
      resetMockImplementations();
    }

    if (options.resetDOM !== false) {
      resetComponentTree();
    }

    if (options.resetAsync !== false) {
      resetAsyncOperations();
    }

    if (options.resetBrowserAPIs !== false) {
      resetBrowserAPIs();
    }
  };
}

/**
 * Validates that global state is clean (useful for debugging)
 */
export function validateCleanState(): {
  isClean: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check for development globals
  if ((globalThis as any).__START_NEW_GAME__) {
    issues.push('__START_NEW_GAME__ global is set');
  }
  if ((globalThis as any).__clientLogTrack__) {
    issues.push('__clientLogTrack__ global is set');
  }

  // Check DOM pollution
  if (document.body.innerHTML !== '') {
    issues.push(`DOM body is not clean: ${document.body.innerHTML}`);
  }

  // Check for pending timers
  const maxTimeoutId = setTimeout(() => {}, 0);
  if (maxTimeoutId > 1) {
    issues.push(`Pending timers detected (max timeout ID: ${maxTimeoutId})`);
  }

  // Clear the timeout we just created
  clearTimeout(maxTimeoutId);

  return {
    isClean: issues.length === 0,
    issues,
  };
}