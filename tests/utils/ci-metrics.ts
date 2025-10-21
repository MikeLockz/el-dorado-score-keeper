/**
 * CI/CD Test Reliability Metrics and Monitoring
 *
 * This module provides comprehensive metrics collection, analysis, and monitoring
 * for test reliability, performance, and flaky test detection in CI environments.
 */

import { vi } from 'vitest';
import { TestExecutionResult, FailureDiagnostic, FailureAnalysis } from './ci-retry-logic';
import { defaultFailureReporter } from './failure-diagnostics';

/**
 * Test execution metrics
 */
export interface TestMetrics {
  testName: string;
  suiteName: string;
  timestamp: number;
  duration: number;
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  attempt: number;
  memoryUsage: {
    before: number;
    after: number;
    peak: number;
    delta: number;
  };
  performance: {
    setupTime: number;
    executionTime: number;
    cleanupTime: number;
  };
  reliability: {
    recentResults: boolean[];
    successRate: number;
    averageAttempts: number;
    lastSuccess: number;
    lastFailure: number;
  };
}

/**
 * CI run metrics
 */
export interface CIRunMetrics {
  runId: string;
  timestamp: number;
  branch: string;
  commit: string;
  environment: {
    nodeVersion: string;
    platform: string;
    runner: string;
  };
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    flakyTests: number;
    totalDuration: number;
    averageDuration: number;
    passRate: number;
  };
  performance: {
    fastestTest: { name: string; duration: number };
    slowestTest: { name: string; duration: number };
    averageSetupTime: number;
    averageExecutionTime: number;
    averageCleanupTime: number;
    memoryPeak: number;
  };
  reliability: {
    overallReliability: number;
    flakyTestRate: number;
    consistencyScore: number;
    stabilityTrend: number[];
  };
}

/**
 * Reliability metrics configuration
 */
export interface ReliabilityConfig {
  historySize?: number;
  flakyThreshold?: number;
  reliabilityThreshold?: number;
  alertThresholds?: {
    passRate?: number;
    flakyRate?: number;
    averageDuration?: number;
    memoryUsage?: number;
  };
  monitoringWindow?: number;
}

/**
 * Test reliability tracker
 */
export class TestReliabilityTracker {
  private config: Required<ReliabilityConfig>;
  private testHistory = new Map<string, TestMetrics[]>();
  private ciRunHistory: CIRunMetrics[] = [];
  private currentRun: Partial<CIRunMetrics> | null = null;

  constructor(config: ReliabilityConfig = {}) {
    this.config = {
      historySize: config.historySize || 100,
      flakyThreshold: config.flakyThreshold || 0.3,
      reliabilityThreshold: config.reliabilityThreshold || 0.95,
      alertThresholds: {
        passRate: config.alertThresholds?.passRate || 0.95,
        flakyRate: config.alertThresholds?.flakyRate || 0.1,
        averageDuration: config.alertThresholds?.averageDuration || 30000,
        memoryUsage: config.alertThresholds?.memoryUsage || 500 * 1024 * 1024, // 500MB
        ...config.alertThresholds,
      },
      monitoringWindow: config.monitoringWindow || 7 * 24 * 60 * 60 * 1000, // 7 days
    };
  }

