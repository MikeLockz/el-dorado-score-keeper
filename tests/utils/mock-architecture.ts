/**
 * Enhanced mock architecture that works with production development patterns.
 *
 * This provides mock management that doesn't interfere with production
 * debugging features and global state management.
 */

import { vi } from 'vitest';
import {
  captureDevelopmentGlobals,
  restoreDevelopmentGlobals,
  cleanupDevelopmentGlobals,
} from './component-lifecycle';

/**
 * Registry for managing mocks with production compatibility
 */
export class ProductionCompatibleMockRegistry {
  private mocks = new Map<string, any>();
  private productionMocks = new Set<string>();
  private globalStateSnapshots = new Map<string, any>();

  /**
   * Register a mock with optional production compatibility flag
   */
  registerMock<T>(key: string, mock: T, isProductionCompatible = false): T {
    this.mocks.set(key, mock);
    if (isProductionCompatible) {
      this.productionMocks.add(key);
    }
    return mock;
  }

  /**
   * Get or create a mock with factory function
   */
  getMock<T>(key: string, factory: () => T, isProductionCompatible = false): T {
    if (!this.mocks.has(key)) {
      const mock = vi.fn(factory()) as any;
      this.registerMock(key, mock, isProductionCompatible);
    }
    return this.mocks.get(key);
  }

  /**
   * Reset only non-production mocks
   */
  resetTestMocks(): void {
    this.mocks.forEach((mock, key) => {
      if (!this.productionMocks.has(key) && mock.mockReset) {
        mock.mockReset();
      }
    });
  }

  /**
   * Reset all mocks including production ones
   */
  resetAllMocks(): void {
    this.mocks.forEach((mock) => {
      if (mock.mockReset) {
        mock.mockReset();
      }
    });
  }

  /**
   * Restore all mocks
   */
  restoreAllMocks(): void {
    this.mocks.forEach((mock) => {
      if (mock.mockRestore) {
        mock.mockRestore();
      }
    });
    this.mocks.clear();
    this.productionMocks.clear();
  }

  /**
   * Get all non-production mocks
   */
  getTestMocks(): Map<string, any> {
    const testMocks = new Map();
    this.mocks.forEach((mock, key) => {
      if (!this.productionMocks.has(key)) {
        testMocks.set(key, mock);
      }
    });
    return testMocks;
  }

  /**
   * Capture global state before test execution
   */
  captureGlobalState(testId: string): void {
    const globals = captureDevelopmentGlobals();
    this.globalStateSnapshots.set(testId, globals);
  }

  /**
   * Restore global state after test execution
   */
  restoreGlobalState(testId: string): void {
    const snapshot = this.globalStateSnapshots.get(testId);
    if (snapshot) {
      restoreDevelopmentGlobals(snapshot);
    }
    this.globalStateSnapshots.delete(testId);
  }
}

/**
 * Mock factory for creating standardized app state mocks
 */
export function createAppStateMockFactory(overrides = {}) {
  return {
    state: {},
    height: 0,
    ready: true,
    append: vi.fn().mockResolvedValue(0),
    appendMany: vi.fn().mockResolvedValue(0),
    isBatchPending: false,
    previewAt: vi.fn().mockResolvedValue({}),
    warnings: [],
    clearWarnings: vi.fn(),
    timeTravelHeight: null,
    setTimeTravelHeight: vi.fn(),
    timeTraveling: false,
    ...overrides,
  };
}

/**
 * Mock factory for creating router mocks
 */
export function createRouterMockFactory() {
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
 * Mock factory for creating storage-related mocks
 */
export function createStorageMockFactory() {
  const storage = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => storage.get(key) || null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    clear: vi.fn(() => storage.clear()),
    get length() {
      return storage.size;
    },
    key: vi.fn((index: number) => {
      const keys = Array.from(storage.keys());
      return keys[index] || null;
    }),
  };
}

/**
 * Mock factory for creating BroadcastChannel mocks
 */
