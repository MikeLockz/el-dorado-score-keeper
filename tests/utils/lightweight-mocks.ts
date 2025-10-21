/**
 * Lightweight Mock Implementations for Performance Optimization
 *
 * This module provides optimized mock implementations that minimize
 * computational overhead while maintaining essential test functionality.
 */

import { vi } from 'vitest';
import { PerformanceCache } from './performance-optimization';

/**
 * Mock configuration interface
 */
export interface MockConfig {
  lazy?: boolean;
  cacheResults?: boolean;
  maxCacheSize?: number;
  cacheTTL?: number;
}

/**
 * Lightweight mock factory with lazy loading and caching
 */
export class LightweightMockFactory<T = any> {
  private mocks = new Map<string, any>();
  private factories = new Map<string, () => T>();
  private cache: PerformanceCache;
  private config: MockConfig;

  constructor(config: MockConfig = {}) {
    this.config = {
      lazy: true,
      cacheResults: true,
      maxCacheSize: 100,
      cacheTTL: 30000,
      ...config,
    };

    this.cache = new PerformanceCache(this.config.maxCacheSize, this.config.cacheTTL);
  }

  /**
   * Register a mock factory
   */
  register(key: string, factory: () => T): void {
    this.factories.set(key, factory);

    // Pre-create if not lazy
    if (!this.config.lazy) {
      this.get(key);
    }
  }

  /**
   * Get or create mock instance
   */
  get(key: string): T {
    // Check cache first
    if (this.config.cacheResults) {
      const cached = this.cache.get<T>(key);
      if (cached) {
        return cached;
      }
    }

    // Check existing mocks
    if (this.mocks.has(key)) {
      return this.mocks.get(key);
    }

    // Create new mock
    const factory = this.factories.get(key);
    if (!factory) {
      throw new Error(`No factory registered for mock: ${key}`);
    }

    const mock = factory();
    this.mocks.set(key, mock);

    // Cache result
    if (this.config.cacheResults) {
      this.cache.set(key, mock);
    }

    return mock;
  }

