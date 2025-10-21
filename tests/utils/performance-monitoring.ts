/**
 * Performance Monitoring and Metrics for Test Optimization
 *
 * This module provides comprehensive performance monitoring capabilities
 * to track test execution metrics, identify bottlenecks, and optimize
 * test suite performance over time.
 */

import { vi } from 'vitest';

/**
 * Performance measurement types
 */
export enum MetricType {
  DURATION = 'duration',
  MEMORY = 'memory',
  CPU = 'cpu',
  NETWORK = 'network',
  CUSTOM = 'custom',
}

/**
 * Performance metric interface
 */
export interface PerformanceMetric {
  name: string;
  type: MetricType;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
}

/**
 * Test execution record
 */
export interface TestExecutionRecord {
  testName: string;
  suiteName: string;
  startTime: number;
  endTime: number;
  duration: number;
  metrics: PerformanceMetric[];
  status: 'passed' | 'failed' | 'skipped';
  error?: Error;
  memoryBefore?: number;
  memoryAfter?: number;
  memoryPeak?: number;
}

/**
 * Performance snapshot
 */
export interface PerformanceSnapshot {
  timestamp: number;
  memory: {
    used: number;
    total: number;
    limit: number;
  };
  cpu: {
    usage: number;
  };
  testMetrics: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    averageDuration: number;
    slowestTest: string;
    fastestTest: string;
  };
  resourceStats: Record<string, any>;
}

/**
 * Performance monitoring configuration
 */
export interface PerformanceMonitoringConfig {
  enabled?: boolean;
  trackMemory?: boolean;
  trackCPU?: boolean;
  trackNetwork?: boolean;
  samplingRate?: number;
  maxHistorySize?: number;
  alertThresholds?: {
    testDuration?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  reportInterval?: number;
}

/**
 * Performance monitoring system
 */
export class PerformanceMonitor {
  private config: Required<PerformanceMonitoringConfig>;
  private metrics: PerformanceMetric[] = [];
  private testRecords: TestExecutionRecord[] = [];
  private currentTest: Partial<TestExecutionRecord> | null = null;
  private snapshots: PerformanceSnapshot[] = [];
  private timers = new Map<string, number>();
  private memoryBaseline: number | null = null;
  private reportTimer?: NodeJS.Timeout;

  constructor(config: PerformanceMonitoringConfig = {}) {
    this.config = {
      enabled: config.enabled !== false,
      trackMemory: config.trackMemory !== false,
      trackCPU: config.trackCPU || false,
      trackNetwork: config.trackNetwork || false,
      samplingRate: config.samplingRate || 1.0,
      maxHistorySize: config.maxHistorySize || 1000,
      alertThresholds: {
        testDuration: config.alertThresholds?.testDuration || 5000,
        memoryUsage: config.alertThresholds?.memoryUsage || 100 * 1024 * 1024, // 100MB
        cpuUsage: config.alertThresholds?.cpuUsage || 80,
        ...config.alertThresholds,
      },
      reportInterval: config.reportInterval || 60000, // 1 minute
    };

    if (this.config.enabled) {
      this.memoryBaseline = this.getCurrentMemoryUsage();
      this.startPeriodicReporting();
    }
  }

  /**
   * Start monitoring a test
   */
  startTest(testName: string, suiteName: string): void {
    if (!this.config.enabled) return;

    const startTime = performance.now();
    const memoryBefore = this.config.trackMemory ? this.getCurrentMemoryUsage() : undefined;

    this.currentTest = {
      testName,
      suiteName,
      startTime,
      metrics: [],
      memoryBefore,
      status: 'passed',
    };

    this.timers.set(`${suiteName}:${testName}`, startTime);
  }

  /**
   * End monitoring a test
   */
  endTest(
    testName: string,
    suiteName: string,
    status: 'passed' | 'failed' | 'skipped' = 'passed',
    error?: Error,
  ): void {
    if (!this.config.enabled || !this.currentTest) return;

    const endTime = performance.now();
    const startTime = this.currentTest.startTime || endTime;
    const duration = endTime - startTime;
    const memoryAfter = this.config.trackMemory ? this.getCurrentMemoryUsage() : undefined;

    const record: TestExecutionRecord = {
      ...this.currentTest,
      testName,
      suiteName,
      endTime,
      duration,
      status,
      error,
      memoryAfter,
      memoryPeak: this.calculateMemoryPeak(this.currentTest.memoryBefore, memoryAfter),
    };

    this.testRecords.push(record);

    // Add duration metric
    this.addMetric({
      name: 'test_duration',
      type: MetricType.DURATION,
      value: duration,
      unit: 'ms',
      timestamp: endTime,
      tags: {
        test_name: testName,
        suite_name: suiteName,
        status,
      },
    });

    // Add memory metric if tracking
    if (this.config.trackMemory && record.memoryBefore && record.memoryAfter) {
      this.addMetric({
        name: 'test_memory_delta',
        type: MetricType.MEMORY,
        value: record.memoryAfter - record.memoryBefore,
        unit: 'bytes',
        timestamp: endTime,
        tags: {
          test_name: testName,
          suite_name: suiteName,
        },
      });
    }

    // Check alert thresholds
    this.checkAlerts(record);

    this.currentTest = null;
    this.timers.delete(`${suiteName}:${testName}`);

    // Trim history if needed
    this.trimHistory();
  }

