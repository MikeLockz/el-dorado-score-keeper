/**
 * Resource Pooling for Shared Test Resources
 *
 * This module provides efficient resource pooling mechanisms to optimize
 * the creation and management of expensive test resources like database
 * connections, browser contexts, and complex mock objects.
 */

import { vi } from 'vitest';
import { TestResourcePool, PerformanceCache } from './performance-optimization';

/**
 * Resource pool configuration
 */
export interface ResourcePoolConfig {
  maxSize?: number;
  minSize?: number;
  maxIdleTime?: number;
  acquireTimeout?: number;
  creationTimeout?: number;
  healthCheckInterval?: number;
  enableHealthCheck?: boolean;
  resetOnReturn?: boolean;
}

/**
 * Resource health status
 */
export enum ResourceHealth {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

/**
 * Resource wrapper with metadata
 */
interface PooledResource<T> {
  resource: T;
  createdAt: number;
  lastUsed: number;
  useCount: number;
  health: ResourceHealth;
  lastHealthCheck: number;
  isAcquired: boolean;
}

/**
 * Enhanced resource pool with health checking and lifecycle management
 */
export class EnhancedResourcePool<T> {
  private available: PooledResource<T>[] = [];
  private inUse = new Set<PooledResource<T>>();
  private factory: () => T | Promise<T>;
  private destroyer?: (resource: T) => void | Promise<void>;
  private healthChecker?: (resource: T) => boolean | Promise<boolean>;
  private resetter?: (resource: T) => void | Promise<void>;
  private config: Required<ResourcePoolConfig>;
  private healthCheckTimer?: NodeJS.Timeout;
  private waitingQueue: Array<{
    resolve: (resource: T) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];

  constructor(
    factory: () => T | Promise<T>,
    options: {
      destroy?: (resource: T) => void | Promise<void>;
      healthCheck?: (resource: T) => boolean | Promise<boolean>;
      reset?: (resource: T) => void | Promise<void>;
    } & ResourcePoolConfig = {},
  ) {
    this.factory = factory;
    this.destroyer = options.destroy;
    this.healthChecker = options.healthCheck;
    this.resetter = options.reset;

    this.config = {
      maxSize: options.maxSize || 10,
      minSize: options.minSize || 0,
      maxIdleTime: options.maxIdleTime || 300000, // 5 minutes
      acquireTimeout: options.acquireTimeout || 30000, // 30 seconds
      creationTimeout: options.creationTimeout || 10000, // 10 seconds
      healthCheckInterval: options.healthCheckInterval || 60000, // 1 minute
      enableHealthCheck: options.enableHealthCheck !== false,
      resetOnReturn: options.resetOnReturn || false,
    };

    // Start health check timer
    if (this.config.enableHealthCheck && this.healthChecker) {
      this.healthCheckTimer = setInterval(() => {
        this.performHealthCheck();
      }, this.config.healthCheckInterval);
    }

    // Pre-fill to minimum size
    this.ensureMinSize();
  }

