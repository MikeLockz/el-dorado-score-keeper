/**
 * Test Execution Performance Optimization Utilities
 *
 * This module provides utilities for optimizing test execution performance
 * through intelligent caching, resource pooling, and selective execution strategies.
 */

import { vi } from 'vitest';
import * as React from 'react';
import { render, RenderResult } from '@testing-library/react';
import { renderHook, RenderHookResult } from '@testing-library/react';

/**
 * Performance metrics interface
 */
export interface TestPerformanceMetrics {
  setupTime: number;
  executionTime: number;
  cleanupTime: number;
  totalTime: number;
  memoryUsage?: number;
  cachedOperations?: number;
}

/**
 * Cache entry with expiration
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
  lastAccessed: number;
}

/**
 * Resource pool interface
 */
export interface ResourcePool<T> {
  acquire: () => Promise<T>;
  release: (resource: T) => void;
  size: () => number;
  clear: () => void;
}

/**
 * Performance-aware test execution options
 */
export interface OptimizedTestOptions {
  enableCaching?: boolean;
  cacheTimeout?: number;
  enableResourcePooling?: boolean;
  trackMetrics?: boolean;
  maxConcurrency?: number;
  selectiveExecution?: boolean;
}

/**
 * High-performance test cache with LRU eviction and TTL
 */
export class PerformanceCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize: number;
  private defaultTtl: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize = 100, defaultTtl = 30000) {
    this.maxSize = maxSize;
    this.defaultTtl = defaultTtl;
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();

    // Check if entry has expired
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update access statistics
    entry.hits++;
    entry.lastAccessed = now;
    this.hits++;

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttl = this.defaultTtl): void {
    const now = Date.now();

    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      timestamp: now,
      ttl,
      hits: 0,
      lastAccessed: now,
    });
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses)) * 100 : 0,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Resource pool implementation for expensive test resources
 */
export class TestResourcePool<T> implements ResourcePool<T> {
  private available: T[] = [];
  private inUse = new Set<T>();
  private factory: () => T | Promise<T>;
  private cleanup?: (resource: T) => void;
  private maxSize: number;

  constructor(
    factory: () => T | Promise<T>,
    options: {
      cleanup?: (resource: T) => void;
      maxSize?: number;
    } = {},
  ) {
    this.factory = factory;
    this.cleanup = options.cleanup;
    this.maxSize = options.maxSize || 10;
  }

  async acquire(): Promise<T> {
    // Return available resource if exists
    if (this.available.length > 0) {
      const resource = this.available.pop()!;
      this.inUse.add(resource);
      return resource;
    }

    // Create new resource if under max size
    if (this.inUse.size < this.maxSize) {
      const resource = await this.factory();
      this.inUse.add(resource);
      return resource;
    }

    // Wait for available resource
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.available.length > 0) {
          clearInterval(checkInterval);
          const resource = this.available.pop()!;
          this.inUse.add(resource);
          resolve(resource);
        }
      }, 10);
    });
  }

  release(resource: T): void {
    if (this.inUse.has(resource)) {
      this.inUse.delete(resource);

      // Clean up resource if cleanup function provided
      if (this.cleanup) {
        try {
          this.cleanup(resource);
        } catch (error) {
          console.warn('Resource cleanup failed:', error);
        }
      } else {
        // Return to pool if no cleanup needed
        this.available.push(resource);
      }
    }
  }

  size(): number {
    return this.inUse.size;
  }

  clear(): void {
    // Clean up all in-use resources
    for (const resource of this.inUse) {
      if (this.cleanup) {
        try {
          this.cleanup(resource);
        } catch (error) {
          console.warn('Resource cleanup failed during clear:', error);
        }
      }
    }

    // Clean up all available resources
    for (const resource of this.available) {
      if (this.cleanup) {
        try {
          this.cleanup(resource);
        } catch (error) {
          console.warn('Resource cleanup failed during clear:', error);
        }
      }
    }

    this.inUse.clear();
    this.available.length = 0;
  }

  getStats() {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      total: this.available.length + this.inUse.size,
      maxSize: this.maxSize,
    };
  }
}

/**
 * Performance monitoring for test execution
 */
export class TestPerformanceMonitor {
  private metrics: TestPerformanceMetrics[] = [];
  private currentTest: {
    startTime: number;
    setupTime?: number;
    memoryBefore?: number;
  } | null = null;

