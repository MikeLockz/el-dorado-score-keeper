#!/usr/bin/env node

/**
 * CI Test Runner with Enhanced Features
 *
 * This script provides enhanced test execution for CI environments,
 * including retry logic, performance monitoring, and detailed reporting.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Configuration
const CONFIG = {
  maxRetries: 3,
  retryDelay: 5000,
  timeoutMs: 600000, // 10 minutes
  reportsDir: './test-reports',
  metricsFile: 'test-metrics.json',
};

/**
 * Execute command with timeout and retry logic
 */
function executeCommand(command, retries = CONFIG.maxRetries) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Command timed out after ${CONFIG.timeoutMs}ms: ${command}`));
    }, CONFIG.timeoutMs);

    try {
      const result = execSync(command, {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: CONFIG.timeoutMs,
      });

      clearTimeout(timeout);
      resolve(result);
    } catch (error) {
      clearTimeout(timeout);

      if (retries > 0 && shouldRetry(error)) {
        console.warn(`⚠️  Command failed, retrying... (${retries} attempts left)`);
        console.error(`Error: ${error.message}`);

        setTimeout(() => {
          executeCommand(command, retries - 1)
            .then(resolve)
            .catch(reject);
        }, CONFIG.retryDelay);
      } else {
        reject(error);
      }
    }
  });
}

/**
 * Determine if error should trigger a retry
 */
function shouldRetry(error) {
  const errorMessage = error.message.toLowerCase();

  // Retry on network-related errors
  const retryableErrors = [
    'etimedout',
    'enotfound',
    'econnreset',
    'econnrefused',
    'network',
    'connection',
  ];

  return retryableErrors.some(pattern => errorMessage.includes(pattern));
}

/**
 * Parse test results from JSON output
 */
function parseTestResults(jsonOutput) {
  try {
    return JSON.parse(jsonOutput);
  } catch {
    // Fallback parsing for different output formats
    const lines = jsonOutput.split('\n');
    const results = [];

    for (const line of lines) {
      if (line.includes('"numFailedTests"') || line.includes('"numPassedTests"')) {
        try {
          const parsed = JSON.parse(line);
          results.push(parsed);
        } catch {
          // Skip invalid JSON lines
        }
      }
    }

    return results[results.length - 1] || { numFailedTests: 0, numPassedTests: 0 };
  } catch {
    return { numFailedTests: 0, numPassedTests: 0 };
  }
}

/**
 * Generate performance metrics
 */
function generatePerformanceMetrics(startTime, endTime, testResults) {
  const duration = endTime - startTime;
  const { numFailedTests, numPassedTests } = testResults;
  const totalTests = numFailedTests + numPassedTests;

  return {
    timestamp: new Date().toISOString(),
    duration,
    totalTests,
    passedTests: numPassedTests,
    failedTests: numFailedTests,
    successRate: totalTests > 0 ? numPassedTests / totalTests : 0,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      ci: process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true',
    },
  };
}

/**
 * Write test report
 */
function writeTestReport(metrics, testResults, outputPath) {
  const report = {
    summary: metrics,
    details: testResults,
    timestamp: new Date().toISOString(),
    runner: 'ci-test-runner',
  };

  try {
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`📊 Test report written to: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Failed to write test report: ${error.message}`);
  }
}

/**
 * Write metrics file for external analysis
 */
function writeMetricsFile(metrics, outputPath) {
  try {
    writeFileSync(outputPath, JSON.stringify(metrics, null, 2));
    console.log(`📈 Metrics file written to: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Failed to write metrics file: ${error.message}`);
  }
}

/**
 * Main execution function
 */
async function runTests() {
  const startTime = Date.now();
  console.log('🚀 Starting CI Test Execution');
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log(`   Node Version: ${process.version}`);
  console.log(`   Platform: ${process.platform} (${process.arch})`);
  console.log(`   Working Directory: ${process.cwd()}`);

  try {
    // Ensure reports directory exists
    if (!existsSync(CONFIG.reportsDir)) {
      execSync(`mkdir -p ${CONFIG.reportsDir}`);
    }

    // Run tests with enhanced reporting
    console.log('\n🧪 Running Tests...');

    const testCommand = 'pnpm test --run --config vitest.ci.config.mts --reporter=json';
    const testOutput = await executeCommand(testCommand);

    // Parse test results
    const testResults = parseTestResults(testOutput);
    console.log('\n📊 Test Results:');
    console.log(`   Total Tests: ${testResults.numFailedTests + testResults.numPassedTests}`);
    console.log(`   Passed: ${testResults.numPassedTests}`);
    console.log(`   Failed: ${testResults.numFailedTests}`);

    // Generate metrics
    const endTime = Date.now();
    const metrics = generatePerformanceMetrics(startTime, endTime, testResults);

    // Write reports
    const reportPath = join(CONFIG.reportsDir, 'test-report.json');
    const metricsPath = join(CONFIG.reportsDir, CONFIG.metricsFile);

    writeTestReport(metrics, testResults, reportPath);
    writeMetricsFile(metrics, metricsPath);

    // Log summary
    console.log('\n✅ Test Execution Summary:');
    console.log(`   Duration: ${(metrics.duration / 1000).toFixed(2)}s`);
    console.log(`   Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
    console.log(`   Environment: ${metrics.environment.ci ? 'CI' : 'Local'}`);

    // Exit with appropriate code
    if (testResults.numFailedTests > 0) {
      console.log('\n❌ Tests Failed');
      process.exit(1);
    } else {
      console.log('\n✅ All Tests Passed');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n💥 Test Execution Failed:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);

    // Write error report
    const errorMetrics = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };

    const errorReportPath = join(CONFIG.reportsDir, 'error-report.json');
    writeTestReport(errorMetrics, { numFailedTests: 1, numPassedTests: 0 }, errorReportPath);
    writeMetricsFile(errorMetrics, errorReportPath.replace('.json', '-error.json'));

    console.log(`\n❌ Error report written to: ${errorReportPath}`);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}