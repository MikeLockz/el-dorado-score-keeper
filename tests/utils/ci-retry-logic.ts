/**
 * CI Retry Logic for Flaky Test Detection and Smart Retries
 *
 * This module provides intelligent retry mechanisms for CI environments,
 * including exponential backoff, flaky test pattern detection, and
 * context-aware retry decisions.
 */

import { vi } from 'vitest';

/**
 * Retry configuration options
 */
export interface RetryConfig {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  jitter?: boolean;
  retryableErrors?: string[];
  nonRetryableErrors?: string[];
  enableFlakyDetection?: boolean;
  flakyThreshold?: number;
}

/**
 * Test execution result
 */
export interface TestExecutionResult {
  success: boolean;
  error?: Error;
  executionTime: number;
  attempt: number;
  retryReason?: string;
  context?: TestExecutionContext;
}

/**
 * Test execution context for failure analysis
 */
export interface TestExecutionContext {
  testName: string;
  suiteName: string;
  filePath: string;
  timestamp: number;
  environment: {
    nodeVersion: string;
    platform: string;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  testState: {
    globalState?: Record<string, any>;
    componentLifecycle?: Record<string, any>;
    asyncOperations?: number;
  };
}

/**
 * Flaky test detection result
 */
export interface FlakyTestDetection {
  isFlaky: boolean;
  confidence: number;
  pattern: 'intermittent' | 'timing' | 'environment' | 'state_pollution';
  recentResults: TestExecutionResult[];
  recommendation: string;
}

/**
 * Smart retry manager with exponential backoff and flaky detection
 */
export class SmartRetryManager {
  private config: Required<RetryConfig>;
  private executionHistory = new Map<string, TestExecutionResult[]>();
  private flakyTests = new Set<string>();

  constructor(config: RetryConfig = {}) {
    this.config = {
      maxAttempts: config.maxAttempts || 3,
      baseDelay: config.baseDelay || 1000,
      maxDelay: config.maxDelay || 30000,
      backoffFactor: config.backoffFactor || 2,
      jitter: config.jitter !== false,
      retryableErrors: config.retryableErrors || [
        'Timeout',
        'Network',
        'Connection',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
      ],
      nonRetryableErrors: config.nonRetryableErrors || [
        'SyntaxError',
        'ReferenceError',
        'TypeError',
        'AssertionError',
      ],
      enableFlakyDetection: config.enableFlakyDetection !== false,
      flakyThreshold: config.flakyThreshold || 0.3,
    };
  }

