/**
 * Smart Caching for Expensive Test Setup Operations
 *
 * This module provides intelligent caching strategies for expensive test
 * setup operations including component creation, data preparation, and
 * environment initialization.
 */

import { vi } from 'vitest';
import * as React from 'react';
import { render, RenderResult } from '@testing-library/react';
import { PerformanceCache } from './performance-optimization';

/**
 * Cache entry metadata
 */
interface CacheMetadata {
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  size: number;
  dependencies: string[];
  tags: string[];
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  maxSize?: number;
  defaultTTL?: number;
  enableCompression?: boolean;
  enableDependencyTracking?: boolean;
  cleanupInterval?: number;
  maxEntrySize?: number;
}

/**
 * Expensive operation types
 */
export enum OperationType {
  COMPONENT_RENDER = 'component_render',
  DATA_PREPARATION = 'data_preparation',
  ENVIRONMENT_SETUP = 'environment_setup',
  MOCK_CREATION = 'mock_creation',
  DATABASE_SEEDING = 'database_seeding',
  NETWORK_MOCK_SETUP = 'network_mock_setup',
}

/**
 * Smart cache with dependency tracking and intelligent eviction
 */
export class SmartCache<T = any> {
  private cache = new Map<string, { value: T; metadata: CacheMetadata }>();
  private dependencies = new Map<string, Set<string>>();
  private reverseDependencies = new Map<string, Set<string>>();
  private config: Required<CacheConfig>;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: CacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize || 100,
      defaultTTL: config.defaultTTL || 300000, // 5 minutes
      enableCompression: config.enableCompression || false,
      enableDependencyTracking: config.enableDependencyTracking || true,
      cleanupInterval: config.cleanupInterval || 60000, // 1 minute
      maxEntrySize: config.maxEntrySize || 1024 * 1024, // 1MB
    };

    // Start cleanup timer
    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.config.cleanupInterval);
    }
  }

  /**
   * Set value in cache with dependency tracking
   */
  set(
    key: string,
    value: T,
    options: {
      ttl?: number;
      dependencies?: string[];
      tags?: string[];
      priority?: number;
    } = {},
  ): void {
    const now = Date.now();
    const ttl = options.ttl || this.config.defaultTTL;
    const dependencies = options.dependencies || [];
    const tags = options.tags || [];

    // Check if entry is too large
    const size = this.estimateSize(value);
    if (size > this.config.maxEntrySize) {
      console.warn(
        `Cache entry ${key} exceeds maximum size (${size} > ${this.config.maxEntrySize})`,
      );
      return;
    }

    // Remove existing entry if present
    this.delete(key);

    // Ensure cache doesn't exceed max size
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const metadata: CacheMetadata = {
      createdAt: now,
      lastAccessed: now,
      accessCount: 0,
      size,
      dependencies,
      tags,
    };

    this.cache.set(key, { value, metadata });

    // Track dependencies
    if (this.config.enableDependencyTracking && dependencies.length > 0) {
      this.trackDependencies(key, dependencies);
    }
  }

  /**
   * Get value from cache with access tracking
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.metadata.createdAt;

    // Check if entry has expired
    if (age > this.config.defaultTTL) {
      this.delete(key);
      return null;
    }

    // Update access statistics
    entry.metadata.lastAccessed = now;
    entry.metadata.accessCount++;

    // Move to end (LRU)
    const value = entry.value;
    this.cache.delete(key);
    this.cache.set(key, entry);

    return value;
  }

  /**
   * Delete entry and clean up dependencies
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.cleanupDependencies(key);
    }
    return deleted;
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.dependencies.clear();
    this.reverseDependencies.clear();
  }

  /**
   * Invalidate entries by dependency
   */
  invalidateByDependency(dependency: string): number {
    const dependentKeys = this.reverseDependencies.get(dependency);
    if (!dependentKeys) {
      return 0;
    }

    const keys = Array.from(dependentKeys);
    let invalidated = 0;

    for (const key of keys) {
      if (this.delete(key)) {
        invalidated++;
      }
    }

    return invalidated;
  }

  /**
   * Invalidate entries by tag
   */
  invalidateByTag(tag: string): number {
    let invalidated = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.metadata.tags.includes(tag)) {
        if (this.delete(key)) {
          invalidated++;
        }
      }
    }

    return invalidated;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const entries = Array.from(this.cache.entries());
    const now = Date.now();

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: this.calculateHitRate(),
      memoryUsage: this.calculateMemoryUsage(),
      oldestEntry:
        entries.length > 0 ? Math.min(...entries.map(([, e]) => e.metadata.createdAt)) : null,
      newestEntry:
        entries.length > 0 ? Math.max(...entries.map(([, e]) => e.metadata.createdAt)) : null,
      averageAge:
        entries.length > 0
          ? entries.reduce((sum, [, e]) => sum + (now - e.metadata.createdAt), 0) / entries.length
          : 0,
      topAccessed: entries
        .map(([key, entry]) => ({ key, accesses: entry.metadata.accessCount }))
        .sort((a, b) => b.accesses - a.accesses)
        .slice(0, 5),
    };
  }

  /**
   * Get detailed cache entry information
   */
  getEntryInfo(key: string): CacheMetadata | null {
    const entry = this.cache.get(key);
    return entry ? { ...entry.metadata } : null;
  }

  /**
   * Force cleanup of expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.metadata.createdAt;
      if (age > this.config.defaultTTL) {
        this.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Destroy cache and cleanup timer
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.clear();
  }

  /**
   * Track dependencies between cache entries
   */
  private trackDependencies(key: string, dependencies: string[]): void {
    if (!this.config.enableDependencyTracking) {
      return;
    }

    // Forward dependencies
    if (!this.dependencies.has(key)) {
      this.dependencies.set(key, new Set());
    }
    const keyDeps = this.dependencies.get(key)!;
    dependencies.forEach((dep) => keyDeps.add(dep));

    // Reverse dependencies
    for (const dep of dependencies) {
      if (!this.reverseDependencies.has(dep)) {
        this.reverseDependencies.set(dep, new Set());
      }
      this.reverseDependencies.get(dep)!.add(key);
    }
  }

  /**
   * Clean up dependency tracking
   */
  private cleanupDependencies(key: string): void {
    if (!this.config.enableDependencyTracking) {
      return;
    }

    // Clean forward dependencies
    const deps = this.dependencies.get(key);
    if (deps) {
      for (const dep of deps) {
        const revDeps = this.reverseDependencies.get(dep);
        if (revDeps) {
          revDeps.delete(key);
          if (revDeps.size === 0) {
            this.reverseDependencies.delete(dep);
          }
        }
      }
      this.dependencies.delete(key);
    }

    // Clean reverse dependencies
    const revDeps = this.reverseDependencies.get(key);
    if (revDeps) {
      revDeps.clear();
      this.reverseDependencies.delete(key);
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.metadata.lastAccessed < oldestTime) {
        oldestTime = entry.metadata.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  /**
   * Estimate size of cached value
   */
  private estimateSize(value: any): number {
    try {
      return JSON.stringify(value).length * 2; // Rough estimate
    } catch {
      return 1000; // Default size for non-serializable values
    }
  }

  /**
   * Calculate memory usage
   */
  private calculateMemoryUsage(): number {
    let totalSize = 0;
    for (const [, entry] of this.cache.entries()) {
      totalSize += entry.metadata.size;
    }
    return totalSize;
  }

  /**
   * Calculate hit rate (placeholder - would need tracking)
   */
  private calculateHitRate(): number {
    // Would need hit/miss tracking
    return 0;
  }
}

/**
 * Component render cache with React-specific optimizations
 */
export class ComponentRenderCache {
  private cache = new SmartCache<RenderResult>({
    maxSize: 50,
    defaultTTL: 600000, // 10 minutes
    enableDependencyTracking: true,
  });

  /**
   * Cache component render result
   */
  cacheRender<T extends React.ReactElement>(
    component: T,
    result: RenderResult,
    options: {
      props?: any;
      dependencies?: string[];
      tags?: string[];
    } = {},
  ): void {
    const key = this.generateComponentKey(component, options.props);
    const dependencies = options.dependencies || [];

    this.cache.set(key, result, {
      dependencies,
      tags: ['component', ...options.tags],
      priority: 1,
    });
  }

  /**
   * Get cached render result
   */
  getCachedRender<T extends React.ReactElement>(component: T, props?: any): RenderResult | null {
    const key = this.generateComponentKey(component, props);
    return this.cache.get(key);
  }

  /**
   * Invalidate cached renders for component type
   */
  invalidateComponent(componentType: React.ComponentType<any>): number {
    const tagName = componentType.displayName || componentType.name || 'Component';
    return this.cache.invalidateByTag(tagName);
  }

  /**
   * Generate cache key for component
   */
  private generateComponentKey<T extends React.ReactElement>(component: T, props?: any): string {
    const type = component.type;
    const typeName =
      typeof type === 'function' ? type.displayName || type.name || 'Anonymous' : String(type);

    const propsHash = props ? JSON.stringify(props) : '';
    return `${typeName}:${propsHash}`;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Clear component cache
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Data preparation cache for expensive data operations
 */
export class DataPreparationCache {
  private cache = new SmartCache<any>({
    maxSize: 100,
    defaultTTL: 1800000, // 30 minutes
    enableDependencyTracking: true,
  });

  /**
   * Cache prepared data
   */
  cacheData<T>(
    operation: string,
    data: T,
    options: {
      parameters?: any;
      dependencies?: string[];
      tags?: string[];
    } = {},
  ): void {
    const key = this.generateDataKey(operation, options.parameters);
    const dependencies = options.dependencies || [];

    this.cache.set(key, data, {
      dependencies,
      tags: ['data', operation, ...(options.tags || [])],
    });
  }

  /**
   * Get cached data
   */
  getCachedData<T>(operation: string, parameters?: any): T | null {
    const key = this.generateDataKey(operation, parameters);
    return this.cache.get(key);
  }

  /**
   * Invalidate data by operation
   */
  invalidateOperation(operation: string): number {
    return this.cache.invalidateByTag(operation);
  }

  /**
   * Generate cache key for data operation
   */
  private generateDataKey(operation: string, parameters?: any): string {
    const paramHash = parameters ? JSON.stringify(parameters) : '';
    return `${operation}:${paramHash}`;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Clear data cache
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Environment setup cache for expensive environment configurations
 */
export class EnvironmentSetupCache {
  private cache = new SmartCache<any>({
    maxSize: 20,
    defaultTTL: 3600000, // 1 hour
    enableDependencyTracking: true,
  });

  /**
   * Cache environment setup
   */
  cacheSetup(
    environment: string,
    setup: any,
    options: {
      configuration?: any;
      dependencies?: string[];
    } = {},
  ): void {
    const key = this.generateEnvironmentKey(environment, options.configuration);
    const dependencies = options.dependencies || [];

    this.cache.set(key, setup, {
      dependencies,
      tags: ['environment', environment],
    });
  }

  /**
   * Get cached environment setup
   */
  getCachedSetup(environment: string, configuration?: any): any {
    const key = this.generateEnvironmentKey(environment, configuration);
    return this.cache.get(key);
  }

  /**
   * Invalidate environment setup
   */
  invalidateEnvironment(environment: string): number {
    return this.cache.invalidateByTag(environment);
  }

  /**
   * Generate cache key for environment setup
   */
  private generateEnvironmentKey(environment: string, configuration?: any): string {
    const configHash = configuration ? JSON.stringify(configuration) : '';
    return `${environment}:${configHash}`;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Clear environment cache
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Global cache instances
 */
export const globalComponentCache = new ComponentRenderCache();
export const globalDataCache = new DataPreparationCache();
export const globalEnvironmentCache = new EnvironmentSetupCache();

/**
 * Cache-aware wrapper for expensive operations
 */
export function withCaching<T, Args extends any[]>(
  operation: string,
  fn: (...args: Args) => T | Promise<T>,
  options: {
    ttl?: number;
    dependencies?: string[];
    tags?: string[];
    useComponentCache?: boolean;
    useDataCache?: boolean;
    useEnvironmentCache?: boolean;
  } = {},
) {
  const {
    ttl,
    dependencies,
    tags,
    useComponentCache = false,
    useDataCache = false,
    useEnvironmentCache = false,
  } = options;

  return (...args: Args): T | Promise<T> => {
    // Try appropriate cache first
    if (useComponentCache) {
      const cached = globalComponentCache.getCachedRender(operation, args[0]);
      if (cached) {
        return cached as T;
      }
    }

    if (useDataCache) {
      const cached = globalDataCache.getCachedData(operation, args);
      if (cached) {
        return cached;
      }
    }

    if (useEnvironmentCache) {
      const cached = globalEnvironmentCache.getCachedSetup(operation, args[0]);
      if (cached) {
        return cached;
      }
    }

    // Execute function and cache result
    const result = fn(...args);

    // Cache result based on operation type
    if (result && typeof result === 'object') {
      if (useComponentCache && 'container' in result) {
        globalComponentCache.cacheRender(args[0], result, { dependencies, tags });
      } else if (useDataCache) {
        globalDataCache.cacheData(operation, result, { parameters: args, dependencies, tags });
      } else if (useEnvironmentCache) {
        globalEnvironmentCache.cacheSetup(operation, result, {
          configuration: args[0],
          dependencies,
        });
      }
    }

    return result;
  };
}

/**
 * Cache warming utility for pre-loading expensive operations
 */
export function warmCache<T>(
  operations: Array<{
    key: string;
    operation: () => T | Promise<T>;
    cache: SmartCache<T>;
    options?: Parameters<SmartCache<T>['set']>[2];
  }>,
): Promise<T[]> {
  return Promise.all(
    operations.map(async ({ key, operation, cache, options }) => {
      try {
        const result = await operation();
        cache.set(key, result, options);
        return result;
      } catch (error) {
        console.warn(`Failed to warm cache for ${key}:`, error);
        throw error;
      }
    }),
  );
}

/**
 * Export cache utilities
 */
export { SmartCache as Cache };