  /**
   * Reset specific mock
   */
  reset(key: string): void {
    const mock = this.mocks.get(key);
    if (mock && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
    this.cache.delete(key);
  }

  /**
   * Reset all mocks
   */
  resetAll(): void {
    this.mocks.forEach((mock, key) => {
      if (typeof mock.mockReset === 'function') {
        mock.mockReset();
      }
    });
    this.cache.clear();
  }

  /**
   * Restore all mocks
   */
  restoreAll(): void {
    this.mocks.forEach((mock) => {
      if (typeof mock.mockRestore === 'function') {
        mock.mockRestore();
      }
    });
    this.cache.clear();
  }

  /**
   * Get mock statistics
   */
  getStats() {
    return {
      registeredMocks: this.factories.size,
      createdMocks: this.mocks.size,
      cacheStats: this.cache.getStats(),
    };
  }

  /**
   * Clear all mocks and cache
   */
  clear(): void {
    this.restoreAll();
    this.mocks.clear();
    this.factories.clear();
  }
}

/**
 * Fast mock implementation for simple functions
 */
export function createFastMock<T extends (...args: any[]) => any>(
  implementation?: T,
  options: {
    name?: string;
    delay?: number;
    shouldThrow?: boolean;
    returnValue?: any;
  } = {},
): T {
  const { name = 'mock', delay = 0, shouldThrow = false, returnValue } = options;

  const mockFn = vi.fn(implementation) as any;

  // Add performance optimizations
  if (delay > 0) {
    mockFn.delay = delay;
  }

  if (shouldThrow) {
    mockFn.mockImplementation(() => {
      throw new Error(`Mock ${name} configured to throw`);
    });
  } else if (returnValue !== undefined) {
    mockFn.mockReturnValue(returnValue);
  }

  return mockFn;
}

/**
 * Lightweight state mock for React hooks
 */
export function createLightweightStateMock<T>(
  initialValue: T,
  options: {
    onChange?: (value: T) => void;
    async?: boolean;
  } = {},
) {
  const { onChange, async = false } = options;
  let currentValue = initialValue;
  const listeners = new Set<(value: T) => void>();

  const setValue = (value: T | ((prev: T) => T)) => {
    const newValue = typeof value === 'function' ? (value as (prev: T) => T)(currentValue) : value;

    if (newValue !== currentValue) {
      currentValue = newValue;

      // Notify listeners
      if (async) {
        setTimeout(() => {
          listeners.forEach((listener) => listener(newValue));
          onChange?.(newValue);
        }, 0);
      } else {
        listeners.forEach((listener) => listener(newValue));
        onChange?.(newValue);
      }
    }

    return newValue;
  };

  const subscribe = (listener: (value: T) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    get current() {
      return currentValue;
    },
    setValue,
    subscribe,
    get listeners() {
      return listeners.size;
    },
    reset: () => {
      currentValue = initialValue;
      listeners.clear();
    },
  };
}

/**
 * Optimized React Context mock
 */
export function createLightweightContextMock<T>(defaultValue: T) {
  let value = defaultValue;
  let providers = 0;

  const context = {
    Provider: ({ children, value: providedValue }: { children: React.ReactNode; value?: T }) => {
      if (providedValue !== undefined) {
        value = providedValue;
      }
      providers++;
      return children;
    },
    Consumer: ({ children }: { children: (value: T) => React.ReactNode }) => {
      return children(value);
    },
    defaultValue,
    currentValue: () => value,
    providerCount: () => providers,
    reset: () => {
      value = defaultValue;
      providers = 0;
    },
  };

  return context;
}

/**
 * Fast storage mock with minimal overhead
 */
export function createFastStorageMock() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string): string | null => {
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string): void => {
      store.set(key, value);
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    clear: (): void => {
      store.clear();
    },
    key: (index: number): string | null => {
      const keys = Array.from(store.keys());
      return keys[index] ?? null;
    },
    get length(): number {
      return store.size;
    },
    // Additional utility methods
    keys: (): string[] => Array.from(store.keys()),
    values: (): string[] => Array.from(store.values()),
    entries: (): [string, string][] => Array.from(store.entries()),
    has: (key: string): boolean => store.has(key),
    size: (): number => store.size,
    // Performance optimization
    reset: () => store.clear(),
  };
}

/**
 * Lightweight fetch mock with caching
 */
export function createLightweightFetchMock() {
  const responses = new Map<string, Response>();
  const config = {
    defaultResponse: { ok: true, status: 200, statusText: 'OK' },
    delay: 0,
  };

  const mockFetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();

      // Check for registered response
      if (responses.has(url)) {
        const response = responses.get(url)!;
        if (config.delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, config.delay));
        }
        return response.clone();
      }

      // Return default response
      if (config.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, config.delay));
      }
      return new Response(JSON.stringify(config.defaultResponse), {
        status: config.defaultResponse.status,
        statusText: config.defaultResponse.statusText,
      });
    },
  );

  return {
    mock: mockFetch,
    setResponse: (url: string, response: Response | any): void => {
      responses.set(url, response);
    },
    setDefaultResponse: (response: any): void => {
      config.defaultResponse = response;
    },
    setDelay: (delay: number): void => {
      config.delay = delay;
    },
    clear: (): void => {
      responses.clear();
      mockFetch.mockClear();
    },
    reset: (): void => {
      responses.clear();
      mockFetch.mockReset();
    },
    restore: (): void => {
      responses.clear();
      mockFetch.mockRestore();
    },
  };
}

/**
 * Optimized event emitter mock
 */