  startTest(): void {
    this.currentTest = {
      startTime: performance.now(),
      memoryBefore: this.getMemoryUsage(),
    };
  }

  markSetupComplete(): void {
    if (this.currentTest) {
      this.currentTest.setupTime = performance.now();
    }
  }

  endTest(): TestPerformanceMetrics {
    if (!this.currentTest) {
      throw new Error('Test not started');
    }

    const endTime = performance.now();
    const memoryAfter = this.getMemoryUsage();
    const metrics: TestPerformanceMetrics = {
      setupTime:
        (this.currentTest.setupTime || this.currentTest.startTime) - this.currentTest.startTime,
      executionTime: endTime - (this.currentTest.setupTime || this.currentTest.startTime),
      cleanupTime: 0, // Will be set when cleanup is called
      totalTime: endTime - this.currentTest.startTime,
      memoryUsage:
        memoryAfter && this.currentTest.memoryBefore
          ? memoryAfter - this.currentTest.memoryBefore
          : undefined,
    };

    this.metrics.push(metrics);
    this.currentTest = null;
    return metrics;
  }

  getMetrics(): TestPerformanceMetrics[] {
    return [...this.metrics];
  }

  getAverageMetrics(): Partial<TestPerformanceMetrics> {
    if (this.metrics.length === 0) return {};

    const total = this.metrics.reduce(
      (acc, metric) => ({
        setupTime: acc.setupTime + metric.setupTime,
        executionTime: acc.executionTime + metric.executionTime,
        cleanupTime: acc.cleanupTime + metric.cleanupTime,
        totalTime: acc.totalTime + metric.totalTime,
        memoryUsage: (acc.memoryUsage || 0) + (metric.memoryUsage || 0),
        cachedOperations: (acc.cachedOperations || 0) + (metric.cachedOperations || 0),
      }),
      {
        setupTime: 0,
        executionTime: 0,
        cleanupTime: 0,
        totalTime: 0,
        memoryUsage: 0,
        cachedOperations: 0,
      },
    );

    const count = this.metrics.length;
    return {
      setupTime: total.setupTime / count,
      executionTime: total.executionTime / count,
      cleanupTime: total.cleanupTime / count,
      totalTime: total.totalTime / count,
      memoryUsage: total.memoryUsage / count,
      cachedOperations: Math.round(total.cachedOperations / count),
    };
  }

  clear(): void {
    this.metrics = [];
    this.currentTest = null;
  }

  private getMemoryUsage(): number | null {
    // Try to get memory usage if available
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return null;
  }
}

/**
 * Global performance optimization instances
 */
export const globalTestCache = new PerformanceCache(100, 30000);
export const globalPerformanceMonitor = new TestPerformanceMonitor();

/**
 * Create optimized render function with caching
 */
export function createOptimizedRender() {
  const renderCache = new Map<string, RenderResult>();

  return {
    render: <T extends React.ReactElement>(
      ui: T,
      options?: {
        cacheKey?: string;
        enableCaching?: boolean;
        ttl?: number;
      } & Parameters<typeof render>[1],
    ): RenderResult => {
      const cacheKey = options?.cacheKey;
      const enableCaching = options?.enableCaching !== false;

      // Check cache first
      if (enableCaching && cacheKey) {
        const cached = globalTestCache.get<RenderResult>(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Render component
      const result = render(ui, options);

      // Cache result if enabled
      if (enableCaching && cacheKey) {
        globalTestCache.set(cacheKey, result, options?.ttl);
      }

      return result;
    },

    clearCache: () => {
      renderCache.clear();
      globalTestCache.clear();
    },

    getCacheStats: () => globalTestCache.getStats(),
  };
}

/**
 * Create optimized renderHook function with caching
 */
export function createOptimizedRenderHook() {
  return {
    renderHook: <Result, Props>(
      renderCallback: (initialProps: Props) => Result,
      options?: {
        cacheKey?: string;
        enableCaching?: boolean;
        ttl?: number;
      } & Parameters<typeof renderHook>[1],
    ): RenderHookResult<Result, Props> => {
      const cacheKey = options?.cacheKey;
      const enableCaching = options?.enableCaching !== false;

      // Check cache first (limited utility for hooks since they maintain state)
      if (enableCaching && cacheKey) {
        const cached = globalTestCache.get<RenderHookResult<Result, Props>>(cacheKey);
        if (cached && !cached.result.current) {
          return cached;
        }
      }

      // Render hook
      const result = renderHook(renderCallback, options);

      return result;
    },

    clearCache: () => {
      globalTestCache.clear();
    },

    getCacheStats: () => globalTestCache.getStats(),
  };
}

/**
 * Memoized factory for expensive test setup operations
 */
export function createMemoizedFactory<T, Args extends any[]>(
  factory: (...args: Args) => T | Promise<T>,
  options: {
    ttl?: number;
    keyGenerator?: (...args: Args) => string;
    maxSize?: number;
  } = {},
) {
  const cache = new Map<string, CacheEntry<T>>();
  const { ttl = 30000, keyGenerator, maxSize = 50 } = options;

  return {
    async create(...args: Args): Promise<T> {
      const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);

      // Check cache
      const cached = cache.get(key);
      if (cached && Date.now() - cached.timestamp < ttl) {
        cached.hits++;
        cached.lastAccessed = Date.now();
        return cached.value;
      }

      // Create new value
      const value = await factory(...args);
      const now = Date.now();

      // Clean up if cache is full
      if (cache.size >= maxSize) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
      }

      cache.set(key, {
        value,
        timestamp: now,
        ttl,
        hits: 0,
        lastAccessed: now,
      });

      return value;
    },

    clear(): void {
      cache.clear();
    },

    getStats() {
      return {
        size: cache.size,
        maxSize,
        entries: Array.from(cache.entries()).map(([key, entry]) => ({
          key,
          hits: entry.hits,
          age: Date.now() - entry.timestamp,
        })),
      };
    },
  };
}