  /**
   * Execute test with smart retry logic
   */
  async executeWithRetry<T>(
    testKey: string,
    testFn: () => Promise<T>,
    context: TestExecutionContext,
    options: {
      customRetryConfig?: Partial<RetryConfig>;
      onRetry?: (attempt: number, error: Error, delay: number) => void;
    } = {},
  ): Promise<T> {
    const retryConfig = { ...this.config, ...options.customRetryConfig };
    const results: TestExecutionResult[] = [];

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      const startTime = performance.now();

      try {
        // Clear any previous test state
        this.clearTestState(context);

        // Execute test
        const result = await testFn();
        const executionTime = performance.now() - startTime;

        // Record successful execution
        const successResult: TestExecutionResult = {
          success: true,
          executionTime,
          attempt,
          context,
        };

        results.push(successResult);
        this.recordExecution(testKey, successResult);

        // Check for flaky patterns (success after failures)
        if (attempt > 1 && this.config.enableFlakyDetection) {
          const flakyDetection = this.detectFlakyPattern(testKey);
          if (flakyDetection.isFlaky) {
            console.warn(`⚠️  Flaky test detected: ${testKey}`);
            console.warn(`Pattern: ${flakyDetection.pattern}`);
            console.warn(`Confidence: ${(flakyDetection.confidence * 100).toFixed(1)}%`);
            console.warn(`Recommendation: ${flakyDetection.recommendation}`);
          }
        }

        return result;
      } catch (error) {
        const executionTime = performance.now() - startTime;
        const testError = error as Error;

        // Record failed execution
        const failureResult: TestExecutionResult = {
          success: false,
          error: testError,
          executionTime,
          attempt,
          context,
        };

        results.push(failureResult);
        this.recordExecution(testKey, failureResult);

        // Check if we should retry
        if (attempt === retryConfig.maxAttempts) {
          // Final attempt failed
          const finalError = this.createFinalError(testKey, results);
          this.analyzeFinalFailure(testKey, results);
          throw finalError;
        }

        const shouldRetry = this.shouldRetry(testError, attempt, retryConfig);
        const retryReason = this.getRetryReason(testError, shouldRetry);

        if (!shouldRetry.shouldRetry) {
          // Non-retryable error
          throw this.createFinalError(testKey, results);
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt, retryConfig);

        // Notify about retry
        options.onRetry?.(attempt, testError, delay);

        // Log retry information
        console.log(`🔄 Retrying ${testKey} (attempt ${attempt + 1}/${retryConfig.maxAttempts})`);
        console.log(`   Error: ${testError.message}`);
        console.log(`   Reason: ${retryReason}`);
        console.log(`   Delay: ${delay}ms`);

        // Wait before retry
        await this.sleep(delay);

        // Cleanup before retry
        this.cleanupBeforeRetry(context);
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new Error('Unexpected execution path in retry logic');
  }

  /**
   * Detect flaky test patterns
   */
  detectFlakyPattern(testKey: string): FlakyTestDetection {
    const history = this.executionHistory.get(testKey) || [];
    const recentResults = history.slice(-10); // Last 10 executions

    if (recentResults.length < 3) {
      return {
        isFlaky: false,
        confidence: 0,
        pattern: 'intermittent',
        recentResults,
        recommendation: 'Need more execution history to detect flaky patterns',
      };
    }

    const failureRate = recentResults.filter((r) => !r.success).length / recentResults.length;
    const isFlaky = failureRate > this.config.flakyThreshold && failureRate < 1;

    // Analyze pattern type
    let pattern: FlakyTestDetection['pattern'] = 'intermittent';
    let confidence = failureRate;

    if (this.isTimingRelatedFlakiness(recentResults)) {
      pattern = 'timing';
      confidence = Math.min(confidence + 0.2, 1);
    } else if (this.isEnvironmentRelatedFlakiness(recentResults)) {
      pattern = 'environment';
      confidence = Math.min(confidence + 0.15, 1);
    } else if (this.isStatePollutionFlakiness(recentResults)) {
      pattern = 'state_pollution';
      confidence = Math.min(confidence + 0.25, 1);
    }

    const recommendation = this.getFlakyTestRecommendation(pattern, failureRate);

    return {
      isFlaky,
      confidence,
      pattern,
      recentResults,
      recommendation,
    };
  }

  /**
   * Get flaky test statistics
   */
  getFlakyTestStats(): {
    totalTests: number;
    flakyTests: number;
    flakyTestList: Array<{
      testKey: string;
      failureRate: number;
      pattern: string;
      confidence: number;
      executions: number;
    }>;
  } {
    const stats = {
      totalTests: this.executionHistory.size,
      flakyTests: 0,
      flakyTestList: [] as Array<{
        testKey: string;
        failureRate: number;
        pattern: string;
        confidence: number;
        executions: number;
      }>,
    };

    for (const [testKey, history] of this.executionHistory.entries()) {
      if (history.length < 3) continue;

      const detection = this.detectFlakyPattern(testKey);
      if (detection.isFlaky) {
        stats.flakyTests++;
        const failureRate =
          detection.recentResults.filter((r) => !r.success).length / detection.recentResults.length;

        stats.flakyTestList.push({
          testKey,
          failureRate,
          pattern: detection.pattern,
          confidence: detection.confidence,
          executions: history.length,
        });
      }
    }

    // Sort by failure rate descending
    stats.flakyTestList.sort((a, b) => b.failureRate - a.failureRate);

    return stats;
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory.clear();
    this.flakyTests.clear();
  }

  /**
   * Export execution data for analysis
   */
  exportData(): {
    config: Required<RetryConfig>;
    executionHistory: Record<string, TestExecutionResult[]>;
    flakyTests: string[];
    statistics: ReturnType<SmartRetryManager['getFlakyTestStats']>;
  } {
    return {
      config: this.config,
      executionHistory: Object.fromEntries(this.executionHistory),
      flakyTests: Array.from(this.flakyTests),
      statistics: this.getFlakyTestStats(),
    };
  }

  /**
   * Record test execution
   */
  private recordExecution(testKey: string, result: TestExecutionResult): void {
    if (!this.executionHistory.has(testKey)) {
      this.executionHistory.set(testKey, []);
    }

    const history = this.executionHistory.get(testKey)!;
    history.push(result);

    // Keep only last 50 executions per test
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
  }

  /**
   * Determine if error is retryable
   */
  private shouldRetry(
    error: Error,
    attempt: number,
    config: Required<RetryConfig>,
  ): { shouldRetry: boolean; reason: string } {
    const errorMessage = error.message;
    const errorName = error.constructor.name;

    // Check non-retryable errors first
    if (
      config.nonRetryableErrors.some(
        (pattern) => errorMessage.includes(pattern) || errorName.includes(pattern),
      )
    ) {
      return { shouldRetry: false, reason: `Non-retryable error: ${errorName}` };
    }

    // Check retryable errors
    if (
      config.retryableErrors.some(
        (pattern) => errorMessage.includes(pattern) || errorName.includes(pattern),
      )
    ) {
      return { shouldRetry: true, reason: `Retryable error: ${errorName}` };
    }

    // Default retry logic based on attempt number
    if (attempt < config.maxAttempts) {
      return { shouldRetry: true, reason: 'General retry policy' };
    }

    return { shouldRetry: false, reason: 'Max attempts reached' };
  }

  /**
   * Get retry reason description
   */
  private getRetryReason(
    error: Error,
    shouldRetry: { shouldRetry: boolean; reason: string },
  ): string {
    return shouldRetry.reason;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number, config: Required<RetryConfig>): number {
    let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);
    delay = Math.min(delay, config.maxDelay);

    // Add jitter to prevent thundering herd
    if (config.jitter) {
      const jitterRange = delay * 0.1;
      delay += (Math.random() - 0.5) * jitterRange;
    }

    return Math.max(delay, 0);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clear test state before retry
   */
  private clearTestState(context: TestExecutionContext): void {
    // Clear global state
    if (context.testState.globalState) {
      Object.keys(context.testState.globalState).forEach((key) => {
        delete (globalThis as any)[key];
      });
    }

    // Clear component lifecycle state
    if (context.testState.componentLifecycle) {
      // Component lifecycle cleanup would go here
    }
  }

  /**
   * Cleanup before retry
   */
  private cleanupBeforeRetry(context: TestExecutionContext): void {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Clear any pending timers
    const maxTimeoutId = setTimeout(() => {}, 0);
    for (let i = 1; i <= maxTimeoutId; i++) {
      clearTimeout(i);
    }

    // Clear any pending intervals
    const maxIntervalId = setInterval(() => {}, 1000000);
    for (let i = 1; i <= maxIntervalId; i++) {
      clearInterval(i);
    }
  }

  /**
   * Create final error with aggregated information
   */
  private createFinalError(testKey: string, results: TestExecutionResult[]): Error {
    const lastResult = results[results.length - 1];
    const baseError = lastResult.error || new Error('Unknown error');

    const error = new Error(
      `${testKey} failed after ${results.length} attempts: ${baseError.message}`,
    ) as Error & {
      name: 'RetryExhaustedError';
      testKey;
      attempts: number;
      executionHistory: TestExecutionResult[];
    };

    error.name = 'RetryExhaustedError';
    error.testKey = testKey;
    error.attempts = results.length;
    error.executionHistory = results;

    return error;
  }

  /**
   * Analyze final failure for insights
   */
  private analyzeFinalFailure(testKey: string, results: TestExecutionResult[]): void {
    const failures = results.filter((r) => !r.success);
    const patterns = this.analyzeFailurePatterns(failures);

    console.error(`❌ Final failure analysis for ${testKey}:`);
    console.error(`   Total attempts: ${results.length}`);
    console.error(`   Failures: ${failures.length}`);
    console.error(
      `   Success rate: ${(((results.length - failures.length) / results.length) * 100).toFixed(1)}%`,
    );

    if (patterns.length > 0) {
      console.error(`   Failure patterns: ${patterns.join(', ')}`);
    }

    // Check if this should be marked as flaky
    if (failures.length > 0 && failures.length < results.length) {
      this.flakyTests.add(testKey);
      console.warn(`⚠️  Test ${testKey} marked as potentially flaky`);
    }
  }

  /**
   * Analyze failure patterns
   */
  private analyzeFailurePatterns(failures: TestExecutionResult[]): string[] {
    const patterns: string[] = [];
    const errorMessages = failures
      .map((f) => f.error?.message || '')
      .join(' ')
      .toLowerCase();

    if (errorMessages.includes('timeout')) {
      patterns.push('timeout');
    }
    if (errorMessages.includes('memory') || errorMessages.includes('heap')) {
      patterns.push('memory');
    }
    if (errorMessages.includes('network') || errorMessages.includes('connection')) {
      patterns.push('network');
    }
    if (errorMessages.includes('undefined') || errorMessages.includes('null')) {
      patterns.push('null_undefined');
    }

    return patterns;
  }

  /**
   * Check if flakiness is timing-related
   */
  private isTimingRelatedFlakiness(results: TestExecutionResult[]): boolean {
    const executionTimes = results.map((r) => r.executionTime);
    const avgTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
    const variance =
      executionTimes.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) /
      executionTimes.length;
    const stdDev = Math.sqrt(variance);

    // High variance in execution times suggests timing-related flakiness
    return stdDev > avgTime * 0.5;
  }