  /**
   * Start tracking a CI run
   */
  startCIRun(runId: string, branch: string, commit: string): void {
    this.currentRun = {
      runId,
      timestamp: Date.now(),
      branch,
      commit,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        runner: process.env.CI ? 'GitHub Actions' : 'local',
      },
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        flakyTests: 0,
        totalDuration: 0,
        averageDuration: 0,
        passRate: 0,
      },
      performance: {
        fastestTest: { name: '', duration: Infinity },
        slowestTest: { name: '', duration: 0 },
        averageSetupTime: 0,
        averageExecutionTime: 0,
        averageCleanupTime: 0,
        memoryPeak: 0,
      },
      reliability: {
        overallReliability: 0,
        flakyTestRate: 0,
        consistencyScore: 0,
        stabilityTrend: [],
      },
    };
  }

  /**
   * Record test execution
   */
  recordTestExecution(
    testName: string,
    suiteName: string,
    result: {
      status: 'passed' | 'failed' | 'skipped';
      duration: number;
      attempt: number;
      memoryBefore?: number;
      memoryAfter?: number;
      setupTime?: number;
      executionTime?: number;
      cleanupTime?: number;
    },
  ): void {
    if (!this.currentRun) {
      throw new Error('CI run not started. Call startCIRun() first.');
    }

    const metrics: TestMetrics = {
      testName,
      suiteName,
      timestamp: Date.now(),
      duration: result.duration,
      status: result.status,
      attempt: result.attempt,
      memoryUsage: {
        before: result.memoryBefore || 0,
        after: result.memoryAfter || 0,
        peak: Math.max(result.memoryBefore || 0, result.memoryAfter || 0),
        delta: (result.memoryAfter || 0) - (result.memoryBefore || 0),
      },
      performance: {
        setupTime: result.setupTime || 0,
        executionTime: result.executionTime || result.duration,
        cleanupTime: result.cleanupTime || 0,
      },
      reliability: {
        recentResults: [],
        successRate: 0,
        averageAttempts: 0,
        lastSuccess: 0,
        lastFailure: 0,
      },
    };

    // Update test history
    if (!this.testHistory.has(testName)) {
      this.testHistory.set(testName, []);
    }

    const history = this.testHistory.get(testName)!;
    history.push(metrics);

    // Keep only recent history
    if (history.length > this.config.historySize) {
      history.splice(0, history.length - this.config.historySize);
    }

    // Calculate reliability metrics
    this.updateTestReliability(testName);

    // Update current run summary
    this.updateCurrentRunSummary(metrics);
  }

  /**
   * Record test as flaky
   */
  recordFlakyTest(testName: string, reason: string): void {
    if (!this.currentRun) return;

    this.currentRun.summary.flakyTests++;
    console.warn(`🔍 Flaky test detected: ${testName} - ${reason}`);
  }

  /**
   * Finish current CI run
   */
  finishCIRun(): CIRunMetrics {
    if (!this.currentRun) {
      throw new Error('No active CI run to finish');
    }

    // Calculate final metrics
    this.calculateFinalMetrics();

    const runMetrics = this.currentRun as CIRunMetrics;
    this.ciRunHistory.push(runMetrics);

    // Keep only recent runs
    if (this.ciRunHistory.length > 50) {
      this.ciRunHistory.splice(0, this.ciRunHistory.length - 50);
    }

    // Log summary
    this.logRunSummary(runMetrics);

    // Check for alerts
    this.checkAlerts(runMetrics);

    this.currentRun = null;
    return runMetrics;
  }

  /**
   * Get reliability metrics for a specific test
   */
  getTestReliability(testName: string): {
    successRate: number;
    averageAttempts: number;
    flakyScore: number;
    trend: 'improving' | 'stable' | 'degrading';
    recentPerformance: {
      averageDuration: number;
      averageMemoryUsage: number;
    };
  } {
    const history = this.testHistory.get(testName) || [];
    if (history.length === 0) {
      return {
        successRate: 0,
        averageAttempts: 0,
        flakyScore: 0,
        trend: 'stable',
        recentPerformance: { averageDuration: 0, averageMemoryUsage: 0 },
      };
    }

    const recentResults = history.slice(-20); // Last 20 executions
    const successfulRuns = recentResults.filter((r) => r.status === 'passed').length;
    const successRate = successfulRuns / recentResults.length;
    const averageAttempts =
      recentResults.reduce((sum, r) => sum + r.attempt, 0) / recentResults.length;

    // Calculate flaky score (0 = stable, 1 = very flaky)
    const failures = recentResults.filter((r) => r.status === 'failed').length;
    const flakyScore =
      failures > 0 && successes > 0
        ? Math.abs(successfulRuns - failures) / recentResults.length
        : failures / recentResults.length;

    // Determine trend
    const firstHalf = recentResults.slice(0, Math.floor(recentResults.length / 2));
    const secondHalf = recentResults.slice(Math.floor(recentResults.length / 2));

    const firstHalfSuccess =
      firstHalf.filter((r) => r.status === 'passed').length / firstHalf.length;
    const secondHalfSuccess =
      secondHalf.filter((r) => r.status === 'passed').length / secondHalf.length;

    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (secondHalfSuccess > firstHalfSuccess + 0.1) {
      trend = 'improving';
    } else if (secondHalfSuccess < firstHalfSuccess - 0.1) {
      trend = 'degrading';
    }

    const recentPerformance = {
      averageDuration: recentResults.reduce((sum, r) => sum + r.duration, 0) / recentResults.length,
      averageMemoryUsage:
        recentResults.reduce((sum, r) => sum + r.memoryUsage.delta, 0) / recentResults.length,
    };

    return {
      successRate,
      averageAttempts,
      flakyScore,
      trend,
      recentPerformance,
    };
  }

  /**
   * Get overall reliability metrics
   */
  getOverallReliability(): {
    overallSuccessRate: number;
    flakyTestRate: number;
    averageTestDuration: number;
    reliabilityScore: number;
    healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    recommendations: string[];
    trends: {
      successRate: number[];
      duration: number[];
      memoryUsage: number[];
    };
  } {
    const allTests = Array.from(this.testHistory.keys());
    if (allTests.length === 0) {
      return {
        overallSuccessRate: 0,
        flakyTestRate: 0,
        averageTestDuration: 0,
        reliabilityScore: 0,
        healthStatus: 'critical',
        recommendations: ['No test data available'],
        trends: { successRate: [], duration: [], memoryUsage: [] },
      };
    }

    let totalSuccessRate = 0;
    let totalFlakyRate = 0;
    let totalDuration = 0;
    let totalMemoryUsage = 0;
    const trends = {
      successRate: [] as number[],
      duration: [] as number[],
      memoryUsage: [] as number[],
    };

    allTests.forEach((testName) => {
      const reliability = this.getTestReliability(testName);
      totalSuccessRate += reliability.successRate;
      totalFlakyRate += reliability.flakyScore;
      totalDuration += reliability.recentPerformance.averageDuration;
      totalMemoryUsage += reliability.recentPerformance.averageMemoryUsage;

      trends.successRate.push(reliability.successRate);
      trends.duration.push(reliability.recentPerformance.averageDuration);
      trends.memoryUsage.push(reliability.recentPerformance.averageMemoryUsage);
    });

    const averageSuccessRate = totalSuccessRate / allTests.length;
    const averageFlakyRate = totalFlakyRate / allTests.length;
    const averageDuration = totalDuration / allTests.length;
    const averageMemoryUsage = totalMemoryUsage / allTests.length;

    // Calculate reliability score (0-100)
    const reliabilityScore = Math.round(
      averageSuccessRate * 50 +
        (1 - averageFlakyRate) * 30 +
        Math.max(0, 1 - averageMemoryUsage / (500 * 1024 * 1024)) * 20,
    );

    // Determine health status
    let healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    if (reliabilityScore >= 90) {
      healthStatus = 'excellent';
    } else if (reliabilityScore >= 75) {
      healthStatus = 'good';
    } else if (reliabilityScore >= 60) {
      healthStatus = 'fair';
    } else if (reliabilityScore >= 40) {
      healthStatus = 'poor';
    } else {
      healthStatus = 'critical';
    }

    // Generate recommendations
    const recommendations = this.generateHealthRecommendations(
      averageSuccessRate,
      averageFlakyRate,
      averageDuration,
      averageMemoryUsage,
      healthStatus,
    );

    return {
      overallSuccessRate: averageSuccessRate,
      flakyTestRate: averageFlakyRate,
      averageTestDuration: averageDuration,
      reliabilityScore,
      healthStatus,
      recommendations,
      trends,
    };
  }

  /**
   * Get CI run history
   */
  getCIRunHistory(limit?: number): CIRunMetrics[] {
    const history = [...this.ciRunHistory];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Export metrics data
   */
  exportData(): {
    testHistory: Record<string, TestMetrics[]>;
    ciRunHistory: CIRunMetrics[];
    overallReliability: ReturnType<TestReliabilityTracker['getOverallReliability']>;
    config: Required<ReliabilityConfig>;
    timestamp: number;
  } {
    return {
      testHistory: Object.fromEntries(this.testHistory),
      ciRunHistory: this.ciRunHistory,
      overallReliability: this.getOverallReliability(),
      config: this.config,
      timestamp: Date.now(),
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.testHistory.clear();
    this.ciRunHistory = [];
    this.currentRun = null;
  }

  /**
   * Update test reliability metrics
   */
  private updateTestReliability(testName: string): void {
    const history = this.testHistory.get(testName) || [];
    const recentResults = history.slice(-20).map((r) => r.status === 'passed');

    if (history.length > 0) {
      const latest = history[history.length - 1];
      latest.reliability.recentResults = recentResults;
      latest.reliability.successRate = recentResults.filter((r) => r).length / recentResults.length;
      latest.reliability.averageAttempts =
        recentResults.length > 0
          ? recentResults.reduce((sum, r) => sum + r.attempt, 0) / recentResults.length
          : 0;
      latest.reliability.lastSuccess = recentResults.lastIndexOf(true);
      latest.reliability.lastFailure = recentResults.lastIndexOf(false);
    }
  }

  /**
   * Update current run summary
   */
  private updateCurrentRunSummary(metrics: TestMetrics): void {
    if (!this.currentRun) return;

    this.currentRun.summary.totalTests++;
    this.currentRun.summary.totalDuration += metrics.duration;

    switch (metrics.status) {
      case 'passed':
        this.currentRun.summary.passedTests++;
        break;
      case 'failed':
        this.currentRun.summary.failedTests++;
        break;
      case 'skipped':
        this.currentRun.summary.skippedTests++;
        break;
      case 'flaky':
        this.currentRun.summary.flakyTests++;
        break;
    }

    // Update performance metrics
    if (metrics.duration < this.currentRun.performance.fastestTest.duration) {
      this.currentRun.performance.fastestTest = {
        name: metrics.testName,
        duration: metrics.duration,
      };
    }

    if (metrics.duration > this.currentRun.performance.slowestTest.duration) {
      this.currentRun.performance.slowestTest = {
        name: metrics.testName,
        duration: metrics.duration,
      };
    }

    this.currentRun.performance.memoryPeak = Math.max(
      this.currentRun.performance.memoryPeak,
      metrics.memoryUsage.peak,
    );
  }

  /**
   * Calculate final metrics for CI run
   */
  private calculateFinalMetrics(): void {
    if (!this.currentRun) return;

    const { summary, performance } = this.currentRun;

    summary.averageDuration =
      summary.totalTests > 0 ? summary.totalDuration / summary.totalTests : 0;
    summary.passRate = summary.totalTests > 0 ? summary.passedTests / summary.totalTests : 0;

    // Calculate average performance metrics
    const allTests = Array.from(this.testHistory.values()).flat();
    if (allTests.length > 0) {
      performance.averageSetupTime =
        allTests.reduce((sum, t) => sum + t.performance.setupTime, 0) / allTests.length;
      performance.averageExecutionTime =
        allTests.reduce((sum, t) => sum + t.performance.executionTime, 0) / allTests.length;
      performance.averageCleanupTime =
        allTests.reduce((sum, t) => sum + t.performance.cleanupTime, 0) / allTests.length;
    }

    // Calculate reliability metrics
    const overallReliability = this.getOverallReliability();
    this.currentRun.reliability = {
      overallReliability: overallReliability.overallSuccessRate,
      flakyTestRate: overallReliability.flakyTestRate,
      consistencyScore: overallReliability.reliabilityScore / 100,
      stabilityTrend: overallReliability.trends.successRate.slice(-10), // Last 10 runs
    };
  }

  /**
   * Log run summary
   */
  private logRunSummary(run: CIRunMetrics): void {
    console.log(`\n📊 CI Run Summary - ${run.runId}`);
    console.log('='.repeat(50));
    console.log(`Branch: ${run.branch}`);
    console.log(`Commit: ${run.commit}`);
    console.log(`Timestamp: ${new Date(run.timestamp).toISOString()}`);
    console.log('');

    console.log(`📈 Test Results:`);
    console.log(`   Total Tests: ${run.summary.totalTests}`);
    console.log(
      `   Passed: ${run.summary.passedTests} (${(run.summary.passRate * 100).toFixed(1)}%)`,
    );
    console.log(`   Failed: ${run.summary.failedTests}`);
    console.log(`   Skipped: ${run.summary.skippedTests}`);
    console.log(`   Flaky: ${run.summary.flakyTests}`);
    console.log('');

    console.log(`⏱️  Performance:`);
    console.log(`   Total Duration: ${(run.summary.totalDuration / 1000).toFixed(2)}s`);
    console.log(`   Average Duration: ${(run.summary.averageDuration / 1000).toFixed(2)}s`);
    console.log(
      `   Fastest Test: ${run.performance.fastestTest.name} (${(run.performance.fastestTest.duration / 1000).toFixed(2)}s)`,
    );
    console.log(
      `   Slowest Test: ${run.performance.slowestTest.name} (${(run.performance.slowestTest.duration / 1000).toFixed(2)}s)`,
    );
    console.log(`   Memory Peak: ${(run.performance.memoryPeak / 1024 / 1024).toFixed(2)}MB`);
    console.log('');

    console.log(`🔍 Reliability:`);
    console.log(
      `   Overall Success Rate: ${(run.reliability.overallReliability * 100).toFixed(1)}%`,
    );
    console.log(`   Flaky Test Rate: ${(run.reliability.flakyTestRate * 100).toFixed(1)}%`);
    console.log(`   Consistency Score: ${(run.reliability.consistencyScore * 100).toFixed(1)}%`);
    console.log('');
  }

  /**
   * Check for alerts
   */
  private checkAlerts(run: CIRunMetrics): void {
    const alerts: string[] = [];

    if (run.summary.passRate < this.config.alertThresholds.passRate) {
      alerts.push(
        `❌ Low pass rate: ${(run.summary.passRate * 100).toFixed(1)}% (threshold: ${(this.config.alertThresholds.passRate * 100).toFixed(1)}%)`,
      );
    }

    if (run.reliability.flakyTestRate > this.config.alertThresholds.flakyRate) {
      alerts.push(
        `⚠️  High flaky test rate: ${(run.reliability.flakyTestRate * 100).toFixed(1)}% (threshold: ${(this.config.alertThresholds.flakyRate * 100).toFixed(1)}%)`,
      );
    }

    if (run.summary.averageDuration > this.config.alertThresholds.averageDuration) {
      alerts.push(
        `⏱️  Slow average test duration: ${(run.summary.averageDuration / 1000).toFixed(2)}s (threshold: ${(this.config.alertThresholds.averageDuration / 1000).toFixed(2)}s)`,
      );
    }

    if (run.performance.memoryPeak > this.config.alertThresholds.memoryUsage) {
      alerts.push(
        `💾 High memory usage: ${(run.performance.memoryPeak / 1024 / 1024).toFixed(2)}MB (threshold: ${(this.config.alertThresholds.memoryUsage / 1024 / 1024).toFixed(2)}MB)`,
      );
    }

    if (alerts.length > 0) {
      console.log('🚨 Alerts:');
      alerts.forEach((alert) => console.log(`   ${alert}`));
      console.log('');
    }
  }

  /**
   * Generate health recommendations
   */
  private generateHealthRecommendations(
    successRate: number,
    flakyRate: number,
    duration: number,
    memoryUsage: number,
    healthStatus: string,
  ): string[] {
    const recommendations: string[] = [];

    if (successRate < 0.9) {
      recommendations.push('Investigate failing tests and fix root causes');
      recommendations.push('Add more comprehensive test coverage');
    }

    if (flakyRate > 0.1) {
      recommendations.push('Implement better test isolation and cleanup');
      recommendations.push('Use retry logic for known flaky tests');
      recommendations.push('Investigate timing-related issues');
    }

    if (duration > 30000) {
      // 30 seconds
      recommendations.push('Optimize test performance and reduce test data size');
      recommendations.push('Implement parallel test execution');
    }

    if (memoryUsage > 100 * 1024 * 1024) {
      // 100MB
      recommendations.push('Check for memory leaks in tests');
      recommendations.push('Implement proper cleanup in tearDown');
    }

    if (healthStatus === 'critical') {
      recommendations.push(
        'Immediate attention required - test reliability is severely compromised',
      );
    } else if (healthStatus === 'poor') {
      recommendations.push('Priority attention needed - test reliability needs improvement');
    }

    return recommendations;
  }
}

/**
 * Default reliability tracker instance
 */
export const defaultReliabilityTracker = new TestReliabilityTracker({
  historySize: 100,
  flakyThreshold: 0.3,
  reliabilityThreshold: 0.95,
  alertThresholds: {
    passRate: 0.95,
    flakyRate: 0.1,
    averageDuration: 30000,
    memoryUsage: 100 * 1024 * 1024,
  },
  monitoringWindow: 7 * 24 * 60 * 60 * 1000,
});

/**
 * Metrics collector for CI environments
 */
export class CIMetricsCollector {
  private tracker: TestReliabilityTracker;
  private runId: string;
  private startTime: number;

  constructor(tracker?: TestReliabilityTracker) {
    this.tracker = tracker || defaultReliabilityTracker;
  }

  /**
   * Start metrics collection
   */
  startCollection(runId?: string): void {
    this.runId = runId || `ci-run-${Date.now()}`;
    this.startTime = Date.now();

    const branch = process.env.GITHUB_REF_NAME || 'main';
    const commit = process.env.GITHUB_SHA || 'unknown';

    this.tracker.startCIRun(this.runId, branch, commit);
  }

  /**
   * Record test execution with automatic context
   */
  recordTest(
    testName: string,
    suiteName: string,
    result: {
      status: 'passed' | 'failed' | 'skipped';
      duration: number;
      attempt?: number;
      memoryBefore?: number;
      memoryAfter?: number;
    },
  ): void {
    this.tracker.recordTestExecution(testName, suiteName, {
      status: result.status,
      duration: result.duration,
      attempt: result.attempt || 1,
      memoryBefore: result.memoryBefore,
      memoryAfter: result.memoryAfter,
    });
  }

  /**
   * Finish collection and get report
   */
  finishCollection(): CIRunMetrics {
    const runMetrics = this.tracker.finishCIRun();

    // Export data for external analysis
    const data = {
      runId: this.runId,
      duration: Date.now() - this.startTime,
      metrics: runMetrics,
      reliability: this.tracker.getOverallReliability(),
      timestamp: Date.now(),
    };

    // Could send to external monitoring service here
    console.log('📊 Metrics collected:', JSON.stringify(data, null, 2));

    return runMetrics;
  }

  /**
   * Get current reliability status
   */
  getReliabilityStatus(): ReturnType<TestReliabilityTracker['getOverallReliability']> {
    return this.tracker.getOverallReliability();
  }

  /**
   * Export all collected data
   */
  exportData(): {
    runId: string;
    startTime: number;
    duration: number;
    metrics: CIRunMetrics;
    reliability: ReturnType<TestReliabilityTracker['getOverallReliability']>;
    fullData: ReturnType<TestReliabilityTracker['exportData']>;
  } {
    return {
      runId: this.runId,
      startTime: this.startTime,
      duration: Date.now() - this.startTime,
      metrics: this.tracker.getCIRunHistory(1)[0] || ({} as CIRunMetrics),
      reliability: this.getReliabilityStatus(),
      fullData: this.tracker.exportData(),
    };
  }
}

/**
 * Export utilities
 */
export { TestReliabilityTracker as ReliabilityTracker };
