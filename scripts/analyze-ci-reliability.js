#!/usr/bin/env node

/**
 * CI Reliability Analysis Script
 *
 * Analyzes test results across multiple CI runs to detect patterns,
 * identify flaky tests, and generate reliability reports.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';

class ReliabilityAnalyzer {
  constructor(metricsDir = './test-metrics') {
    this.testHistory = new Map();
    this.ciMetrics = [];
    this.metricsDir = metricsDir;
  }

  /**
   * Load all available test metrics and results
   */
  async loadTestData() {
    console.log('📊 Loading test data from:', this.metricsDir);

    try {
      // Load all JSON files from metrics directory
      const jsonFiles = await glob('**/*.json', { cwd: this.metricsDir });

      for (const file of jsonFiles) {
        const filePath = join(this.metricsDir, file);
        const content = readFileSync(filePath, 'utf8');

        try {
          const data = JSON.parse(content);

          // Handle different file formats
          if (this.isCIMetrics(data)) {
            this.ciMetrics.push(data);
          } else if (this.isTestMetrics(data)) {
            this.processTestMetrics(data, file);
          }
        } catch (error) {
          console.warn(`⚠️  Failed to parse ${file}:`, error);
        }
      }

      console.log(
        `✅ Loaded ${this.ciMetrics.length} CI metrics and data from ${jsonFiles.length} files`,
      );
    } catch (error) {
      console.error('❌ Failed to load test data:', error);
      throw error;
    }
  }

  /**
   * Process test metrics and extract individual test results
   */
  processTestMetrics(data, filename) {
    // Handle different test report formats
    if (data.summary) {
      // Enhanced test report format
      const timestamp = data.summary.timestamp || new Date().toISOString();

      // Extract individual test results if available
      if (data.testResults) {
        for (const testResult of data.testResults) {
          this.recordTestResult(testResult, timestamp);
        }
      }
    } else if (data.numFailedTests !== undefined) {
      // Vitest JSON output format
      const timestamp = data.timestamp || new Date().toISOString();
      const testResult = {
        testName: 'test-suite',
        status: data.numFailedTests > 0 ? 'failed' : 'passed',
        duration: data.duration || 0,
        timestamp,
        retryCount: data.retryCount || 0,
      };
      this.recordTestResult(testResult, timestamp);
    }
  }

  /**
   * Record an individual test result
   */
  recordTestResult(testResult, timestamp) {
    const key = testResult.testName;

    if (!this.testHistory.has(key)) {
      this.testHistory.set(key, []);
    }

    this.testHistory.get(key).push({
      ...testResult,
      timestamp,
    });
  }

  /**
   * Detect flaky tests based on failure patterns
   */
  detectFlakyTests() {
    const flakyTests = [];

    for (const [testName, results] of this.testHistory.entries()) {
      if (results.length < 3) continue; // Need at least 3 runs to detect flakiness

      const failures = results.filter((r) => r.status === 'failed').length;
      const failureRate = failures / results.length;

      // Consider tests flaky if they fail between 10-50% of the time
      if (failureRate > 0.1 && failureRate < 0.5) {
        const pattern = this.analyzeFailurePattern(results);
        const recommendation = this.generateRecommendation(testName, failureRate, pattern);

        flakyTests.push({
          testName,
          failureRate,
          totalRuns: results.length,
          failures,
          pattern,
          recommendation,
        });
      }
    }

    return flakyTests.sort((a, b) => b.failureRate - a.failureRate);
  }

  /**
   * Analyze failure patterns for a test
   */
  analyzeFailurePattern(results) {
    const failures = results.filter((r) => r.status === 'failed');

    if (failures.length === 0) return 'No failures detected';

    // Analyze error messages for patterns
    const errorMessages = failures.map((f) => f.error || '').filter(Boolean);
    const uniqueErrors = new Set(errorMessages);

    if (uniqueErrors.size === 1) {
      return 'Consistent failure mode';
    } else if (uniqueErrors.size <= 3) {
      return 'Multiple failure modes';
    } else {
      return 'Random failures';
    }
  }

  /**
   * Generate recommendation for flaky test
   */
  generateRecommendation(testName, failureRate, pattern) {
    if (failureRate > 0.3) {
      return 'High failure rate - investigate test isolation and dependencies';
    }

    if (pattern === 'Consistent failure mode') {
      return 'Check for race conditions or timing issues';
    } else if (pattern === 'Multiple failure modes') {
      return 'Review test setup and environment configuration';
    } else {
      return 'Add retry logic and improve test reliability';
    }
  }

  /**
   * Calculate overall reliability metrics
   */
  calculateReliabilityMetrics() {
    if (this.ciMetrics.length === 0) {
      return {
        overallReliability: 0,
        flakyTestRate: 0,
        healthStatus: 'critical',
      };
    }

    // Calculate overall reliability from CI metrics
    const totalSuccessRate = this.ciMetrics.reduce((sum, metric) => sum + metric.successRate, 0);
    const overallReliability = totalSuccessRate / this.ciMetrics.length;

    // Calculate flaky test rate
    const flakyTests = this.detectFlakyTests();
    const totalTestsWithHistory = Array.from(this.testHistory.values()).filter(
      (results) => results.length >= 3,
    ).length;
    const flakyTestRate = totalTestsWithHistory > 0 ? flakyTests.length / totalTestsWithHistory : 0;

    // Determine health status
    let healthStatus;
    if (overallReliability >= 0.95 && flakyTestRate <= 0.05) {
      healthStatus = 'excellent';
    } else if (overallReliability >= 0.9 && flakyTestRate <= 0.1) {
      healthStatus = 'good';
    } else if (overallReliability >= 0.8 && flakyTestRate <= 0.15) {
      healthStatus = 'fair';
    } else if (overallReliability >= 0.7) {
      healthStatus = 'poor';
    } else {
      healthStatus = 'critical';
    }

    return {
      overallReliability,
      flakyTestRate,
      healthStatus,
    };
  }

  /**
   * Generate trends analysis
   */
  generateTrends() {
    // Sort CI metrics by timestamp
    const sortedMetrics = this.ciMetrics
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-10); // Last 10 runs

    const reliabilityTrend = sortedMetrics.map((m) => m.successRate);
    const performanceTrend = sortedMetrics.map((m) => m.duration);

    // Calculate flaky test trend over time
    const flakyTestTrend = [];
    for (let i = 0; i < sortedMetrics.length; i++) {
      const windowMetrics = sortedMetrics.slice(0, i + 1);
      // This is a simplified calculation - in practice you'd track flaky tests over time
      flakyTestTrend.push(this.detectFlakyTests().length);
    }

    return {
      reliabilityTrend,
      performanceTrend,
      flakyTestTrend,
    };
  }

  /**
   * Generate comprehensive reliability report
   */
  generateReport() {
    const flakyTests = this.detectFlakyTests();
    const metrics = this.calculateReliabilityMetrics();
    const trends = this.generateTrends();

    const recommendations = this.generateRecommendations(metrics, flakyTests);

    return {
      timestamp: new Date().toISOString(),
      overallReliability: metrics.overallReliability,
      flakyTestRate: metrics.flakyTestRate,
      healthStatus: metrics.healthStatus,
      flakyTests,
      recommendations,
      trends,
    };
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(metrics, flakyTests) {
    const recommendations = [];

    if (metrics.overallReliability < 0.8) {
      recommendations.push('Overall test reliability is below 80% - review test infrastructure');
    }

    if (metrics.flakyTestRate > 0.1) {
      recommendations.push('High flaky test rate detected - implement test isolation improvements');
    }

    if (flakyTests.length > 5) {
      recommendations.push('Multiple flaky tests detected - consider test suite restructuring');
    }

    // Add specific recommendations for top flaky tests
    flakyTests.slice(0, 3).forEach((test) => {
      recommendations.push(
        `Fix "${test.testName}" - ${(test.failureRate * 100).toFixed(1)}% failure rate`,
      );
    });

    if (recommendations.length === 0) {
      recommendations.push('Test suite is performing well - continue current practices');
    }

    return recommendations;
  }

  /**
   * Type guards
   */
  isCIMetrics(data) {
    return data && typeof data.successRate === 'number' && data.environment;
  }

  isTestMetrics(data) {
    return data && (data.summary || data.numFailedTests !== undefined);
  }
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  console.log('🔍 Starting CI Reliability Analysis');
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log(`   Working Directory: ${process.cwd()}`);

  try {
    // Ensure output directory exists
    const outputDir = './test-metrics';
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Initialize analyzer
    const analyzer = new ReliabilityAnalyzer();

    // Load and analyze test data
    await analyzer.loadTestData();

    // Generate report
    console.log('\n📈 Generating Reliability Report...');
    const report = analyzer.generateReport();

    // Write report to file
    const reportPath = join(outputDir, 'reliability-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📊 Reliability report written to: ${reportPath}`);

    // Log summary
    console.log('\n📋 Reliability Analysis Summary:');
    console.log(`   Overall Reliability: ${(report.overallReliability * 100).toFixed(1)}%`);
    console.log(`   Flaky Test Rate: ${(report.flakyTestRate * 100).toFixed(1)}%`);
    console.log(`   Health Status: ${report.healthStatus.toUpperCase()}`);
    console.log(`   Flaky Tests Detected: ${report.flakyTests.length}`);

    if (report.flakyTests.length > 0) {
      console.log('\n⚠️  Top Flaky Tests:');
      report.flakyTests.slice(0, 5).forEach((test, index) => {
        console.log(
          `   ${index + 1}. ${test.testName} (${(test.failureRate * 100).toFixed(1)}% failure rate)`,
        );
        console.log(`      Pattern: ${test.pattern}`);
        console.log(`      Recommendation: ${test.recommendation}`);
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
    console.log(`\n✅ Analysis completed in ${(duration / 1000).toFixed(2)}s`);

    // Exit with error code if critical issues detected
    if (report.healthStatus === 'critical') {
      console.log('\n🚨 Critical reliability issues detected!');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('\n💥 Reliability Analysis Failed:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);

    // Write error report
    const errorReport = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime,
    };

    const errorReportPath = join('./test-metrics', 'reliability-analysis-error.json');
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
