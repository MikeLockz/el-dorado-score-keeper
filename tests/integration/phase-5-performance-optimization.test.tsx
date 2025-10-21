/**
 * Phase 5 Performance Optimization Validation Tests
 *
 * This test file validates the performance optimization utilities implemented
 * in Phase 5 of the test infrastructure overhaul, including caching,
 * resource pooling, lightweight mocks, and performance monitoring.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { render } from '@testing-library/react';
import {
  PerformanceCache,
  TestResourcePool,
  TestPerformanceMonitor,
  createMemoizedFactory,
  createBatchOperations,
  optimizedRender,
  optimizedRenderHook,
  globalTestCache,
  globalPerformanceMonitor,
} from '../utils/performance-optimization';
import {
  LightweightMockFactory,
  createFastMock,
  createLightweightStateMock,
  createLightweightContextMock,
  createFastStorageMock,
  createLightweightFetchMock,
  createLightweightEventEmitterMock,
  commonMockFactory,
} from '../utils/lightweight-mocks';
import {
  SmartCache,
  ComponentRenderCache,
  DataPreparationCache,
  EnvironmentSetupCache,
  globalComponentCache,
  globalDataCache,
  globalEnvironmentCache,
  withCaching,
} from '../utils/smart-caching';
import {
  EnhancedResourcePool,
  createDatabaseConnectionPool,
  createBrowserContextPool,
  createMockServerPool,
  ResourcePoolManager,
  globalResourcePoolManager,
} from '../utils/resource-pooling';
import {
  PerformanceMonitor,
  withPerformanceMonitoring,
  performanceAssertions,
  globalPerformanceMonitor,
  MetricType,
  PerformanceAssertions,
} from '../utils/performance-monitoring';

describe('Phase 5: Performance Optimization Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalTestCache.clear();
    globalPerformanceMonitor.clear();
  });

  afterEach(() => {
    globalTestCache.clear();
    globalPerformanceMonitor.clear();
  });

  describe('Performance Cache Utilities', () => {
    it('should create and use performance cache correctly', () => {
      const cache = new PerformanceCache(10, 1000);

      // Test set and get
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Test cache miss
      expect(cache.get('nonexistent')).toBeNull();

      // Test cache statistics
      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(10);
    });

    it('should handle cache expiration', async () => {
      const cache = new PerformanceCache(10, 50); // 50ms TTL

      cache.set('expire-key', 'expire-value');
      expect(cache.get('expire-key')).toBe('expire-value');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(cache.get('expire-key')).toBeNull();
    });

    it('should handle LRU eviction', () => {
      const cache = new PerformanceCache(2, 10000);

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3'); // Should evict key1

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });
  });

  describe('Test Resource Pool', () => {
    it('should create and manage resource pool correctly', async () => {
      let createCount = 0;
      const pool = new TestResourcePool(
        () => {
          createCount++;
          return { id: createCount };
        },
        {
          maxSize: 2,
          cleanup: (resource) => {
            resource.destroyed = true;
          },
        },
      );

      // Acquire resources
      const resource1 = await pool.acquire();
      const resource2 = await pool.acquire();

      expect(resource1.id).toBe(1);
      expect(resource2.id).toBe(2);
      expect(pool.size()).toBe(2);

      // Release and reuse
      pool.release(resource1);
      const resource3 = await pool.acquire();
      expect(resource3).toBeDefined(); // Got a resource

      // Cleanup
      pool.clear();
      expect(pool.size()).toBe(0);
    });

    it('should handle pool size limits', async () => {
      const pool = new TestResourcePool(() => Promise.resolve({ created: Date.now() }), {
        maxSize: 1,
      });

      const resource1 = await pool.acquire();
      const resource2Promise = pool.acquire();

      // Second acquire should wait
      expect(pool.size()).toBe(1);

      pool.release(resource1);
      const resource2 = await resource2Promise;

      expect(resource2).toBeDefined();
      pool.clear();
    });
  });

  describe('Performance Monitoring', () => {
    it('should track test performance metrics', () => {
      const monitor = new TestPerformanceMonitor();

      monitor.startTest();
      monitor.markSetupComplete();

      // Simulate some work
      const start = performance.now();
      while (performance.now() - start < 10) {
        // Busy wait for at least 10ms
      }

      const metrics = monitor.endTest();

      expect(metrics.setupTime).toBeGreaterThanOrEqual(0);
      expect(metrics.executionTime).toBeGreaterThanOrEqual(10);
      expect(metrics.totalTime).toBeGreaterThan(0);
    });

    it('should calculate average metrics correctly', () => {
      const monitor = new TestPerformanceMonitor();

      // Run multiple tests
      for (let i = 0; i < 3; i++) {
        monitor.startTest();
        monitor.markSetupComplete();
        const metrics = monitor.endTest();
      }

      const average = monitor.getAverageMetrics();
      expect(average.setupTime).toBeGreaterThanOrEqual(0);
      expect(average.executionTime).toBeGreaterThanOrEqual(0);
      expect(average.totalTime).toBeGreaterThan(0);
    });
  });

  describe('Optimized Render Functions', () => {
    it('should cache render results when enabled', () => {
      const TestComponent = () => React.createElement('div', null, 'Test');

      // First render should create and cache
      const result1 = optimizedRender.render(React.createElement(TestComponent), {
        cacheKey: 'test-component',
        enableCaching: true,
      });

      // Second render should use cache
      const result2 = optimizedRender.render(React.createElement(TestComponent), {
        cacheKey: 'test-component',
        enableCaching: true,
      });

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();

      const stats = optimizedRender.getCacheStats();
      expect(stats.hits).toBeGreaterThanOrEqual(1);
    });

    it('should not cache when disabled', () => {
      const TestComponent = () => React.createElement('div', null, 'Test');

      optimizedRender.render(React.createElement(TestComponent), {
        cacheKey: 'test-component',
        enableCaching: false,
      });

      const stats = optimizedRender.getCacheStats();
      expect(stats.hits).toBe(0);
    });
  });

  describe('Memoized Factory', () => {
    it('should cache factory results', async () => {
      let callCount = 0;
      const factory = createMemoizedFactory(
        async (value: string) => {
          callCount++;
          return Promise.resolve(`${value}-processed`);
        },
        { ttl: 1000 },
      );

      // First call should execute factory
      const result1 = await factory.create('test');
      expect(result1).toBe('test-processed');
      expect(callCount).toBe(1);

      // Second call should use cache
      const result2 = await factory.create('test');
      expect(result2).toBe('test-processed');
      expect(callCount).toBe(1); // Still 1, used cache

      // Different argument should execute factory
      const result3 = await factory.create('other');
      expect(result3).toBe('other-processed');
      expect(callCount).toBe(2);
    });
  });

  describe('Batch Operations', () => {
    it('should execute operations in batch', async () => {
      const batch = createBatchOperations<string>();

      batch.add(async () => 'result1');
      batch.add(async () => 'result2');
      batch.add(async () => 'result3');

      const results = await batch.execute();

      expect(results).toEqual(['result1', 'result2', 'result3']);
      expect(batch.getResults()).toEqual(['result1', 'result2', 'result3']);
    });

    it('should handle batch errors gracefully', async () => {
      const batch = createBatchOperations<string>();

      batch.add(async () => 'result1');
      batch.add(async () => {
        throw new Error('Test error');
      });
      batch.add(async () => 'result3');

      await expect(batch.execute()).rejects.toThrow('Test error');
    });
  });

  describe('Lightweight Mock Factory', () => {
    it('should create and manage lightweight mocks', () => {
      const factory = new LightweightMockFactory({
        lazy: true,
        cacheResults: true,
        maxSize: 10,
      });

      // Register mock factories
      factory.register('testMock', () => vi.fn().mockReturnValue('mocked'));
      factory.register('expensiveMock', () => ({
        heavy: true,
        compute: vi.fn().mockReturnValue(42),
      }));

      // Get mocks
      const mock1 = factory.get('testMock');
      const mock2 = factory.get('expensiveMock');

      expect(mock1()).toBe('mocked');
      expect(mock2.compute()).toBe(42);

      // Test caching
      const mock1Again = factory.get('testMock');
      expect(mock1Again).toBe(mock1); // Same instance

      const stats = factory.getStats();
      expect(stats.registeredMocks).toBe(2);
      expect(stats.createdMocks).toBe(2);
    });

    it('should reset mocks correctly', () => {
      const factory = new LightweightMockFactory();
      factory.register('testMock', () => vi.fn().mockReturnValue('original'));

      const mock = factory.get('testMock');
      mock(); // Call it once
      expect(mock).toHaveBeenCalledTimes(1);

      factory.reset('testMock');
      expect(mock).toHaveBeenCalledTimes(0); // Reset

      factory.resetAll();
      expect(mock).toHaveBeenCalledTimes(0); // Still reset
    });
  });

  describe('Fast Mock Implementations', () => {
    it('should create fast function mocks', () => {
      const mockFn = createFastMock((x: number) => x * 2, {
        name: 'double',
        returnValue: 10,
      });

      expect(mockFn()).toBe(10);
      expect(typeof mockFn).toBe('function');
    });

    it('should create lightweight state mocks', () => {
      const stateMock = createLightweightStateMock(0, {
        onChange: (value) => console.log(`State changed to ${value}`),
        async: false,
      });

      expect(stateMock.current).toBe(0);

      const result1 = stateMock.setValue(5);
      expect(result1).toBe(5);
      expect(stateMock.current).toBe(5);

      const result2 = stateMock.setValue((prev) => prev + 1);
      expect(result2).toBe(6);
      expect(stateMock.current).toBe(6);
    });

    it('should create fast storage mocks', () => {
      const storage = createFastStorageMock();

      storage.setItem('key1', 'value1');
      expect(storage.getItem('key1')).toBe('value1');
      expect(storage.length).toBe(1);

      storage.removeItem('key1');
      expect(storage.getItem('key1')).toBeNull();
      expect(storage.length).toBe(0);
    });

    it('should create lightweight fetch mocks', async () => {
      const { mock: fetchMock, setResponse } = createLightweightFetchMock();

      setResponse('https://api.test.com', new Response('test data'));

      const response = await fetchMock('https://api.test.com');
      const text = await response.text();

      expect(text).toBe('test data');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should create lightweight event emitter mocks', () => {
      const emitter = createLightweightEventEmitterMock();

      const listener = vi.fn();
      emitter.on('test', listener);
      emitter.emit('test', 'data');

      expect(listener).toHaveBeenCalledWith('data');
      expect(emitter.listenerCount('test')).toBe(1);
      expect(emitter.getEventLog()).toHaveLength(1);
    });
  });

  describe('Smart Caching', () => {
    it('should create and use smart cache with dependencies', () => {
      const cache = new SmartCache<string>({
        maxSize: 5,
        defaultTTL: 1000,
        enableDependencyTracking: true,
      });

      // Set value with dependencies
      cache.set('key1', 'value1', {
        dependencies: ['dep1', 'dep2'],
        tags: ['test'],
      });

      expect(cache.get('key1')).toBe('value1');

      // Invalidate by dependency
      const invalidated = cache.invalidateByDependency('dep1');
      expect(invalidated).toBe(1);
      expect(cache.get('key1')).toBeNull();
    });

    it('should handle component render cache', () => {
      const componentCache = new ComponentRenderCache();
      const component = React.createElement('div', null, 'Test');

      // Mock render result
      const mockResult = {
        container: { innerHTML: '<div>Test</div>' },
        unmount: vi.fn(),
        rerender: vi.fn(),
      } as any;

      componentCache.cacheRender(component, mockResult, {
        props: { test: true },
        tags: ['component'],
      });

      const cached = componentCache.getCachedRender(component, { test: true });
      expect(cached).toBe(mockResult);

      const stats = componentCache.getStats();
      expect(stats.size).toBe(1);
    });

    it('should handle data preparation cache', () => {
      const dataCache = new DataPreparationCache();

      dataCache.cacheData(
        'expensiveOperation',
        { data: 'processed' },
        {
          parameters: { input: 'test' },
          tags: ['data'],
        },
      );

      const cached = dataCache.getCachedData('expensiveOperation', { input: 'test' });
      expect(cached).toEqual({ data: 'processed' });
    });

    it('should handle environment setup cache', () => {
      const envCache = new EnvironmentSetupCache();

      envCache.cacheSetup(
        'test',
        { configured: true },
        {
          configuration: { env: 'test' },
        },
      );

      const cached = envCache.getCachedSetup('test', { env: 'test' });
      expect(cached).toEqual({ configured: true });
    });
  });

  describe('Resource Pooling', () => {
    it('should create enhanced resource pool with health checking', async () => {
      let healthCheckCount = 0;
      const pool = new EnhancedResourcePool(
        () => Promise.resolve({ id: Math.random(), healthy: true }),
        {
          destroy: async (resource) => {
            resource.destroyed = true;
          },
          healthCheck: async (resource) => {
            healthCheckCount++;
            return resource.healthy;
          },
          maxSize: 2,
          enableHealthCheck: true,
          healthCheckInterval: 100,
        },
      );

      // Acquire resource
      const resource1 = await pool.acquire();
      expect(resource1.healthy).toBe(true);

      // Release and check health
      await pool.release(resource1);
      await pool.performHealthCheck();

      expect(healthCheckCount).toBeGreaterThan(0);

      const stats = pool.getStats();
      expect(stats.total).toBe(1);
      expect(stats.maxSize).toBe(2);

      await pool.destroy();
    });

    it('should handle resource pool manager', async () => {
      const manager = new ResourcePoolManager();

      manager.registerPool('testPool', () => Promise.resolve({ value: 'test' }), {
        destroy: async (resource) => {
          resource.destroyed = true;
        },
        maxSize: 2,
      });

      const resource = await manager.acquire('testPool');
      expect(resource.value).toBe('test');

      await manager.release('testPool', resource);

      const allStats = manager.getAllStats();
      expect(allStats.testPool).toBeDefined();
      expect(allStats.testPool.total).toBe(1);

      await manager.destroyAll();
    });
  });

  describe('Performance Monitoring System', () => {
    it('should track test execution with performance monitoring', () => {
      const monitor = new PerformanceMonitor({
        enabled: true,
        trackMemory: true,
        alertThresholds: {
          testDuration: 1000,
        },
      });

      monitor.startTest('performance-test', 'test-suite');

      // Simulate test work
      const start = performance.now();
      while (performance.now() - start < 5) {
        // Small delay
      }

      monitor.endTest('performance-test', 'test-suite', 'passed');

      const summary = monitor.getSummary();
      expect(summary.overall.totalTests).toBe(1);
      expect(summary.overall.averageDuration).toBeGreaterThan(0);
    });

    it('should handle custom metrics', () => {
      const monitor = new PerformanceMonitor({ enabled: true });

      monitor.addMetric({
        name: 'custom_metric',
        type: MetricType.CUSTOM,
        value: 42,
        unit: 'count',
        timestamp: Date.now(),
        tags: { component: 'test' },
      });

      const data = monitor.exportData();
      expect(data.metrics).toHaveLength(1);
      expect(data.metrics[0].name).toBe('custom_metric');
      expect(data.metrics[0].value).toBe(42);
    });

    it('should handle timer measurements', () => {
      const monitor = new PerformanceMonitor({ enabled: true });

      const startTime = monitor.startTimer('test-timer');
      expect(startTime).toBeGreaterThan(0);

      // Simulate some work
      const start = performance.now();
      while (performance.now() - start < 5) {
        // Small delay
      }

      const duration = monitor.endTimer('test-timer', { operation: 'test' });
      expect(duration).toBeGreaterThan(0);

      const data = monitor.exportData();
      const timerMetric = data.metrics.find((m) => m.name === 'timer_test-timer');
      expect(timerMetric).toBeDefined();
      expect(timerMetric!.value).toBe(duration);
    });
  });

  describe('Performance Decorator', () => {
    it('should wrap functions with performance monitoring', async () => {
      const monitor = new PerformanceMonitor({ enabled: true });

      const testFn = vi.fn().mockResolvedValue('result');
      const wrappedFn = withPerformanceMonitoring('decorated-test', testFn, monitor);

      const result = await wrappedFn();

      expect(result).toBe('result');
      expect(testFn).toHaveBeenCalledTimes(1);

      const summary = monitor.getSummary();
      expect(summary.overall.totalTests).toBe(1);
    });
  });

  describe('Integration Tests', () => {
    it('should work with all optimizations combined', async () => {
      const monitor = new PerformanceMonitor({ enabled: true });
      const cache = new SmartCache<any>({ maxSize: 10 });
      const factory = new LightweightMockFactory();

      // Register mock in factory
      factory.register('apiMock', () => vi.fn().mockResolvedValue({ data: 'cached' }));

      monitor.startTimer('integration-test');

      // Use cached operation
      const cachedOperation = withCaching(
        'api-call',
        async () => {
          const mock = factory.get('apiMock');
          return await mock();
        },
        { useDataCache: true, ttl: 1000 },
      );

      const result1 = await cachedOperation();
      const result2 = await cachedOperation(); // Should use cache

      expect(result1).toEqual({ data: 'cached' });
      expect(result2).toEqual({ data: 'cached' });

      const duration = monitor.endTimer('integration-test');
      expect(duration).toBeGreaterThan(0);

      const cacheStats = cache.getStats();
      expect(cacheStats.size).toBeGreaterThanOrEqual(0);
    });

    it('should handle performance assertions', () => {
      const monitor = new PerformanceMonitor({
        enabled: true,
        alertThresholds: { testDuration: 1000 },
      });

      monitor.startTest('assertion-test', 'test-suite');
      monitor.endTest('assertion-test', 'test-suite', 'passed');

      const assertions = new PerformanceAssertions(monitor);

      // Should not throw
      assertions.assertTestUnderDuration('assertion-test', 1000);
      assertions.assertAverageTestDurationUnder(2000);
    });
  });

  describe('Global Utilities', () => {
    it('should provide access to global cache and monitoring', () => {
      // Test global cache
      globalTestCache.set('global-test', 'global-value');
      expect(globalTestCache.get('global-test')).toBe('global-value');

      // Test global monitoring
      globalPerformanceMonitor.startTest('global-test', 'global-suite');
      globalPerformanceMonitor.endTest('global-test', 'global-suite');

      const summary = globalPerformanceMonitor.getSummary();
      expect(summary.overall.totalTests).toBeGreaterThanOrEqual(1);
    });
  });
});