/**
 * Selective test execution utility
 */
export function createSelectiveTestExecutor() {
  const testDependencies = new Map<string, string[]>();
  const lastModifiedTimes = new Map<string, number>();

  return {
    registerTest: (testFile: string, dependencies: string[]): void => {
      testDependencies.set(testFile, dependencies);
    },

    shouldRunTest: (testFile: string, changedFiles: string[]): boolean => {
      // Always run if no dependency tracking
      if (!testDependencies.has(testFile)) {
        return true;
      }

      // Check if test file or its dependencies changed
      const dependencies = testDependencies.get(testFile)!;
      return (
        changedFiles.includes(testFile) || dependencies.some((dep) => changedFiles.includes(dep))
      );
    },

    updateModifiedTime: (file: string, timestamp: number = Date.now()): void => {
      lastModifiedTimes.set(file, timestamp);
    },

    getStaleTests: (olderThan: number = Date.now() - 24 * 60 * 60 * 1000): string[] => {
      // Return tests that haven't run in the last 24 hours
      const threshold = olderThan;
      return Array.from(lastModifiedTimes.entries())
        .filter(([, timestamp]) => timestamp < threshold)
        .map(([testFile]) => testFile);
    },
  };
}

/**
 * Batch operation utility for test setup
 */
export function createBatchOperations<T>() {
  const operations: Array<() => Promise<T>> = [];
  const results: T[] = [];

  return {
    add: (operation: () => Promise<T>): void => {
      operations.push(operation);
    },

    execute: async (): Promise<T[]> => {
      results.length = 0;

      // Execute all operations in parallel
      const batchResults = await Promise.all(operations.map((op) => op()));
      results.push(...batchResults);

      return results;
    },

    clear: (): void => {
      operations.length = 0;
      results.length = 0;
    },

    getResults: (): T[] => [...results],
  };
}

/**
 * Performance-aware test wrapper
 */
export function withPerformanceMonitoring<T>(
  testName: string,
  testFn: () => T | Promise<T>,
): () => Promise<T> {
  return async (): Promise<T> => {
    const monitor = new TestPerformanceMonitor();
    monitor.startTest();

    try {
      monitor.markSetupComplete();
      const result = await testFn();
      const metrics = monitor.endTest();

      // Log performance metrics if needed
      if (process.env.NODE_ENV === 'development' && process.env.VERBOSE_TEST_PERFORMANCE) {
        console.log(`[${testName}] Performance:`, metrics);
      }

      return result;
    } catch (error) {
      monitor.endTest();
      throw error;
    }
  };
}

/**
 * Export optimized instances
 */
export const optimizedRender = createOptimizedRender();
export const optimizedRenderHook = createOptimizedRenderHook();
export const selectiveTestExecutor = createSelectiveTestExecutor();
