/**
 * Enhanced Failure Diagnostics and Reporting
 *
 * This module provides comprehensive failure analysis and diagnostics for
 * test failures, including environment snapshots, context collection,
 * and detailed reporting for CI environments.
 */

import { vi } from 'vitest';
import { TestExecutionContext, TestExecutionResult } from './ci-retry-logic';

/**
 * Failure diagnostic data
 */
export interface FailureDiagnostic {
  testName: string;
  suiteName: string;
  filePath: string;
  timestamp: number;
  error: {
    name: string;
    message: string;
    stack?: string;
    cause?: any;
  };
  execution: {
    attempt: number;
    executionTime: number;
    memoryBefore?: number;
    memoryAfter?: number;
    memoryDelta?: number;
  };
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpuCount: number;
    totalMemory: number;
    freeMemory: number;
    loadAverage?: number[];
  };
  globalState: {
    productionGlobals: Record<string, any>;
    otherGlobals: string[];
    globalVars: Record<string, any>;
  };
  componentState: {
    mountedComponents: string[];
    unmountedComponents: string[];
    activeEffects: string[];
    asyncOperations: {
      timeouts: number;
      intervals: number;
      promises: number;
      eventListeners: number;
    };
  };
  testIsolation: {
    previousTestState: Record<string, any>;
    statePollution: string[];
    cleanupIssues: string[];
  };
  systemResources: {
    diskUsage?: number;
    networkConnections?: number;
    openFiles?: number;
  };
  recommendations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'assertion' | 'timeout' | 'memory' | 'network' | 'environment' | 'infrastructure';
}

/**
 * Failure analysis result
 */
export interface FailureAnalysis {
  diagnostic: FailureDiagnostic;
  rootCause: string;
  contributingFactors: string[];
  fixSuggestions: string[];
  preventionMeasures: string[];
  relatedIssues: string[];
  impact: 'test_only' | 'feature' | 'system' | 'infrastructure';
}

/**
 * Failure context collector
 */
export class FailureContextCollector {
  private startTime: number = 0;
  private initialMemory: number | null = null;
  private initialGlobalState: Record<string, any> = {};

  /**
   * Start collecting context for a test
   */
  startCollection(): void {
    this.startTime = performance.now();
    this.initialMemory = this.getCurrentMemoryUsage();
    this.initialGlobalState = this.captureGlobalState();
  }

  /**
   * Collect failure diagnostic data
   */
  collectDiagnostic(
    error: Error,
    context: TestExecutionContext,
    executionResult: Partial<TestExecutionResult>,
  ): FailureDiagnostic {
    const currentMemory = this.getCurrentMemoryUsage();
    const currentGlobalState = this.captureGlobalState();
    const systemInfo = this.getSystemInfo();
    const componentState = this.analyzeComponentState();
    const testIsolation = this.analyzeTestIsolation(currentGlobalState);
    const recommendations = this.generateRecommendations(error, context, currentGlobalState);
    const severity = this.assessSeverity(error, recommendations);
    const category = this.categorizeError(error);

    return {
      testName: context.testName,
      suiteName: context.suiteName,
      filePath: context.filePath,
      timestamp: Date.now(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause,
      },
      execution: {
        attempt: executionResult.attempt || 1,
        executionTime: executionResult.executionTime || 0,
        memoryBefore: this.initialMemory || undefined,
        memoryAfter: currentMemory || undefined,
        memoryDelta:
          currentMemory && this.initialMemory ? currentMemory - this.initialMemory : undefined,
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cpuCount: require('os').cpus().length,
        totalMemory: require('os').totalmem(),
        freeMemory: require('os').freemem(),
        loadAverage: process.platform !== 'win32' ? require('os').loadavg() : undefined,
      },
      globalState: {
        productionGlobals: this.extractProductionGlobals(currentGlobalState),
        otherGlobals: this.extractOtherGlobals(currentGlobalState),
        globalVars: currentGlobalState,
      },
      componentState,
      testIsolation,
      systemResources: this.collectSystemResources(),
      recommendations,
      severity,
      category,
    };
  }