export function createLightweightEventEmitterMock() {
  const listeners = new Map<string, Set<Function>>();
  const eventLog: Array<{ event: string; args: any[]; timestamp: number }> = [];

  const emitter = {
    on: (event: string, listener: Function): void => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(listener);
    },
    off: (event: string, listener: Function): void => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(listener);
        if (eventListeners.size === 0) {
          listeners.delete(event);
        }
      }
    },
    emit: (event: string, ...args: any[]): void => {
      eventLog.push({ event, args, timestamp: Date.now() });
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        eventListeners.forEach((listener) => {
          try {
            listener(...args);
          } catch (error) {
            console.error(`Error in event listener for ${event}:`, error);
          }
        });
      }
    },
    once: (event: string, listener: Function): void => {
      const onceListener = (...args: any[]) => {
        emitter.off(event, onceListener);
        listener(...args);
      };
      emitter.on(event, onceListener);
    },
    removeAllListeners: (event?: string): void => {
      if (event) {
        listeners.delete(event);
      } else {
        listeners.clear();
      }
    },
    listenerCount: (event: string): number => {
      return listeners.get(event)?.size ?? 0;
    },
    eventNames: (): string[] => {
      return Array.from(listeners.keys());
    },
    getEventLog: (): typeof eventLog => [...eventLog],
    clearEventLog: (): void => {
      eventLog.length = 0;
    },
    reset: (): void => {
      listeners.clear();
      eventLog.length = 0;
    },
  };

  return emitter;
}

/**
 * Performance-optimized mock registry
 */
export class OptimizedMockRegistry {
  private mocks = new Map<string, any>();
  private factories = new Map<string, () => any>();
  private dependencies = new Map<string, string[]>();
  private initializationOrder: string[] = [];

  /**
   * Register a mock with optional dependencies
   */
  register(name: string, factory: () => any, dependencies: string[] = []): void {
    this.factories.set(name, factory);
    this.dependencies.set(name, dependencies);
  }

  /**
   * Get mock instance with dependency resolution
   */
  get(name: string): any {
    if (this.mocks.has(name)) {
      return this.mocks.get(name);
    }

    const dependencies = this.dependencies.get(name) || [];

    // Initialize dependencies first
    for (const dep of dependencies) {
      if (!this.mocks.has(dep)) {
        this.get(dep);
      }
    }

    // Create the mock
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`No factory registered for mock: ${name}`);
    }

    const mock = factory();
    this.mocks.set(name, mock);
    this.initializationOrder.push(name);

    return mock;
  }

  /**
   * Check if mock is initialized
   */
  isInitialized(name: string): boolean {
    return this.mocks.has(name);
  }

  /**
   * Get initialization order
   */
  getInitializationOrder(): string[] {
    return [...this.initializationOrder];
  }

  /**
   * Reset specific mock
   */
  reset(name: string): void {
    const mock = this.mocks.get(name);
    if (mock && typeof mock.reset === 'function') {
      mock.reset();
    } else if (mock && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  }

  /**
   * Reset all mocks in reverse initialization order
   */
  resetAll(): void {
    const reverseOrder = [...this.initializationOrder].reverse();
    for (const name of reverseOrder) {
      this.reset(name);
    }
  }

  /**
   * Clear all mocks
   */
  clear(): void {
    this.resetAll();
    this.mocks.clear();
    this.initializationOrder = [];
  }

  /**
   * Get registry statistics
   */
  getStats() {
    return {
      registeredMocks: this.factories.size,
      initializedMocks: this.mocks.size,
      initializationOrder: this.initializationOrder.length,
    };
  }
}

/**
 * Pre-configured lightweight mock factory for common use cases
 */
export const commonMockFactory = new LightweightMockFactory({
  lazy: true,
  cacheResults: true,
  maxCacheSize: 50,
  cacheTTL: 30000,
});

// Register common lightweight mocks
commonMockFactory.register('localStorage', () => createFastStorageMock());
commonMockFactory.register('sessionStorage', () => createFastStorageMock());
commonMockFactory.register('fetch', () => createLightweightFetchMock().mock);
commonMockFactory.register('eventEmitter', () => createLightweightEventEmitterMock());

/**
 * Export common lightweight mock creators
 */
export {
  createFastMock as fastMock,
  createLightweightStateMock as stateMock,
  createLightweightContextMock as contextMock,
  createFastStorageMock as storageMock,
  createLightweightFetchMock as fetchMock,
  createLightweightEventEmitterMock as eventEmitterMock,
};
