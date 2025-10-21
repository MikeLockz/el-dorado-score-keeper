#!/usr/bin/env node

/**
 * Performance Report Generation Script
 *
 * Analyzes test performance data and generates comprehensive reports
 * with trends, bottlenecks, and optimization recommendations.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';

class PerformanceAnalyzer {
  constructor(dataDir = './performance-data') {
    this.testMetrics = [];
    this.suiteMetrics = [];
    this.dataDir = dataDir;
    this.thresholds = {
      testWarning: 5000, // 5 seconds
      testCritical: 10000, // 10 seconds
      suiteWarning: 30000, // 30 seconds
      suiteCritical: 60000, // 60 seconds
    };
  }

  /**
   * Load performance data from multiple sources
   */
  async loadPerformanceData() {
    console.log('📊 Loading performance data from:', this.dataDir);

    try {
      // Load all JSON files
      const jsonFiles = await glob('**/*.json', { cwd: this.dataDir });

      for (const file of jsonFiles) {
        const filePath = join(this.dataDir, file);
        const content = readFileSync(filePath, 'utf8');

        try {
          const data = JSON.parse(content);

          // Process different data formats
          if (this.isTestSuiteMetrics(data)) {
            this.suiteMetrics.push(data);
          } else if (this.isTestMetrics(data)) {
            this.processTestMetrics(data);
          } else if (this.isPerformanceReport(data)) {
            // Merge existing performance data
            if (data.testMetrics) {
              this.testMetrics.push(...data.testMetrics);
            }
          }
        } catch (error) {
          console.warn(`⚠️  Failed to parse ${file}:`, error);
        }
      }

      console.log(
        `✅ Loaded ${this.testMetrics.length} test metrics and ${this.suiteMetrics.length} suite metrics`,
      );
    } catch (error) {
      console.error('❌ Failed to load performance data:', error);
      throw error;
    }
  }

  /**
   * Process individual test metrics from various formats
   */
  processTestMetrics(data) {
    // Handle different test report formats
    if (data.summary && data.testResults) {
      // Enhanced test report format with individual test results
      for (const testResult of data.testResults) {
        this.testMetrics.push({
          testName: testResult.testName || testResult.name || 'unknown',
          duration: testResult.duration || 0,
          memoryUsage: testResult.memoryUsage || 0,
          timestamp: testResult.timestamp || data.summary.timestamp,
          status: testResult.status || (testResult.failed ? 'failed' : 'passed'),
          retryCount: testResult.retryCount || 0,
        });
      }
    } else if (data.numFailedTests !== undefined) {
      // Vitest JSON output format - create aggregate metric
      this.testMetrics.push({
        testName: 'test-suite',
        duration: data.duration || 0,
        memoryUsage: 0,
        timestamp: data.timestamp || new Date().toISOString(),
        status: data.numFailedTests > 0 ? 'failed' : 'passed',
        retryCount: data.retryCount || 0,
      });
    }
  }

  /**
   * Identify slow tests based on thresholds
   */
  identifySlowTests() {
    const slowTests = [];
    const testGroups = this.groupTestMetrics();

    for (const [testName, metrics] of testGroups.entries()) {
      if (metrics.length < 2) continue; // Need multiple data points for trend analysis

      const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
      const maxDuration = Math.max(...metrics.map((m) => m.duration));

      // Determine if test is slow based on thresholds
      let threshold = this.thresholds.testWarning;
      let status = 'warning';

      if (maxDuration > this.thresholds.testCritical) {
        threshold = this.thresholds.testCritical;
        status = 'critical';
      } else if (avgDuration > this.thresholds.testWarning) {
        threshold = this.thresholds.testWarning;
        status = 'warning';
      } else {
        continue; // Test is not slow
      }

      // Analyze performance trend
      const trend = this.analyzePerformanceTrend(metrics);
      const recommendation = this.generatePerformanceRecommendation(
        testName,
        avgDuration,
        status,
        trend,
      );

      slowTests.push({
        testName,
        duration: maxDuration,
        threshold,
        status,
        trend,
        recommendation,
      });
    }

    return slowTests.sort((a, b) => b.duration - a.duration);
  }

  /**
   * Group test metrics by test name
   */
  groupTestMetrics() {
    const groups = new Map();

    for (const metric of this.testMetrics) {
      if (!groups.has(metric.testName)) {
        groups.set(metric.testName, []);
      }
      groups.get(metric.testName).push(metric);
    }

    return groups;
  }

  /**
   * Analyze performance trend for a test
   */
  analyzePerformanceTrend(metrics) {
    if (metrics.length < 3) return 'stable';

    // Sort by timestamp
    const sortedMetrics = metrics
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-5); // Last 5 runs

    const durations = sortedMetrics.map((m) => m.duration);

    // Simple linear regression to determine trend
    const n = durations.length;
    const sumX = (n * (n - 1)) / 2; // 0 + 1 + 2 + ... + (n-1)
    const sumY = durations.reduce((sum, d) => sum + d, 0);
    const sumXY = durations.reduce((sum, d, i) => sum + d * i, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6; // 0² + 1² + 2² + ... + (n-1)²

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Determine trend based on slope
    if (slope > 100) {
      // Significant increase in duration
      return 'degrading';
    } else if (slope < -100) {
      // Significant decrease in duration
      return 'improving';
    } else {
      return 'stable';
    }
  }

  /**
   * Generate performance recommendation for a test
   */
  generatePerformanceRecommendation(testName, avgDuration, status, trend) {
    const baseRecommendations = {
      warning: [
        'Consider optimizing test setup and teardown',
        'Review test data preparation for efficiency',
        'Check for unnecessary waits or delays',
      ],
      critical: [
        'Test is significantly slow - requires immediate attention',
        'Break down into smaller, faster tests',
        'Review test implementation for performance bottlenecks',
        'Consider test parallelization',
      ],
    };

    const trendRecommendations = {
      degrading: 'Performance is getting worse - investigate recent changes',
      improving: 'Performance is improving - continue optimization efforts',
      stable: 'Performance is stable - focus on other optimizations',
    };

    const baseRec =
      baseRecommendations[status][Math.floor(Math.random() * baseRecommendations[status].length)];
    const trendRec = trendRecommendations[trend];

    return `${baseRec}. ${trendRec}`;
  }

  /**
   * Identify performance bottlenecks
   */
  identifyBottlenecks() {
    const testGroups = this.groupTestMetrics();

    // Find slowest test suites
    const suiteDurations = new Map();

    for (const [testName, metrics] of testGroups.entries()) {
      // Extract suite name from test name (e.g., "suite: test" -> "suite")
      const suiteName = testName.split(':')[0] || 'default';

      if (!suiteDurations.has(suiteName)) {
        suiteDurations.set(suiteName, { total: 0, count: 0, max: 0 });
      }

      const suite = suiteDurations.get(suiteName);
      const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
      const avgDuration = totalDuration / metrics.length;
      const maxDuration = Math.max(...metrics.map((m) => m.duration));

      suite.total += avgDuration;
      suite.count += 1;
      suite.max = Math.max(suite.max, maxDuration);
    }

    const slowestSuites = Array.from(suiteDurations.entries())
      .map(([name, data]) => ({
        name,
        avgDuration: data.total / data.count,
        totalTests: data.count,
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);

    // Find memory intensive tests
    const memoryIntensiveTests = Array.from(testGroups.entries())
      .map(([name, metrics]) => {
        const memoryUsages = metrics.map((m) => m.memoryUsage).filter((m) => m > 0);
        if (memoryUsages.length === 0) return null;

        return {
          name,
          avgMemoryUsage: memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length,
          maxMemoryUsage: Math.max(...memoryUsages),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.avgMemoryUsage - a.avgMemoryUsage)
      .slice(0, 10);

    return {
      slowestSuites,
      memoryIntensiveTests,
    };
  }

  /**
   * Generate performance trends
   */
  generateTrends() {
    // Sort suite metrics by timestamp
    const sortedMetrics = this.suiteMetrics
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-20); // Last 20 runs

    const performanceTrend = sortedMetrics.map((m) => m.successRate);
    const durationTrend = sortedMetrics.map((m) => m.duration);

    // Calculate memory trend if available
    const memoryTrend = this.testMetrics
      .filter((m) => m.memoryUsage > 0)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-20)
      .map((m) => m.memoryUsage);

    return {
      performanceTrend,
      durationTrend,
      memoryTrend,
    };
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport() {
    const slowTests = this.identifySlowTests();
    const bottlenecks = this.identifyBottlenecks();
    const trends = this.generateTrends();

    // Calculate summary statistics
    const totalTests = this.testMetrics.length;
    const totalDuration = this.testMetrics.reduce((sum, m) => sum + m.duration, 0);
    const averageDuration = totalTests > 0 ? totalDuration / totalTests : 0;

    const slowestTest = slowTests.length > 0 ? slowTests[0].testName : 'N/A';
    const fastestTest =
      this.testMetrics.length > 0
        ? this.testMetrics.reduce((fastest, current) =>
            current.duration < fastest.duration ? current : fastest,
          ).testName
        : 'N/A';

    const successRate =
      this.testMetrics.length > 0
        ? this.testMetrics.filter((m) => m.status === 'passed').length / this.testMetrics.length
        : 0;

    const recommendations = this.generateRecommendations(slowTests, bottlenecks, successRate);

    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests,
        totalDuration,
        averageDuration,
        slowestTest,
        fastestTest,
        successRate,
      },
      slowTests,
      trends,
      bottlenecks,
      recommendations,
      thresholds: {
        testWarningThreshold: this.thresholds.testWarning,
        testCriticalThreshold: this.thresholds.testCritical,
        suiteWarningThreshold: this.thresholds.suiteWarning,
        suiteCriticalThreshold: this.thresholds.suiteCritical,
      },
    };
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(slowTests, bottlenecks, successRate) {
    const recommendations = [];

    // Overall performance recommendations
    if (slowTests.length > 5) {
      recommendations.push('High number of slow tests detected - consider test suite optimization');
    }

    if (successRate < 0.9) {
      recommendations.push(
        'Low test success rate may be impacting performance - fix failing tests first',
      );
    }

    // Slow test recommendations
    const criticalSlowTests = slowTests.filter((t) => t.status === 'critical');
    if (criticalSlowTests.length > 0) {
      recommendations.push(
        `${criticalSlowTests.length} critical slow tests require immediate optimization`,
      );
    }

    // Bottleneck recommendations
    if (bottlenecks.slowestSuites.length > 0) {
      const slowestSuite = bottlenecks.slowestSuites[0];
      if (slowestSuite.avgDuration > this.thresholds.suiteWarning) {
        recommendations.push(
          `"${slowestSuite.name}" suite is significantly slow - consider splitting or optimizing`,
        );
      }
    }

    // Memory usage recommendations
    if (bottlenecks.memoryIntensiveTests.length > 0) {
      const memoryIntensive = bottlenecks.memoryIntensiveTests[0];
      if (memoryIntensive.avgMemoryUsage > 50 * 1024 * 1024) {
        // 50MB
        recommendations.push(
          `"${memoryIntensive.name}" has high memory usage - optimize memory management`,
        );
      }
    }

    // Trend-based recommendations
    const trends = this.generateTrends();
    if (trends.durationTrend.length > 5) {
      const recentDurations = trends.durationTrend.slice(-5);
      const olderDurations = trends.durationTrend.slice(-10, -5);

      if (olderDurations.length > 0) {
        const recentAvg = recentDurations.reduce((sum, d) => sum + d, 0) / recentDurations.length;
        const olderAvg = olderDurations.reduce((sum, d) => sum + d, 0) / olderDurations.length;

        if (recentAvg > olderAvg * 1.2) {
          recommendations.push(
            'Test execution time is increasing - review recent changes for performance impact',
          );
        }
      }
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Test performance is within acceptable thresholds - continue monitoring',
      );
    }

    return recommendations;
  }

  /**
   * Type guards
   */
  isTestSuiteMetrics(data) {
    return data && typeof data.successRate === 'number' && data.environment;
  }

  isTestMetrics(data) {
    return data && (data.summary || data.numFailedTests !== undefined || data.testMetrics);
  }

  isPerformanceReport(data) {
    return data && data.summary && data.slowTests;
  }
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  console.log('🚀 Starting Performance Report Generation');
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log(`   Working Directory: ${process.cwd()}`);

  try {
    // Ensure output directory exists
    const outputDir = './performance-data';
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Initialize analyzer
    const analyzer = new PerformanceAnalyzer();

    // Load and analyze performance data
    await analyzer.loadPerformanceData();

    // Generate report
    console.log('\n📈 Generating Performance Report...');
    const report = analyzer.generateReport();

    // Write report to file
    const reportPath = join(outputDir, 'performance-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📊 Performance report written to: ${reportPath}`);

    // Log summary
    console.log('\n📋 Performance Analysis Summary:');
    console.log(`   Total Tests: ${report.summary.totalTests}`);
    console.log(`   Total Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`);
    console.log(`   Average Duration: ${(report.summary.averageDuration / 1000).toFixed(2)}s`);
    console.log(`   Success Rate: ${(report.summary.successRate * 100).toFixed(1)}%`);
    console.log(`   Slow Tests Detected: ${report.slowTests.length}`);

    if (report.slowTests.length > 0) {
      console.log('\n⚠️  Slow Tests:');
      report.slowTests.slice(0, 5).forEach((test, index) => {
        console.log(
          `   ${index + 1}. ${test.testName}: ${(test.duration / 1000).toFixed(2)}s (${test.status.toUpperCase()})`,
        );
        console.log(`      Trend: ${test.trend}, Recommendation: ${test.recommendation}`);
      });
    }

    if (report.bottlenecks.slowestSuites.length > 0) {
      console.log('\n🔍 Performance Bottlenecks:');
      report.bottlenecks.slowestSuites.slice(0, 3).forEach((suite, index) => {
        console.log(
          `   ${index + 1}. ${suite.name}: ${(suite.avgDuration / 1000).toFixed(2)}s avg (${suite.totalTests} tests)`,
        );
      });
    }

    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    }

    // Log performance
    const duration = Date.now() - startTime;
    console.log(`\n✅ Report generated in ${(duration / 1000).toFixed(2)}s`);

    // Exit with error code if critical performance issues detected
    const criticalSlowTests = report.slowTests.filter((t) => t.status === 'critical');
    if (criticalSlowTests.length > 0) {
      console.log('\n🚨 Critical performance issues detected!');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('\n💥 Performance Report Generation Failed:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);

    // Write error report
    const errorReport = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime,
    };

    const errorReportPath = join('./performance-data', 'performance-analysis-error.json');
    try {
      writeFileSync(errorReportPath, JSON.stringify(errorReport, null, 2));
      console.log(`\n❌ Error report written to: ${errorReportPath}`);
    } catch (writeError) {
      console.error('Failed to write error report:', writeError);
    }

    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