  /**
   * Analyze failure and provide insights
   */
  analyzeFailure(diagnostic: FailureDiagnostic): FailureAnalysis {
    const rootCause = this.identifyRootCause(diagnostic);
    const contributingFactors = this.identifyContributingFactors(diagnostic);
    const fixSuggestions = this.generateFixSuggestions(diagnostic, rootCause);
    const preventionMeasures = this.generatePreventionMeasures(diagnostic);
    const relatedIssues = this.findRelatedIssues(diagnostic);
    const impact = this.assessImpact(diagnostic);

    return {
      diagnostic,
      rootCause,
      contributingFactors,
      fixSuggestions,
      preventionMeasures,
      relatedIssues,
      impact,
    };
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
   * Capture global state snapshot
   */
  private captureGlobalState(): Record<string, any> {
    const state: Record<string, any> = {};

    // Capture common global variables
    const globalKeys = Object.keys(globalThis);
    for (const key of globalKeys) {
      try {
        const value = (globalThis as any)[key];
        if (typeof value !== 'function' && typeof value !== 'object') {
          state[key] = value;
        } else if (key.startsWith('__')) {
          state[key] = typeof value === 'object' ? '[Object]' : String(value);
        }
      } catch {
        // Skip inaccessible properties
      }
    }

    return state;
  }

  /**
   * Extract production globals
   */
  private extractProductionGlobals(globalState: Record<string, any>): Record<string, any> {
    const productionGlobals: Record<string, any> = {};

    if (globalState.__START_NEW_GAME__) {
      productionGlobals.__START_NEW_GAME__ = globalState.__START_NEW_GAME__;
    }

    if (globalState.__clientLogTrack__) {
      productionGlobals.__clientLogTrack__ = globalState.__clientLogTrack__;
    }

    return productionGlobals;
  }

  /**
   * Extract other globals (non-production)
   */
  private extractOtherGlobals(globalState: Record<string, any>): string[] {
    return Object.keys(globalState).filter(
      (key) => key.startsWith('__') && !['__START_NEW_GAME__', '__clientLogTrack__'].includes(key),
    );
  }

  /**
   * Get system information
   */
  private getSystemInfo() {
    const os = require('os');
    const process = require('process');

    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      loadAverage: process.platform !== 'win32' ? os.loadavg() : undefined,
      uptime: os.uptime(),
      hostname: os.hostname(),
    };
  }

  /**
   * Analyze component state
   */
  private analyzeComponentState() {
    // This would integrate with component lifecycle tracking
    // For now, provide placeholder data
    return {
      mountedComponents: [],
      unmountedComponents: [],
      activeEffects: [],
      asyncOperations: {
        timeouts: this.getTimeoutCount(),
        intervals: this.getIntervalCount(),
        promises: 0, // Would need Promise tracking
        eventListeners: this.getEventListenerCount(),
      },
    };
  }

  /**
   * Analyze test isolation issues
   */
  private analyzeTestIsolation(currentGlobalState: Record<string, any>) {
    const pollution: string[] = [];
    const cleanupIssues: string[] = [];

    // Check for global state pollution
    Object.keys(currentGlobalState).forEach((key) => {
      if (key.startsWith('__') && !(key in this.initialGlobalState)) {
        pollution.push(`New global variable: ${key}`);
      }
    });

    // Check for values that changed
    Object.keys(this.initialGlobalState).forEach((key) => {
      if (currentGlobalState[key] !== this.initialGlobalState[key]) {
        pollution.push(`Modified global variable: ${key}`);
      }
    });

    // Check for cleanup issues
    if (this.getTimeoutCount() > 0) {
      cleanupIssues.push('Uncleared timeouts');
    }
    if (this.getIntervalCount() > 0) {
      cleanupIssues.push('Uncleared intervals');
    }

    return {
      previousTestState: this.initialGlobalState,
      statePollution: pollution,
      cleanupIssues,
    };
  }

  /**
   * Collect system resources
   */
  private collectSystemResources() {
    try {
      const fs = require('fs');
      const os = require('os');

      return {
        diskUsage: fs.statSync('.').size,
        networkConnections: 0, // Would need network interface inspection
        openFiles: 0, // Would need process inspection
      };
    } catch {
      return {};
    }
  }