export function createBroadcastChannelMockFactory() {
  const channels = new Map<string, Set<(event: { data: any }) => void>>();

  return {
    BroadcastChannel: class MockBroadcastChannel {
      name: string;
      listeners: Set<(event: { data: any }) => void>;

      constructor(name: string) {
        this.name = name;
        this.listeners = new Set();
        channels.set(name, this.listeners);
      }

      addEventListener(type: string, listener: (event: { data: any }) => void) {
        if (type === 'message') {
          this.listeners.add(listener);
        }
      }

      removeEventListener(type: string, listener: (event: { data: any }) => void) {
        if (type === 'message') {
          this.listeners.delete(listener);
        }
      }

      postMessage(data: any) {
        const event = { data };
        this.listeners.forEach((listener) => {
          try {
            listener(event);
          } catch (error) {
            console.error('BroadcastChannel listener error:', error);
          }
        });
      }

      close() {
        this.listeners.clear();
        channels.delete(this.name);
      }
    },

    // Helper for testing broadcast events
    broadcastToAll: (channelName: string, data: any) => {
      const listeners = channels.get(channelName);
      if (listeners) {
        const event = { data };
        listeners.forEach((listener) => {
          try {
            listener(event);
          } catch (error) {
            console.error('BroadcastChannel listener error:', error);
          }
        });
      }
    },

    // Helper for cleanup
    cleanupAll: () => {
      channels.clear();
    },
  };
}

/**
 * Mock factory for creating fetch mocks
 */
export function createFetchMockFactory() {
  const responses = new Map<string, Response>();

  return {
    mockResponse: (url: string, response: Response | string, options?: ResponseInit) => {
      if (typeof response === 'string') {
        response = new Response(response, { status: 200, ...options });
      }
      responses.set(url, response);
    },

    fetch: vi.fn(async (url: string, options?: RequestInit) => {
      const response = responses.get(url);
      if (response) {
        return response;
      }

      // Default mock response
      return new Response('Not Found', { status: 404 });
    }),

    clearMocks: () => {
      responses.clear();
    },
  };
}

/**
 * Global mock registry instance
 */
export const globalMockRegistry = new ProductionCompatibleMockRegistry();

/**
 * Test helper that sets up common mocks with production compatibility
 */
export function setupCommonMocks() {
  const testId = Math.random().toString(36).substr(2, 9);
  globalMockRegistry.captureGlobalState(testId);

  // Setup app state mock
  const appStateMock = createAppStateMockFactory();
  globalMockRegistry.registerMock('appState', appStateMock, false);

  // Setup router mock
  const routerMock = createRouterMockFactory();
  globalMockRegistry.registerMock('router', routerMock, false);

  // Setup storage mocks
  const localStorageMock = createStorageMockFactory();
  const sessionStorageMock = createStorageMockFactory();
  globalMockRegistry.registerMock('localStorage', localStorageMock, true);
  globalMockRegistry.registerMock('sessionStorage', sessionStorageMock, true);

  // Setup BroadcastChannel mock
  const broadcastChannelMock = createBroadcastChannelMockFactory();
  globalMockRegistry.registerMock('BroadcastChannel', broadcastChannelMock.BroadcastChannel, true);

  // Setup fetch mock
  const fetchMock = createFetchMockFactory();
  globalMockRegistry.registerMock('fetch', fetchMock.fetch, true);

  return {
    appState: appStateMock,
    router: routerMock,
    localStorage: localStorageMock,
    sessionStorage: sessionStorageMock,
    BroadcastChannel: broadcastChannelMock.BroadcastChannel,
    fetch: fetchMock.fetch,
    testId,
    cleanup: () => {
      globalMockRegistry.restoreGlobalState(testId);
      globalMockRegistry.resetTestMocks();
      fetchMock.clearMocks();
      broadcastChannelMock.cleanupAll();
      cleanupDevelopmentGlobals();
    },
  };
}

/**
 * Test helper for creating a mock environment
 */
export function createMockEnvironment() {
  const mocks = setupCommonMocks();

  // Override global objects with production-compatible mocks
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).localStorage = mocks.localStorage;
    (globalThis as any).sessionStorage = mocks.sessionStorage;
    (globalThis as any).BroadcastChannel = mocks.BroadcastChannel;
    (globalThis as any).fetch = mocks.fetch;
  }

  return mocks;
}