  /**
   * Acquire resource from pool
   */
  async acquire(): Promise<T> {
    // Try to get available resource
    while (this.available.length > 0) {
      const pooledResource = this.available.pop()!;

      // Check if resource is healthy
      if (await this.isResourceHealthy(pooledResource)) {
        pooledResource.isAcquired = true;
        pooledResource.lastUsed = Date.now();
        pooledResource.useCount++;
        this.inUse.add(pooledResource);
        return pooledResource.resource;
      }

      // Destroy unhealthy resource
      await this.destroyResource(pooledResource);
    }

    // Create new resource if under max size
    if (this.getTotalSize() < this.config.maxSize) {
      const resource = await this.createResource();
      const pooledResource: PooledResource<T> = {
        resource,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        useCount: 1,
        health: ResourceHealth.HEALTHY,
        lastHealthCheck: Date.now(),
        isAcquired: true,
      };

      this.inUse.add(pooledResource);
      return resource;
    }

    // Wait for available resource
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex((item) => item.resolve === resolve);
        if (index >= 0) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new Error('Resource acquisition timeout'));
      }, this.config.acquireTimeout);

      this.waitingQueue.push({ resolve, reject, timeout });
    });
  }

  /**
   * Release resource back to pool
   */
  async release(resource: T): Promise<void> {
    const pooledResource = this.findPooledResource(resource);
    if (!pooledResource || !this.inUse.has(pooledResource)) {
      throw new Error('Resource not found in pool or not acquired');
    }

    this.inUse.delete(pooledResource);
    pooledResource.isAcquired = false;

    try {
      // Reset resource if configured
      if (this.config.resetOnReturn && this.resetter) {
        await this.resetter(resource);
      }

      // Return to available pool
      this.available.push(pooledResource);

      // Process waiting queue
      this.processWaitingQueue();
    } catch (error) {
      // If reset fails, destroy resource
      await this.destroyResource(pooledResource);
      this.processWaitingQueue();
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      total: this.getTotalSize(),
      maxSize: this.config.maxSize,
      minSize: this.config.minSize,
      waitingQueue: this.waitingQueue.length,
      averageUseCount: this.calculateAverageUseCount(),
      oldestResource: this.getOldestResourceAge(),
      healthStatus: this.getHealthStatus(),
    };
  }

  /**
   * Perform health check on all resources
   */
  async performHealthCheck(): Promise<void> {
    if (!this.healthChecker) {
      return;
    }

    const checkResource = async (pooledResource: PooledResource<T>) => {
      try {
        const isHealthy = await this.healthChecker!(pooledResource.resource);
        pooledResource.health = isHealthy ? ResourceHealth.HEALTHY : ResourceHealth.UNHEALTHY;
        pooledResource.lastHealthCheck = Date.now();

        if (!isHealthy) {
          if (pooledResource.isAcquired) {
            // Mark for removal when returned
            pooledResource.health = ResourceHealth.UNHEALTHY;
          } else {
            // Remove immediately
            this.available = this.available.filter((r) => r !== pooledResource);
            await this.destroyResource(pooledResource);
          }
        }
      } catch (error) {
        console.warn('Health check failed:', error);
        pooledResource.health = ResourceHealth.UNKNOWN;
      }
    };

    // Check available resources
    await Promise.all(this.available.map(checkResource));

    // Check in-use resources
    await Promise.all(Array.from(this.inUse).map(checkResource));
  }

  /**
   * Clear all resources
   */
  async clear(): Promise<void> {
    // Destroy available resources
    const availableDestructions = this.available.map((resource) => this.destroyResource(resource));
    this.available.length = 0;

    // Destroy in-use resources
    const inUseDestructions = Array.from(this.inUse).map((resource) =>
      this.destroyResource(resource),
    );
    this.inUse.clear();

    // Wait for all destructions
    await Promise.all([...availableDestructions, ...inUseDestructions]);

    // Clear waiting queue
    for (const item of this.waitingQueue) {
      clearTimeout(item.timeout);
      item.reject(new Error('Pool cleared'));
    }
    this.waitingQueue.length = 0;
  }

  /**
   * Destroy pool and cleanup
   */
  async destroy(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    await this.clear();
  }

  /**
   * Create new resource
   */
  private async createResource(): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Resource creation timeout'));
      }, this.config.creationTimeout);

      Promise.resolve(this.factory())
        .then((resource) => {
          clearTimeout(timeout);
          resolve(resource);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Destroy resource
   */
  private async destroyResource(pooledResource: PooledResource<T>): Promise<void> {
    if (this.destroyer) {
      try {
        await this.destroyer(pooledResource.resource);
      } catch (error) {
        console.warn('Resource destruction failed:', error);
      }
    }
  }

  /**
   * Check if resource is healthy
   */
  private async isResourceHealthy(pooledResource: PooledResource<T>): Promise<boolean> {
    if (!this.healthChecker) {
      return true;
    }

    // Check age
    const age = Date.now() - pooledResource.lastUsed;
    if (age > this.config.maxIdleTime) {
      return false;
    }

    // Perform health check
    try {
      const isHealthy = await this.healthChecker(pooledResource.resource);
      pooledResource.health = isHealthy ? ResourceHealth.HEALTHY : ResourceHealth.UNHEALTHY;
      pooledResource.lastHealthCheck = Date.now();
      return isHealthy;
    } catch {
      pooledResource.health = ResourceHealth.UNKNOWN;
      return false;
    }
  }

  /**
   * Find pooled resource by resource instance
   */
  private findPooledResource(resource: T): PooledResource<T> | null {
    // Check in-use resources
    for (const pooledResource of this.inUse) {
      if (pooledResource.resource === resource) {
        return pooledResource;
      }
    }

    // Check available resources
    for (const pooledResource of this.available) {
      if (pooledResource.resource === resource) {
        return pooledResource;
      }
    }

    return null;
  }

  /**
   * Process waiting queue
   */
  private processWaitingQueue(): void {
    while (this.waitingQueue.length > 0 && this.available.length > 0) {
      const waiter = this.waitingQueue.shift()!;
      clearTimeout(waiter.timeout);

      const pooledResource = this.available.pop()!;
      pooledResource.isAcquired = true;
      pooledResource.lastUsed = Date.now();
      pooledResource.useCount++;
      this.inUse.add(pooledResource);

      waiter.resolve(pooledResource.resource);
    }
  }

  /**
   * Ensure minimum pool size
   */
  private async ensureMinSize(): Promise<void> {
    const currentSize = this.getTotalSize();
    const needed = this.config.minSize - currentSize;

    if (needed > 0) {
      for (let i = 0; i < needed; i++) {
        try {
          const resource = await this.createResource();
          const pooledResource: PooledResource<T> = {
            resource,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            useCount: 0,
            health: ResourceHealth.HEALTHY,
            lastHealthCheck: Date.now(),
            isAcquired: false,
          };
          this.available.push(pooledResource);
        } catch (error) {
          console.warn('Failed to create resource for minimum pool size:', error);
        }
      }
    }
  }

  /**
   * Get total pool size
   */
  private getTotalSize(): number {
    return this.available.length + this.inUse.size;
  }

  /**
   * Calculate average use count
   */
  private calculateAverageUseCount(): number {
    const allResources = [...this.available, ...Array.from(this.inUse)];
    if (allResources.length === 0) {
      return 0;
    }

    const totalUse = allResources.reduce((sum, resource) => sum + resource.useCount, 0);
    return totalUse / allResources.length;
  }

  /**
   * Get oldest resource age
   */
  private getOldestResourceAge(): number | null {
    const allResources = [...this.available, ...Array.from(this.inUse)];
    if (allResources.length === 0) {
      return null;
    }

    const oldest = Math.min(...allResources.map((resource) => resource.createdAt));
    return Date.now() - oldest;
  }

  /**
   * Get health status summary
   */
  private getHealthStatus() {
    const allResources = [...this.available, ...Array.from(this.inUse)];
    const healthy = allResources.filter((r) => r.health === ResourceHealth.HEALTHY).length;
    const unhealthy = allResources.filter((r) => r.health === ResourceHealth.UNHEALTHY).length;
    const unknown = allResources.filter((r) => r.health === ResourceHealth.UNKNOWN).length;

    return { healthy, unhealthy, unknown, total: allResources.length };
  }
}

/**
 * Database connection pool for test databases
 */
export function createDatabaseConnectionPool(config: {
  connectionString: string;
  maxConnections?: number;
  createConnection: () => Promise<any>;
  destroyConnection: (connection: any) => Promise<void>;
  testConnection: (connection: any) => Promise<boolean>;
}) {
  return new EnhancedResourcePool(config.createConnection, {
    destroy: config.destroyConnection,
    healthCheck: config.testConnection,
    maxSize: config.maxConnections || 5,
    minSize: 1,
    maxIdleTime: 300000, // 5 minutes
    healthCheckInterval: 60000, // 1 minute
  });
}

/**
 * Browser context pool for Playwright or similar
 */
export function createBrowserContextPool(config: {
  browser: any;
  maxContexts?: number;
  createContext: () => Promise<any>;
  destroyContext: (context: any) => Promise<void>;
  resetContext: (context: any) => Promise<void>;
}) {
  return new EnhancedResourcePool(config.createContext, {
    destroy: config.destroyContext,
    reset: config.resetContext,
    healthCheck: async (context) => {
      try {
        // Check if context is still responsive
        await context.pages();
        return true;
      } catch {
        return false;
      }
    },
    maxSize: config.maxContexts || 3,
    minSize: 0,
    maxIdleTime: 600000, // 10 minutes
    resetOnReturn: true,
  });
}

/**
 * Mock server pool for API mocking
 */
export function createMockServerPool(config: {
  createServer: () => Promise<any>;
  destroyServer: (server: any) => Promise<void>;
  resetServer: (server: any) => Promise<void>;
  maxServers?: number;
}) {
  return new EnhancedResourcePool(config.createServer, {
    destroy: config.destroyServer,
    reset: config.resetServer,
    healthCheck: async (server) => {
      try {
        // Check if server is responsive
        return server.listening;
      } catch {
        return false;
      }
    },
    maxSize: config.maxServers || 2,
    minSize: 0,
    maxIdleTime: 180000, // 3 minutes
    resetOnReturn: true,
  });
}

/**
 * Resource pool manager for managing multiple pools
 */
export class ResourcePoolManager {
  private pools = new Map<string, EnhancedResourcePool<any>>();
  private config: ResourcePoolConfig;

  constructor(config: ResourcePoolConfig = {}) {
    this.config = {
      maxSize: 10,
      minSize: 0,
      maxIdleTime: 300000,
      acquireTimeout: 30000,
      creationTimeout: 10000,
      healthCheckInterval: 60000,
      enableHealthCheck: true,
      resetOnReturn: false,
      ...config,
    };
  }

  /**
   * Register a resource pool
   */
  registerPool<T>(
    name: string,
    factory: () => T | Promise<T>,
    options: {
      destroy?: (resource: T) => void | Promise<void>;
      healthCheck?: (resource: T) => boolean | Promise<boolean>;
      reset?: (resource: T) => void | Promise<void>;
    } & ResourcePoolConfig = {},
  ): void {
    const pool = new EnhancedResourcePool(factory, { ...this.config, ...options });
    this.pools.set(name, pool);
  }

  /**
   * Get resource from specific pool
   */
  async acquire<T>(poolName: string): Promise<T> {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw new Error(`Resource pool '${poolName}' not found`);
    }
    return pool.acquire();
  }

  /**
   * Release resource to specific pool
   */
  async release(poolName: string, resource: any): Promise<void> {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw new Error(`Resource pool '${poolName}' not found`);
    }
    return pool.release(resource);
  }

  /**
   * Get statistics for all pools
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [name, pool] of this.pools.entries()) {
      stats[name] = pool.getStats();
    }
    return stats;
  }

  /**
   * Clear all pools
   */
  async clearAll(): Promise<void> {
    const promises = Array.from(this.pools.values()).map((pool) => pool.clear());
    await Promise.all(promises);
  }

  /**
   * Destroy all pools
   */
  async destroyAll(): Promise<void> {
    const promises = Array.from(this.pools.values()).map((pool) => pool.destroy());
    await Promise.all(promises);
    this.pools.clear();
  }

  /**
   * Perform health check on all pools
   */
  async performHealthCheckAll(): Promise<void> {
    const promises = Array.from(this.pools.values()).map((pool) => pool.performHealthCheck());
    await Promise.all(promises);
  }
}