  /**
   * Generate failure recommendations
   */
  private generateRecommendations(
    error: Error,
    context: TestExecutionContext,
    globalState: Record<string, any>,
  ): string[] {
    const recommendations: string[] = [];

    // Error-specific recommendations
    if (error.name === 'AssertionError') {
      recommendations.push('Review test assertions for correctness');
      recommendations.push('Check if test expectations match actual behavior');
    }

    if (error.message.includes('timeout')) {
      recommendations.push('Increase test timeout or optimize async operations');
      recommendations.push('Check for infinite loops or unresolved promises');
    }

    if (error.message.includes('memory')) {
      recommendations.push('Check for memory leaks in test setup/teardown');
      recommendations.push('Consider reducing test data size or implementing cleanup');
    }

    // Global state recommendations
    const hasProductionGlobals = Object.keys(globalState).some((key) =>
      ['__START_NEW_GAME__', '__clientLogTrack__'].includes(key),
    );

    if (hasProductionGlobals) {
      recommendations.push('Ensure proper cleanup of production development globals');
      recommendations.push('Use test utilities designed for production global patterns');
    }

    // General recommendations
    recommendations.push('Verify test isolation and independence');
    recommendations.push('Check for side effects between tests');

    return recommendations;
  }

  /**
   * Assess failure severity
   */
  private assessSeverity(error: Error, recommendations: string[]): FailureDiagnostic['severity'] {
    if (error.name === 'AssertionError' && recommendations.length <= 2) {
      return 'low';
    }

    if (error.message.includes('timeout') || error.message.includes('memory')) {
      return 'high';
    }

    if (recommendations.length > 4) {
      return 'high';
    }

    if (error.name === 'ReferenceError' || error.name === 'TypeError') {
      return 'critical';
    }

    return 'medium';
  }

  /**
   * Categorize error type
   */
  private categorizeError(error: Error): FailureDiagnostic['category'] {
    const message = error.message.toLowerCase();

    if (error.name === 'AssertionError') {
      return 'assertion';
    }

    if (message.includes('timeout')) {
      return 'timeout';
    }

    if (message.includes('memory') || message.includes('heap')) {
      return 'memory';
    }

    if (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('fetch')
    ) {
      return 'network';
    }

    if (error.name === 'ReferenceError' || error.name === 'TypeError') {
      return 'environment';
    }

    return 'infrastructure';
  }

  /**
   * Identify root cause
   */
  private identifyRootCause(diagnostic: FailureDiagnostic): string {
    const { error, globalState, testIsolation, execution } = diagnostic;

    // Check for obvious causes
    if (testIsolation.statePollution.length > 0) {
      return 'Test isolation failure - global state pollution';
    }

    if (execution.memoryDelta && execution.memoryDelta > 50 * 1024 * 1024) {
      // 50MB
      return 'Memory leak or excessive memory usage';
    }

    if (error.message.includes('timeout')) {
      return 'Test timeout - async operations not completing';
    }

    if (Object.keys(globalState.productionGlobals).length > 0) {
      return 'Production global state management issue';
    }

    return 'Test assertion or logic error';
  }

  /**
   * Identify contributing factors
   */
  private identifyContributingFactors(diagnostic: FailureDiagnostic): string[] {
    const factors: string[] = [];

    if (diagnostic.execution.memoryDelta && diagnostic.execution.memoryDelta > 0) {
      factors.push('Memory usage increased during test');
    }

    if (diagnostic.testIsolation.cleanupIssues.length > 0) {
      factors.push('Incomplete cleanup in test teardown');
    }

    if (diagnostic.componentState.asyncOperations.timeouts > 0) {
      factors.push('Pending timeout operations');
    }

    if (diagnostic.environment.freeMemory < 100 * 1024 * 1024) {
      // < 100MB free
      factors.push('Low available system memory');
    }

    return factors;
  }

  /**
   * Generate fix suggestions
   */
  private generateFixSuggestions(diagnostic: FailureDiagnostic, rootCause: string): string[] {
    const suggestions: string[] = [];

    switch (rootCause) {
      case 'Test isolation failure - global state pollution':
        suggestions.push('Use test utilities that properly manage global state');
        suggestions.push('Implement proper cleanup in afterEach hooks');
        suggestions.push('Consider using test isolation patterns');
        break;

      case 'Memory leak or excessive memory usage':
        suggestions.push('Add explicit cleanup in test teardown');
        suggestions.push('Review code for memory leaks');
        suggestions.push('Use WeakRef/WeakMap for large data structures');
        break;

      case 'Test timeout - async operations not completing':
        suggestions.push('Increase test timeout');
        suggestions.push('Ensure all promises are properly awaited');
        suggestions.push('Check for infinite loops or blocking operations');
        break;

      case 'Production global state management issue':
        suggestions.push('Use Phase 4 production lifecycle utilities');
        suggestions.push('Implement proper component cleanup');
        suggestions.push('Use development-global-aware testing patterns');
        break;

      default:
        suggestions.push('Review test logic and assertions');
        suggestions.push('Check for race conditions or timing issues');
        suggestions.push('Verify test setup and teardown procedures');
    }

    return suggestions;
  }

