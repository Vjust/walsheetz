#!/usr/bin/env node

/**
 * WalSheetz Smoke Test Script
 *
 * Runs basic end-to-end smoke tests to verify critical functionality.
 * This script starts services, runs tests, and cleans up automatically.
 *
 * Run with: bun run test:smoke
 */

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { createLogger } from './utils/logger.js';

const logger = createLogger('SmokeTest', { logLevel: 'INFO' });

class SmokeTestRunner {
  constructor() {
    this.frontendProcess = null;
    this.passed = [];
    this.failed = [];
  }

  /**
   * Start the frontend dev server
   */
  async startFrontend() {
    logger.info('Starting frontend server...');

    return new Promise((resolve, reject) => {
      this.frontendProcess = spawn('bun', ['run', 'dev'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';

      this.frontendProcess.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('ready') || output.includes('Local:')) {
          logger.info('Frontend server started');
          resolve();
        }
      });

      this.frontendProcess.stderr.on('data', (data) => {
        // Vite warnings are not critical
        logger.debug('Frontend output:', { message: data.toString() });
      });

      this.frontendProcess.on('error', reject);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!output.includes('ready') && !output.includes('Local:')) {
          reject(new Error('Frontend server timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Test frontend is accessible
   */
  async testFrontendAccess() {
    logger.info('Testing frontend accessibility...');

    try {
      const response = await fetch('http://localhost:3005', {
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const html = await response.text();
        if (html.includes('<!DOCTYPE html') || html.includes('<html')) {
          this.passed.push('Frontend serves HTML');
          logger.info('Frontend accessibility test passed');
          return true;
        } else {
          this.failed.push('Frontend does not serve valid HTML');
          logger.error('Frontend accessibility test failed');
          return false;
        }
      } else {
        this.failed.push(`Frontend returned ${response.status}`);
        logger.error('Frontend accessibility test failed', { status: response.status });
        return false;
      }
    } catch (error) {
      this.failed.push(`Frontend unreachable: ${error.message}`);
      logger.error('Frontend accessibility test failed', { error: error.message });
      return false;
    }
  }

  /**
   * Test Walrus publisher connectivity
   */
  async testWalrusPublisher() {
    logger.info('Testing Walrus publisher connectivity...');

    const publisherUrl = process.env.WALRUS_PUBLISHER_URL ||
                         'https://publisher.walrus-testnet.walrus.space';

    try {
      const response = await fetch(`${publisherUrl}/v1/api`, {
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        this.passed.push('Walrus publisher is accessible');
        logger.info('Walrus publisher test passed', { url: publisherUrl });
        return true;
      } else {
        this.failed.push(`Walrus publisher returned ${response.status}`);
        logger.warn('Walrus publisher test failed', {
          status: response.status,
          note: 'This is non-critical for local dev'
        });
        return false;
      }
    } catch (error) {
      this.failed.push(`Walrus publisher unreachable: ${error.message}`);
      logger.warn('Walrus publisher test failed', {
        error: error.message,
        note: 'This is non-critical for local dev'
      });
      return false;
    }
  }

  /**
   * Cleanup: stop all services
   */
  async cleanup() {
    logger.info('Cleaning up services...');

    if (this.frontendProcess) {
      this.frontendProcess.kill('SIGTERM');
      logger.debug('Frontend process terminated');
    }

    // Give processes time to cleanup
    await delay(2000);

    logger.info('Cleanup complete');
  }

  /**
   * Print test summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    logger.info('Smoke Test Summary');
    console.log('='.repeat(60) + '\n');

    if (this.passed.length > 0) {
      console.log('Passed Tests:');
      this.passed.forEach(msg => console.log(`   - ${msg}`));
      console.log('');
    }

    if (this.failed.length > 0) {
      console.log('Failed Tests:');
      this.failed.forEach(msg => console.log(`   - ${msg}`));
      console.log('');
    }

    const total = this.passed.length + this.failed.length;
    const passRate = Math.round((this.passed.length / total) * 100);

    console.log(`Results: ${this.passed.length}/${total} passed (${passRate}%)\n`);

    if (this.failed.length === 0) {
      console.log('All smoke tests passed.\n');
      return 0;
    } else {
      console.log('Some smoke tests failed. Review the output above.\n');
      return 1;
    }
  }

  /**
   * Run all smoke tests
   */
  async run() {
    logger.info('Starting smoke test suite...');

    try {
      // Start services
      logger.info('Starting services...');
      await this.startFrontend();
      await delay(3000); // Wait for frontend to stabilize

      // Run tests
      logger.info('Running tests...');
      await this.testFrontendAccess();
      await delay(500);

      await this.testWalrusPublisher();
      await delay(500);

      // More tests can be added here
      // await this.testDashboardLoad();
      // await this.testSpreadsheetCreate();

    } catch (error) {
      logger.critical('Smoke test suite failed', {
        error: error.message,
        stack: error.stack
      });
      this.failed.push(`Setup failed: ${error.message}`);
    } finally {
      // Always cleanup
      await this.cleanup();
    }

    // Print summary and return exit code
    return this.printSummary();
  }
}

// Main execution
async function main() {
  console.log('\nWalSheetz Smoke Test Suite\n');

  const runner = new SmokeTestRunner();
  const exitCode = await runner.run();

  process.exit(exitCode);
}

// Handle errors
process.on('uncaughtException', (error) => {
  logger.critical('Uncaught exception in smoke test', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.critical('Unhandled rejection in smoke test', {
    reason: reason?.message || reason
  });
  process.exit(1);
});

// Run tests
main();