  /**
   * Check if flakiness is environment-related
   */
  private isEnvironmentRelatedFlakiness(results: TestExecutionResult[]): boolean {
    const contexts = results.filter((r) => r.context).map((r) => r.context!);

    // Check for variations in environment state
    const memoryUsages = contexts.map((c) => c.environment.memoryUsage || 0).filter((m) => m > 0);

    if (memoryUsages.length < 2) return false;

    const avgMemory = memoryUsages.reduce((sum, mem) => sum + mem, 0) / memoryUsages.length;
    const maxMemory = Math.max(...memoryUsages);

    // Significant memory variation suggests environment-related flakiness
    return maxMemory > avgMemory * 1.5;
  }

  /**
   * Check if flakiness is state pollution-related
   */
  private isStatePollutionFlakiness(results: TestExecutionResult[]): boolean {
    const contexts = results.filter((r) => r.context).map((r) => r.context!);

    // Check for global state variations
    const globalStates = contexts.map((c) => c.testState.globalState || {});

    // If there are variations in global state between runs, it suggests state pollution
    const firstState = JSON.stringify(globalStates[0] || {});
    return globalStates.some((state) => JSON.stringify(state) !== firstState);
  }

  /**
   * Get recommendation for flaky test
   */
  private getFlakyTestRecommendation(pattern: string, failureRate: number): string {
    const recommendations = {
      timing: 'Consider adding explicit waits or increasing timeout values',
      environment: 'Check for resource constraints and consider cleanup in setUp/tearDown',
      state_pollution: 'Ensure proper cleanup of global state and component lifecycle',
      intermittent: 'Review test isolation and ensure no side effects between tests',
    };

    const baseRecommendation =
      recommendations[pattern as keyof typeof recommendations] ||
      'Review test implementation for race conditions or async issues';

    const severityNote =
      failureRate > 0.5
        ? ' High failure rate - prioritize fixing this test'
        : failureRate > 0.3
          ? ' Moderate failure rate - investigate soon'
          : ' Low failure rate - monitor and address when possible';

    return `${baseRecommendation}.${severityNote}`;
  }
}

/**
 * Default retry manager instance
 */
export const defaultRetryManager = new SmartRetryManager({
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  jitter: true,
  enableFlakyDetection: true,
  flakyThreshold: 0.3,
});

/**
 * Enhanced test execution wrapper with retry logic
 */
export function executeWithRetry<T>(
  testKey: string,
  testFn: () => Promise<T>,
  context: TestExecutionContext,
  options?: {
    retryConfig?: Partial<RetryConfig>;
    onRetry?: (attempt: number, error: Error, delay: number) => void;
  },
): Promise<T> {
  return defaultRetryManager.executeWithRetry(testKey, testFn, context, options);
}

/**
 * Vitest retry wrapper for test functions
 */
export function createRetryableTest<T extends (...args: any[]) => Promise<any>>(
  testKey: string,
  testFn: T,
  options?: {
    retryConfig?: Partial<RetryConfig>;
    getContext?: () => TestExecutionContext;
  },
): T {
  return (async (...args: Parameters<T>) => {
    const context = options?.getContext?.() || createDefaultTestContext(testKey);
    return executeWithRetry(testKey, () => testFn(...args), context, options);
  }) as T;
}

/**
 * Create default test context
 */
function createDefaultTestContext(testKey: string): TestExecutionContext {
  return {
    testName: testKey,
    suiteName: 'default',
    filePath: 'unknown',
    timestamp: Date.now(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
    },
    testState: {
      globalState: {},
      componentLifecycle: {},
      asyncOperations: 0,
    },
  };
}

/**
 * Export utilities
 */
export { SmartRetryManager as RetryManager };