  /**
   * Generate prevention measures
   */
  private generatePreventionMeasures(diagnostic: FailureDiagnostic): string[] {
    const measures: string[] = [];

    measures.push('Add comprehensive test coverage for edge cases');
    measures.push('Implement automated flaky test detection');
    measures.push('Use performance monitoring in CI');

    if (diagnostic.category === 'memory') {
      measures.push('Add memory usage thresholds in CI');
      measures.push('Implement memory leak detection in tests');
    }

    if (diagnostic.category === 'timeout') {
      measures.push('Set appropriate timeout values for different test types');
      measures.push('Monitor test execution times in CI');
    }

    return measures;
  }

  /**
   * Find related issues
   */
  private findRelatedIssues(diagnostic: FailureDiagnostic): string[] {
    const issues: string[] = [];

    // Look for patterns that suggest related issues
    if (diagnostic.testIsolation.statePollution.length > 0) {
      issues.push('Other tests in the same suite may have similar isolation issues');
    }

    if (diagnostic.execution.memoryDelta && diagnostic.execution.memoryDelta > 0) {
      issues.push('Memory-related issues may affect other tests');
    }

    if (diagnostic.globalState.productionGlobals.__START_NEW_GAME__) {
      issues.push('Tests using production game flow may have related issues');
    }

    return issues;
  }

  /**
   * Assess impact
   */
  private assessImpact(diagnostic: FailureDiagnostic): FailureAnalysis['impact'] {
    if (diagnostic.severity === 'critical') {
      return 'infrastructure';
    }

    if (diagnostic.category === 'memory' || diagnostic.category === 'network') {
      return 'system';
    }

    if (diagnostic.globalState.productionGlobals.__START_NEW_GAME__) {
      return 'feature';
    }

    return 'test_only';
  }

  /**
   * Get timeout count (approximation)
   */
  private getTimeoutCount(): number {
    try {
      const maxId = setTimeout(() => {}, 0);
      clearTimeout(maxId);
      return maxId;
    } catch {
      return 0;
    }
  }

