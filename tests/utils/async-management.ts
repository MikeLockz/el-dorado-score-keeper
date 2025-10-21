/**
 * Async operation and event listener management for tests.
 *
 * This module provides utilities to track, manage, and clean up async operations
 * and event listeners that may be created by production hooks and components.
 */

import { cleanupDevelopmentGlobals } from './component-lifecycle';

/**
 * Async operation tracker interface
 */
export interface AsyncOperationTracker {
  track: <T>(promise: Promise<T>) => Promise<T>;
  trackTimeout: (id: NodeJS.Timeout) => void;
  trackInterval: (id: NodeJS.Timeout) => void;
  cleanupAll: () => void;
  getActiveCount: () => number;
  waitForAll: () => Promise<void>;
}

/**
 * Event listener tracker interface
 */
export interface EventListenerTracker {
  track: (
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ) => void;
  untrack: (target: EventTarget, type: string, listener: EventListener) => void;
  cleanupAll: () => void;
  getListenersCount: () => number;
  hasListeners: (target: EventTarget, type?: string) => boolean;
}

/**
 * Creates an async operation tracker for production hooks
 */
export function createAsyncOperationTracker(): AsyncOperationTracker {
  const operations = new Set<Promise<any>>();
  const timeouts = new Set<NodeJS.Timeout>();
  const intervals = new Set<NodeJS.Timeout>();

  // Store original functions
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  // Override setTimeout to track timeouts
  globalThis.setTimeout = ((callback: Function, delay?: number, ...args: any[]) => {
    const timeoutId = originalSetTimeout(callback, delay, ...args);
    timeouts.add(timeoutId);
    return timeoutId;
  }) as typeof setTimeout;

  // Override clearTimeout to track cleared timeouts
  globalThis.clearTimeout = ((timeoutId: NodeJS.Timeout) => {
    timeouts.delete(timeoutId);
    return originalClearTimeout(timeoutId);
  }) as typeof clearTimeout;

  // Override setInterval to track intervals
  globalThis.setInterval = ((callback: Function, delay?: number, ...args: any[]) => {
    const intervalId = originalSetInterval(callback, delay, ...args);
    intervals.add(intervalId);
    return intervalId;
  }) as typeof setInterval;

  // Override clearInterval to track cleared intervals
  globalThis.clearInterval = ((intervalId: NodeJS.Timeout) => {
    intervals.delete(intervalId);
    return originalClearInterval(intervalId);
  }) as typeof clearInterval;

  return {
    track: <T>(promise: Promise<T>) => {
      const trackedPromise = promise.finally(() => {
        operations.delete(trackedPromise);
      });
      operations.add(trackedPromise);
      return trackedPromise;
    },

    trackTimeout: (id: NodeJS.Timeout) => {
      timeouts.add(id);
    },

    trackInterval: (id: NodeJS.Timeout) => {
      intervals.add(id);
    },

    cleanupAll: () => {
      // Clear all operations
      operations.clear();

      // Clear all timeouts and intervals
      timeouts.forEach((id) => originalClearTimeout(id));
      intervals.forEach((id) => originalClearInterval(id));
      timeouts.clear();
      intervals.clear();

      // Restore original functions
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    },

    getActiveCount: () => {
      return operations.size + timeouts.size + intervals.size;
    },

    waitForAll: async () => {
      // Wait for all operations to complete
      await Promise.allSettled(Array.from(operations));

      // Wait a bit for any pending timeouts
      await new Promise((resolve) => originalSetTimeout(resolve, 0));
    },
  };
}

/**
 * Creates an event listener tracker for production event systems
 */