  /**
   * Add a custom metric
   */
  addMetric(metric: PerformanceMetric): void {
    if (!this.config.enabled) return;

    // Apply sampling
    if (Math.random() > this.config.samplingRate) {
      return;
    }

    this.metrics.push(metric);

    // Trim metrics if needed
    if (this.metrics.length > this.config.maxHistorySize) {
      this.metrics = this.metrics.slice(-this.config.maxHistorySize);
    }
  }

  /**
   * Start a timer for a custom measurement
   */
  startTimer(name: string): number {
    if (!this.config.enabled) return 0;
    const startTime = performance.now();
    this.timers.set(name, startTime);
    return startTime;
  }

  /**
   * End a timer and record duration
   */
  endTimer(name: string, tags?: Record<string, string>): number {
    if (!this.config.enabled) return 0;

    const startTime = this.timers.get(name);
    if (!startTime) {
      console.warn(`Timer '${name}' not found`);
      return 0;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    this.addMetric({
      name: `timer_${name}`,
      type: MetricType.DURATION,
      value: duration,
      unit: 'ms',
      timestamp: endTime,
      tags,
    });

    this.timers.delete(name);
    return duration;
  }

  /**
   * Measure memory usage
   */
  measureMemory(name: string, tags?: Record<string, string>): number | null {
    if (!this.config.enabled || !this.config.trackMemory) return null;

    const memory = this.getCurrentMemoryUsage();
    if (memory !== null) {
      this.addMetric({
        name: `memory_${name}`,
        type: MetricType.MEMORY,
        value: memory,
        unit: 'bytes',
        timestamp: Date.now(),
        tags,
      });
    }

    return memory;
  }

  /**
   * Take a performance snapshot
   */
  takeSnapshot(): PerformanceSnapshot {
    const timestamp = Date.now();
    const memory = this.getMemoryInfo();
    const cpu = this.getCPUInfo();
    const testMetrics = this.calculateTestMetrics();
    const resourceStats = this.getResourceStats();

    const snapshot: PerformanceSnapshot = {
      timestamp,
      memory,
      cpu,
      testMetrics,
      resourceStats,
    };

    this.snapshots.push(snapshot);

    // Trim snapshots if needed
    if (this.snapshots.length > 100) {
      this.snapshots = this.snapshots.slice(-100);
    }

    return snapshot;
  }

  /**
   * Get performance summary
   */
  getSummary(): {
    overall: {
      totalTests: number;
      averageDuration: number;
      slowestTest: { name: string; duration: number };
      fastestTest: { name: string; duration: number };
      passRate: number;
    };
    memory: {
      averageUsage: number;
      peakUsage: number;
      averageDelta: number;
    };
    trends: {
      testDuration: number[];
      memoryUsage: number[];
      timestamps: number[];
    };
    alerts: Array<{
      type: string;
      message: string;
      timestamp: number;
      metric: PerformanceMetric;
    }>;
  } {
    if (!this.config.enabled || this.testRecords.length === 0) {
      return {
        overall: {
          totalTests: 0,
          averageDuration: 0,
          slowestTest: { name: '', duration: 0 },
          fastestTest: { name: '', duration: 0 },
          passRate: 0,
        },
        memory: { averageUsage: 0, peakUsage: 0, averageDelta: 0 },
        trends: { testDuration: [], memoryUsage: [], timestamps: [] },
        alerts: [],
      };
    }

    const totalTests = this.testRecords.length;
    const passedTests = this.testRecords.filter((r) => r.status === 'passed').length;
    const averageDuration = this.testRecords.reduce((sum, r) => sum + r.duration, 0) / totalTests;

    const slowestTest = this.testRecords.reduce((slowest, current) =>
      current.duration > slowest.duration ? current : slowest,
    );

    const fastestTest = this.testRecords.reduce((fastest, current) =>
      current.duration < fastest.duration ? current : fastest,
    );

    const memoryTests = this.testRecords.filter((r) => r.memoryBefore && r.memoryAfter);
    const averageMemoryDelta =
      memoryTests.length > 0
        ? memoryTests.reduce((sum, r) => sum + (r.memoryAfter! - r.memoryBefore!), 0) /
          memoryTests.length
        : 0;

    const trends = {
      testDuration: this.testRecords.map((r) => r.duration),
      memoryUsage: memoryTests.map((r) => r.memoryAfter!),
      timestamps: this.testRecords.map((r) => r.endTime),
    };

    return {
      overall: {
        totalTests,
        averageDuration,
        slowestTest: { name: slowestTest.testName, duration: slowestTest.duration },
        fastestTest: { name: fastestTest.testName, duration: fastestTest.duration },
        passRate: (passedTests / totalTests) * 100,
      },
      memory: {
        averageUsage: this.calculateAverageMemoryUsage(),
        peakUsage: this.calculatePeakMemoryUsage(),
        averageDelta: averageMemoryDelta,
      },
      trends,
      alerts: this.getAlerts(),
    };
  }

  /**
   * Export performance data
   */
  exportData(): {
    metrics: PerformanceMetric[];
    testRecords: TestExecutionRecord[];
    snapshots: PerformanceSnapshot[];
    summary: ReturnType<PerformanceMonitor['getSummary']>;
  } {
    return {
      metrics: [...this.metrics],
      testRecords: [...this.testRecords],
      snapshots: [...this.snapshots],
      summary: this.getSummary(),
    };
  }

  /**
   * Clear all performance data
   */
  clear(): void {
    this.metrics.length = 0;
    this.testRecords.length = 0;
    this.snapshots.length = 0;
    this.timers.clear();
    this.currentTest = null;
    if (this.config.trackMemory) {
      this.memoryBaseline = this.getCurrentMemoryUsage();
    }
  }

  /**
   * Destroy performance monitor
   */
  destroy(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = undefined;
    }
    this.clear();
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number | null {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return null;
  }

  /**
   * Get memory information
   */
  private getMemoryInfo() {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit,
      };
    }
    return { used: 0, total: 0, limit: 0 };
  }