  /**
   * Get interval count (approximation)
   */
  private getIntervalCount(): number {
    try {
      let count = 0;
      const maxId = setInterval(() => {}, 1000000);
      clearInterval(maxId);
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Get event listener count (approximation)
   */
  private getEventListenerCount(): number {
    try {
      // This is a rough approximation
      return 0;
    } catch {
      return 0;
    }
  }
}

/**
 * Enhanced failure reporter for CI environments
 */
export class EnhancedFailureReporter {
  private contextCollector = new FailureContextCollector();
  private failures: FailureAnalysis[] = [];

  /**
   * Report test failure with enhanced diagnostics
   */
  async reportFailure(
    error: Error,
    context: TestExecutionContext,
    executionResult: Partial<TestExecutionResult>,
  ): Promise<FailureAnalysis> {
    // Start collection if not already started
    if (this.contextCollector['startTime'] === 0) {
      this.contextCollector.startCollection();
    }

    // Collect diagnostic data
    const diagnostic = this.contextCollector.collectDiagnostic(error, context, executionResult);

    // Analyze failure
    const analysis = this.contextCollector.analyzeFailure(diagnostic);

    // Store analysis
    this.failures.push(analysis);

    // Log enhanced failure information
    this.logFailure(analysis);

    return analysis;
  }

  /**
   * Get failure report summary
   */
  getFailureSummary(): {
    totalFailures: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    byImpact: Record<string, number>;
    topIssues: FailureAnalysis[];
  } {
    const summary = {
      totalFailures: this.failures.length,
      bySeverity: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      byImpact: {} as Record<string, number>,
      topIssues: this.failures.slice(0, 10),
    };

    this.failures.forEach((failure) => {
      summary.bySeverity[failure.diagnostic.severity] =
        (summary.bySeverity[failure.diagnostic.severity] || 0) + 1;
      summary.byCategory[failure.diagnostic.category] =
        (summary.byCategory[failure.diagnostic.category] || 0) + 1;
      summary.byImpact[failure.impact] = (summary.byImpact[failure.impact] || 0) + 1;
    });

    return summary;
  }

  /**
   * Generate CI-friendly failure report
   */
  generateCIReport(): string {
    const summary = this.getFailureSummary();
    let report = '\n🔍 Enhanced Failure Diagnostic Report\n';
    report += '='.repeat(50) + '\n\n';

    report += `📊 Summary: ${summary.totalFailures} failures detected\n\n`;

    if (summary.totalFailures > 0) {
      report += '📈 Failure Breakdown:\n';
      report += `   By Severity: ${JSON.stringify(summary.bySeverity, null, 2)}\n`;
      report += `   By Category: ${JSON.stringify(summary.byCategory, null, 2)}\n`;
      report += `   By Impact: ${JSON.stringify(summary.byImpact, null, 2)}\n\n`;

      report += '🔥 Top Issues:\n';
      summary.topIssues.forEach((issue, index) => {
        report += `   ${index + 1}. ${issue.diagnostic.testName}\n`;
        report += `      Root Cause: ${issue.rootCause}\n`;
        report += `      Severity: ${issue.diagnostic.severity}\n`;
        report += `      Impact: ${issue.impact}\n`;
        report += `      Recommendation: ${issue.fixSuggestions[0] || 'No specific suggestion'}\n\n`;
      });
    }

    return report;
  }

  /**
   * Export failure data for external analysis
   */
  exportData(): {
    failures: FailureAnalysis[];
    summary: ReturnType<EnhancedFailureReporter['getFailureSummary']>;
    timestamp: number;
  } {
    return {
      failures: [...this.failures],
      summary: this.getFailureSummary(),
      timestamp: Date.now(),
    };
  }

  /**
   * Clear all failure data
   */
  clear(): void {
    this.failures = [];
    this.contextCollector = new FailureContextCollector();
  }

  /**
   * Log failure information
   */
  private logFailure(analysis: FailureAnalysis): void {
    const { diagnostic, rootCause, fixSuggestions } = analysis;

    console.error(`\n❌ Test Failure: ${diagnostic.testName}`);
    console.error(`   Suite: ${diagnostic.suiteName}`);
    console.error(`   File: ${diagnostic.filePath}`);
    console.error(`   Severity: ${diagnostic.severity.toUpperCase()}`);
    console.error(`   Category: ${diagnostic.category}`);
    console.error(`   Root Cause: ${rootCause}`);
    console.error(`   Error: ${diagnostic.error.message}`);

    if (diagnostic.execution.memoryDelta) {
      console.error(
        `   Memory Delta: ${(diagnostic.execution.memoryDelta / 1024 / 1024).toFixed(2)}MB`,
      );
    }

    if (diagnostic.testIsolation.statePollution.length > 0) {
      console.error(`   State Pollution: ${diagnostic.testIsolation.statePollution.join(', ')}`);
    }

    console.error(`\n💡 Fix Suggestions:`);
    fixSuggestions.forEach((suggestion, index) => {
      console.error(`   ${index + 1}. ${suggestion}`);
    });

    console.error('\n');
  }
}

/**
 * Default failure reporter instance
 */
export const defaultFailureReporter = new EnhancedFailureReporter();

/**
 * Enhanced test wrapper with failure diagnostics
 */
export function withFailureDiagnostics<T extends (...args: any[]) => Promise<any>>(
  testFn: T,
  context: TestExecutionContext,
): T {
  return (async (...args: Parameters<T>) => {
    const collector = new FailureContextCollector();
    collector.startCollection();

    try {
      return await testFn(...args);
    } catch (error) {
      const executionResult = {
        executionTime: performance.now() - collector['startTime'],
        attempt: 1,
      };

      await defaultFailureReporter.reportFailure(error as Error, context, executionResult);

      throw error;
    }
  }) as T;
}

/**
 * Export utilities
 */
export { FailureContextCollector as ContextCollector };
