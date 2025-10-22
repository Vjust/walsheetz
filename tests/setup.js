/**
 * Global Test Setup
 * Configures the test environment with extensive logging and global mocks
 */

import { beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { testLogger } from './utils/TestLogger.js';
import { setupGlobalMocks, cleanup } from './utils/TestHelpers.js';

// Initialize global mocks
let timeMock;

beforeAll(() => {
  testLogger.docker('🐳 Initializing test environment...');
  testLogger.separator();

  // Setup global mocks
  timeMock = setupGlobalMocks();

  testLogger.success('✅ Test environment ready');
  testLogger.separator();
  testLogger.log('', '', 'white');
});

afterAll(() => {
  testLogger.log('', '', 'white');
  testLogger.separator();
  testLogger.docker('🐳 Cleaning up test environment...');

  // Restore mocks
  if (timeMock) {
    timeMock.restore();
  }

  testLogger.success('✅ Test environment cleaned up');
  testLogger.separator();
});

beforeEach(() => {
  // Reset time mock before each test
  if (timeMock) {
    timeMock.resetTime();
  }
});

afterEach(() => {
  // Cleanup after each test
  cleanup();
});

// Suppress noise from services during tests (unless verbose mode)
if (process.env.VITEST_LOG_LEVEL !== 'debug') {
  const originalConsole = {
    log: console.log,
    warn: console.warn
  };

  // Only suppress service-level logs, not test logs
  console.log = (...args) => {
    const message = args.join(' ');
    // Allow test logger messages through
    if (message.includes('✅') || message.includes('❌') || message.includes('🧪')) {
      originalConsole.log(...args);
    } else if (process.env.VITEST_LOG_LEVEL === 'verbose') {
      originalConsole.log(...args);
    }
  };

  console.warn = (...args) => {
    if (process.env.VITEST_LOG_LEVEL === 'verbose') {
      originalConsole.warn(...args);
    }
  };
}

// Export test utilities for convenience
export { testLogger, timeMock };