  /**
   * Get CPU information
   */
  private getCPUInfo() {
    // Simplified CPU usage estimation
    return {
      usage: 0, // Would need more sophisticated implementation
    };
  }

  /**
   * Calculate test metrics
   */
  private calculateTestMetrics() {
    const totalTests = this.testRecords.length;
    const passedTests = this.testRecords.filter((r) => r.status === 'passed').length;
    const failedTests = this.testRecords.filter((r) => r.status === 'failed').length;
    const skippedTests = this.testRecords.filter((r) => r.status === 'skipped').length;

    const averageDuration =
      totalTests > 0 ? this.testRecords.reduce((sum, r) => sum + r.duration, 0) / totalTests : 0;

    const slowestTest = this.testRecords.reduce(
      (slowest, current) => (current.duration > slowest.duration ? current : slowest),
      { testName: '', duration: 0 },
    );

    const fastestTest = this.testRecords.reduce(
      (fastest, current) => (current.duration < fastest.duration ? current : fastest),
      { testName: '', duration: Infinity },
    );

    return {
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      averageDuration,
      slowestTest: slowestTest.testName,
      fastestTest: fastestTest.testName,
    };
  }

  /**
   * Get resource statistics
   */
  private getResourceStats(): Record<string, any> {
    // Placeholder for resource statistics
    return {
      activeTimers: this.timers.size,
      currentTest: this.currentTest?.testName || null,
    };
  }

  /**
   * Calculate memory peak
   */
  private calculateMemoryPeak(before?: number | null, after?: number | null): number | undefined {
    if (before !== null && before !== undefined && after !== null && after !== undefined) {
      return Math.max(before, after);
    }
    return undefined;
  }

  /**
   * Calculate average memory usage
   */
  private calculateAverageMemoryUsage(): number {
    const memoryMetrics = this.metrics.filter((m) => m.type === MetricType.MEMORY);
    if (memoryMetrics.length === 0) return 0;
    return memoryMetrics.reduce((sum, m) => sum + m.value, 0) / memoryMetrics.length;
  }

  /**
   * Calculate peak memory usage
   */
  private calculatePeakMemoryUsage(): number {
    const memoryMetrics = this.metrics.filter((m) => m.type === MetricType.MEMORY);
    if (memoryMetrics.length === 0) return 0;
    return Math.max(...memoryMetrics.map((m) => m.value));
  }