/**
 * Global resource pool manager
 */
export const globalResourcePoolManager = new ResourcePoolManager();

/**
 * Pre-configured resource pools for common testing needs
 */
export const commonResourcePools = {
  registerCommonPools: () => {
    // Example: Memory cache pool
    globalResourcePoolManager.registerPool('memoryCache', () => new Map<string, any>(), {
      destroy: async (cache: Map<string, any>) => cache.clear(),
      reset: async (cache: Map<string, any>) => cache.clear(),
      maxSize: 5,
    });

    // Example: Event emitter pool
    globalResourcePoolManager.registerPool(
      'eventEmitter',
      () => {
        const emitter = {
          listeners: new Map<string, Set<Function>>(),
          on: (event: string, listener: Function) => {
            if (!emitter.listeners.has(event)) {
              emitter.listeners.set(event, new Set());
            }
            emitter.listeners.get(event)!.add(listener);
          },
          off: (event: string, listener: Function) => {
            emitter.listeners.get(event)?.delete(listener);
          },
          emit: (event: string, ...args: any[]) => {
            emitter.listeners.get(event)?.forEach((listener) => listener(...args));
          },
          reset: () => emitter.listeners.clear(),
        };
        return emitter;
      },
      {
        reset: async (emitter: any) => emitter.reset(),
        maxSize: 10,
      },
    );
  },
};

/**
 * Initialize common resource pools
 */
commonResourcePools.registerCommonPools();