export function createEventListenerTracker(): EventListenerTracker {
  const listeners = new Map<
    string,
    Set<{
      target: EventTarget;
      listener: EventListener;
      options?: boolean | AddEventListenerOptions;
    }>
  >();

  // Generate a unique key for listener tracking
  function getListenerKey(target: EventTarget, type: string): string {
    return `${type}_${target.constructor.name}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Store original addEventListener and removeEventListener
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

  // Override addEventListener to track listeners
  EventTarget.prototype.addEventListener = function (
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ) {
    const key = getListenerKey(this, type);

    if (!listeners.has(key)) {
      listeners.set(key, new Set());
    }

    listeners.get(key)!.add({ target: this, listener, options });

    return originalAddEventListener.call(this, type, listener, options);
  };

  // Override removeEventListener to track removed listeners
  EventTarget.prototype.removeEventListener = function (
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions,
  ) {
    // Find and remove the listener from our tracking
    listeners.forEach((listenerSet, key) => {
      if (key.startsWith(type)) {
        listenerSet.forEach((tracked) => {
          if (tracked.target === this && tracked.listener === listener) {
            listenerSet.delete(tracked);
          }
        });

        if (listenerSet.size === 0) {
          listeners.delete(key);
        }
      }
    });

    return originalRemoveEventListener.call(this, type, listener, options);
  };

  return {
    track: (
      target: EventTarget,
      type: string,
      listener: EventListener,
      options?: boolean | AddEventListenerOptions,
    ) => {
      const key = getListenerKey(target, type);
      if (!listeners.has(key)) {
        listeners.set(key, new Set());
      }
      listeners.get(key)!.add({ target, listener, options });
      originalAddEventListener.call(target, type, listener, options);
    },

    untrack: (target: EventTarget, type: string, listener: EventListener) => {
      listeners.forEach((listenerSet, key) => {
        if (key.startsWith(type)) {
          listenerSet.forEach((tracked) => {
            if (tracked.target === target && tracked.listener === listener) {
              listenerSet.delete(tracked);
              originalRemoveEventListener.call(target, type, listener, tracked.options);
            }
          });

          if (listenerSet.size === 0) {
            listeners.delete(key);
          }
        }
      });
    },

    cleanupAll: () => {
      // Remove all tracked listeners
      listeners.forEach((listenerSet) => {
        listenerSet.forEach(({ target, listener, options }) => {
          try {
            originalRemoveEventListener.call(target, 'any', listener, options);
          } catch (error) {
            // Ignore cleanup errors
          }
        });
      });

      listeners.clear();

      // Restore original methods
      EventTarget.prototype.addEventListener = originalAddEventListener;
      EventTarget.prototype.removeEventListener = originalRemoveEventListener;
    },

    getListenersCount: () => {
      let count = 0;
      listeners.forEach((set) => {
        count += set.size;
      });
      return count;
    },

    hasListeners: (target: EventTarget, type?: string) => {
      if (type) {
        const key = `${type}_${target.constructor.name}`;
        return listeners.has(key) && listeners.get(key)!.size > 0;
      }

      // Check if target has any listeners
      for (const [key, set] of listeners) {
        for (const { target: trackedTarget } of set) {
          if (trackedTarget === target) {
            return true;
          }
        }
      }
      return false;
    },
  };
}

/**
 * Combined async and event management system
 */
export class ProductionAsyncEventManager {
  private asyncTracker: AsyncOperationTracker;
  private eventTracker: EventListenerTracker;

  constructor() {
    this.asyncTracker = createAsyncOperationTracker();
    this.eventTracker = createEventListenerTracker();
  }

  /**
   * Track an async operation
   */
  trackAsync<T>(promise: Promise<T>): Promise<T> {
    return this.asyncTracker.track(promise);
  }

  /**
   * Track an event listener
   */
  trackEventListener(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ) {
    this.eventTracker.track(target, type, listener, options);
  }

  /**
   * Get the count of active operations
   */
  getActiveOperationsCount(): number {
    return this.asyncTracker.getActiveCount();
  }

  /**
   * Get the count of tracked event listeners
   */
  getListenersCount(): number {
    return this.eventTracker.getListenersCount();
  }

  /**
   * Wait for all async operations to complete
   */
  async waitForAllAsync(): Promise<void> {
    await this.asyncTracker.waitForAll();
  }

  /**
   * Check if a target has event listeners
   */
  hasEventListeners(target: EventTarget, type?: string): boolean {
    return this.eventTracker.hasListeners(target, type);
  }

  /**
   * Clean up all tracked operations and listeners
   */
  cleanup(): void {
    this.asyncTracker.cleanupAll();
    this.eventTracker.cleanupAll();
    cleanupDevelopmentGlobals();
  }

  /**
   * Get system health status
   */
  getHealthStatus() {
    return {
      activeOperations: this.getActiveOperationsCount(),
      trackedListeners: this.getListenersCount(),
      healthy: this.getActiveOperationsCount() === 0 && this.getListenersCount() === 0,
    };
  }
}

/**
 * Global instance for async event management
 */
export const globalAsyncEventManager = new ProductionAsyncEventManager();

/**
 * Test helper that sets up async event management for a test
 */
export function setupAsyncEventManagement() {
  const manager = new ProductionAsyncEventManager();

  return {
    manager,
    trackAsync: <T>(promise: Promise<T>) => manager.trackAsync(promise),
    trackEventListener: (
      target: EventTarget,
      type: string,
      listener: EventListener,
      options?: boolean | AddEventListenerOptions,
    ) => manager.trackEventListener(target, type, listener, options),
    waitForAllAsync: () => manager.waitForAllAsync(),
    cleanup: () => manager.cleanup(),
    getHealthStatus: () => manager.getHealthStatus(),
  };
}

/**
 * Test helper for verifying async cleanup
 */
export function expectAsyncCleanup(testSetup: () => void) {
  const asyncManager = setupAsyncEventManagement();

  testSetup();

  return {
    expectClean: () => {
      const health = asyncManager.getHealthStatus();
      expect(health.healthy).toBe(true);
      expect(health.activeOperations).toBe(0);
      expect(health.trackedListeners).toBe(0);
      asyncManager.cleanup();
    },
    expectLeaks: (expectedOperations = 0, expectedListeners = 0) => {
      const health = asyncManager.getHealthStatus();
      expect(health.activeOperations).toBeGreaterThan(expectedOperations);
      expect(health.trackedListeners).toBeGreaterThan(expectedListeners);
      asyncManager.cleanup();
    },
    cleanup: () => asyncManager.cleanup(),
  };
}

/**
 * Utility to wait for async operations with timeout
 */
export async function waitForAsyncOperations(timeoutMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Async operations did not complete within ${timeoutMs}ms`));
    }, timeoutMs);

    globalAsyncEventManager
      .waitForAllAsync()
      .then(() => {
        clearTimeout(timeout);
        resolve();
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

/**
 * Utility to create a promise that can be resolved externally
 */
export function createDeferredPromise<T = void>() {
  let resolve: (value: T) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}