  /**
   * Check performance alerts
   */
  private checkAlerts(record: TestExecutionRecord): void {
    const alerts: Array<{
      type: string;
      message: string;
      timestamp: number;
      metric: PerformanceMetric;
    }> = [];

    // Check test duration
    if (record.duration > this.config.alertThresholds.testDuration) {
      alerts.push({
        type: 'slow_test',
        message: `Test ${record.testName} took ${record.duration.toFixed(2)}ms (threshold: ${this.config.alertThresholds.testDuration}ms)`,
        timestamp: record.endTime,
        metric: {
          name: 'test_duration',
          type: MetricType.DURATION,
          value: record.duration,
          unit: 'ms',
          timestamp: record.endTime,
        },
      });
    }

    // Check memory usage
    if (record.memoryAfter && record.memoryAfter > this.config.alertThresholds.memoryUsage) {
      alerts.push({
        type: 'high_memory',
        message: `Test ${record.testName} used ${(record.memoryAfter / 1024 / 1024).toFixed(2)}MB memory`,
        timestamp: record.endTime,
        metric: {
          name: 'test_memory_usage',
          type: MetricType.MEMORY,
          value: record.memoryAfter,
          unit: 'bytes',
          timestamp: record.endTime,
        },
      });
    }

    // Store alerts (would need alerts array in class)
  }

  /**
   * Get alerts
   */
  private getAlerts(): Array<{
    type: string;
    message: string;
    timestamp: number;
    metric: PerformanceMetric;
  }> {
    // Placeholder - would need to implement alerts storage
    return [];
  }

  /**
   * Start periodic reporting
   */
  private startPeriodicReporting(): void {
    if (this.config.reportInterval > 0) {
      this.reportTimer = setInterval(() => {
        this.takeSnapshot();
      }, this.config.reportInterval);
    }
  }

  /**
   * Trim history to prevent memory leaks
   */
  private trimHistory(): void {
    if (this.testRecords.length > this.config.maxHistorySize) {
      this.testRecords = this.testRecords.slice(-this.config.maxHistorySize);
    }
  }
}

/**
 * Performance monitoring decorator for test functions
 */
export function withPerformanceMonitoring<T extends (...args: any[]) => any>(
  testName: string,
  fn: T,
  monitor?: PerformanceMonitor,
): T {
  const useMonitor = monitor || globalPerformanceMonitor;

  return (async (...args: Parameters<T>) => {
    useMonitor.startTest(testName, 'decorated');
    try {
      const result = await fn(...args);
      useMonitor.endTest(testName, 'decorated', 'passed');
      return result;
    } catch (error) {
      useMonitor.endTest(testName, 'decorated', 'failed', error as Error);
      throw error;
    }
  }) as T;
}

/**
 * Performance assertion utilities
 */
export class PerformanceAssertions {
  constructor(private monitor: PerformanceMonitor = globalPerformanceMonitor) {}

  /**
   * Assert test duration is under threshold
   */
  assertTestUnderDuration(testName: string, maxDuration: number): void {
    const record = this.monitor.testRecords.find((r) => r.testName === testName);
    if (!record) {
      throw new Error(`Test ${testName} not found in performance records`);
    }

    if (record.duration > maxDuration) {
      throw new Error(
        `Test ${testName} took ${record.duration}ms, expected under ${maxDuration}ms`,
      );
    }
  }

  /**
   * Assert memory usage is under threshold
   */
  assertMemoryUnderThreshold(threshold: number): void {
    const currentMemory = this.monitor.getCurrentMemoryUsage();
    if (currentMemory && currentMemory > threshold) {
      throw new Error(`Memory usage ${currentMemory} exceeds threshold ${threshold}`);
    }
  }

  /**
   * Assert average test duration is under threshold
   */
  assertAverageTestDurationUnder(maxDuration: number): void {
    const summary = this.monitor.getSummary();
    if (summary.overall.averageDuration > maxDuration) {
      throw new Error(
        `Average test duration ${summary.overall.averageDuration}ms exceeds threshold ${maxDuration}ms`,
      );
    }
  }
}

/**
 * Global performance monitor instance
 */
export const globalPerformanceMonitor = new PerformanceMonitor({
  enabled: process.env.NODE_ENV !== 'production',
  trackMemory: true,
  trackCPU: false,
  trackNetwork: false,
  samplingRate: 1.0,
  maxHistorySize: 1000,
  alertThresholds: {
    testDuration: 5000,
    memoryUsage: 100 * 1024 * 1024, // 100MB
  },
  reportInterval: 60000, // 1 minute
});

/**
 * Global performance assertions
 */
export const performanceAssertions = new PerformanceAssertions(globalPerformanceMonitor);

/**
 * Export monitoring utilities
 */
export {
  PerformanceMonitor as Monitor,
  withPerformanceMonitoring as measurePerformance,
  PerformanceAssertions as AssertPerformance,
};
