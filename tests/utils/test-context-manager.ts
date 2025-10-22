import { render, RenderOptions, RenderResult } from '@testing-library/react';
import React from 'react';
import { vi, describe, beforeEach, afterEach } from 'vitest';
import { INITIAL_STATE, type AppState, type KnownAppEvent } from '@/lib/state';
import { cleanupDevelopmentGlobals, clearTimeoutsAndIntervals } from './component-lifecycle';

// Import mock types from jsdom setup
type MockAppState = ReturnType<(typeof import('@/components/state-provider'))['useAppState']>;
type ListGamesFn = (typeof import('@/lib/state/io'))['listGames'];
type RestoreGameFn = (typeof import('@/lib/state/io'))['restoreGame'];
type DeleteGameFn = (typeof import('@/lib/state/io'))['deleteGame'];
type NewGameConfirmMock = {
  show: (options?: any) => Promise<boolean>;
};

type RouterStub = ReturnType<typeof import('../setup/jsdom')['createRouter']>;
type ParamsRecord = Record<string, string | string[]>;

export interface TestContext {
  appState: MockAppState;
  router: RouterStub;
  params: ParamsRecord;
  mocks: {
    listGames: ListGamesFn;
    restoreGame: RestoreGameFn;
    deleteGame: DeleteGameFn;
    newGameConfirm: NewGameConfirmMock;
    fetch: ReturnType<typeof vi.fn>;
  };
  cleanup: () => void;
  render: (ui: React.ReactElement, options?: RenderOptions) => RenderResult;
  setAppState: (state: AppState, overrides?: Partial<MockAppState>) => void;
}

export function createTestContext(overrides?: Partial<TestContext>): TestContext {
  // Create default app state
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

  // Create default router
  function createRouter(): RouterStub {
    return {
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      forward: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn().mockResolvedValue(undefined),
    };
  }

  // Initialize context with defaults
  const appState = createDefaultAppState();
  const router = createRouter();
  const params: ParamsRecord = {};

  // Create default mocks
  const mocks = {
    listGames: vi.fn(async () => []) as ListGamesFn,
    restoreGame: vi.fn(async () => undefined) as RestoreGameFn,
    deleteGame: vi.fn(async () => undefined) as DeleteGameFn,
    newGameConfirm: { show: async () => true } as NewGameConfirmMock,
    fetch: vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    })) as ReturnType<typeof vi.fn>,
  };

  // Apply overrides
  if (overrides?.appState) {
    Object.assign(appState, overrides.appState);
  }
  if (overrides?.router) {
    Object.assign(router, overrides.router);
  }
  if (overrides?.params) {
    Object.assign(params, overrides.params);
  }
  if (overrides?.mocks) {
    Object.assign(mocks, overrides.mocks);
  }

  // Set global references for components that access them
  (globalThis as any).__setMockAppState(appState);
  (globalThis as any).__setMockRouter(router);
  (globalThis as any).__setMockParams(params);
  (globalThis as any).__setNewGameConfirm(mocks.newGameConfirm);
  (globalThis as any).__setListGamesMock(mocks.listGames);
  (globalThis as any).__setRestoreGameMock(mocks.restoreGame);
  (globalThis as any).__setDeleteGameMock(mocks.deleteGame);
  (globalThis as any).fetch = mocks.fetch;

  let renderResults: RenderResult[] = [];

  // Enhanced render function that tracks renders for cleanup
  function enhancedRender(ui: React.ReactElement, options?: RenderOptions): RenderResult {
    const result = renderFunction(ui, options);
    renderResults.push(result);
    return result;
  }

  function renderFunction(ui: React.ReactElement, options?: RenderOptions): RenderResult {
    const result = render(ui, options);

    // Enhanced cleanup for each render
    const originalUnmount = result.unmount;
    result.unmount = () => {
      originalUnmount();
      cleanupDevelopmentGlobals();
      clearTimeoutsAndIntervals();
    };

    return result;
  }

  // Comprehensive cleanup function
  function cleanup(): void {
    // Unmount all rendered components
    renderResults.forEach(result => {
      try {
        result.unmount();
      } catch (error) {
        console.warn('Error during component unmount:', error);
      }
    });
    renderResults = [];

    // Clean up global state
    cleanupDevelopmentGlobals();
    clearTimeoutsAndIntervals();
    vi.clearAllTimers();
    vi.clearAllMocks();

    // Clear DOM
    document.body.innerHTML = '';

    // Reset global references to clean defaults
    const cleanAppState = createDefaultAppState();
    const cleanRouter = createRouter();
    const cleanParams: ParamsRecord = {};

    (globalThis as any).__setMockAppState(cleanAppState);
    (globalThis as any).__setMockRouter(cleanRouter);
    (globalThis as any).__setMockParams(cleanParams);
    (globalThis as any).__setNewGameConfirm({ show: async () => true });
    (globalThis as any).__setListGamesMock(vi.fn(async () => []) as ListGamesFn);
    (globalThis as any).__setRestoreGameMock(vi.fn(async () => undefined) as RestoreGameFn);
    (globalThis as any).__setDeleteGameMock(vi.fn(async () => undefined) as DeleteGameFn);

    const cleanFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    }));
    (globalThis as any).fetch = cleanFetch;
  }

  function setAppState(state: AppState, stateOverrides: Partial<MockAppState> = {}): void {
    const newAppState = {
      ...appState,
      state,
      ...stateOverrides,
    };
    Object.assign(appState, newAppState);
    (globalThis as any).__setMockAppState(appState);
  }

  return {
    appState,
    router,
    params,
    mocks,
    cleanup,
    render: enhancedRender,
    setAppState,
  };
}

export function withTestContext<T>(testFn: (context: TestContext) => T): T {
  const context = createTestContext();

  try {
    return testFn(context);
  } finally {
    context.cleanup();
  }
}

/**
 * Higher-order function for describe blocks that automatically manages test context
 */
export function describeWithTestContext(name: string, fn: (getContext: () => TestContext) => void) {
  describe(name, () => {
    let context: TestContext;

    beforeEach(() => {
      context = createTestContext();
    });

    afterEach(() => {
      context.cleanup();
    });

    fn(() => context);
  });
}

/**
 * Helper for creating test contexts with custom app state
 */
export function createTestContextWithAppState(
  state: AppState,
  overrides?: Partial<TestContext>
): TestContext {
  return createTestContext({
    appState: {
      ...createTestContext().appState,
      state,
      ...overrides?.appState,
    },
    ...overrides,
  });
}

/**
 * Helper for creating test contexts with custom mocks
 */
export function createTestContextWithMocks(
  mocks: Partial<TestContext['mocks']>,
  overrides?: Partial<TestContext>
): TestContext {
  return createTestContext({
    mocks: {
      ...createTestContext().mocks,
      ...mocks,
    },
    ...overrides,
  });
}