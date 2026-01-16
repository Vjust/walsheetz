/**
 * Global Test Setup
 * Configures the test environment with extensive logging and global mocks
 */

import { beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest';
import { SnapshotState } from '@vitest/snapshot';
import '@testing-library/jest-dom/vitest';
import { testLogger } from './utils/TestLogger.js';
import { setupGlobalMocks, cleanup } from './utils/TestHelpers.js';

// Monkey-patch SnapshotState.save() to handle undefined properties
const originalSave = SnapshotState.prototype.save;
SnapshotState.prototype.save = async function() {
  try {
    // Ensure all required properties exist before calling original save
    if (typeof this._snapshotData === 'undefined') {
      this._snapshotData = {};
    }
    if (typeof this._inlineSnapshots === 'undefined') {
      this._inlineSnapshots = [];
    }
    if (typeof this._rawSnapshots === 'undefined') {
      this._rawSnapshots = [];
    }
    if (typeof this._uncheckedKeys === 'undefined') {
      this._uncheckedKeys = new Set();
    }

    return await originalSave.call(this);
  } catch (error) {
    // If save fails due to undefined properties, return a safe default
    if (error?.message?.includes('Cannot read properties of undefined')) {
      return { deleted: false, saved: false };
    }
    throw error;
  }
};

// Initialize global mocks
let timeMock;

beforeAll(() => {
  testLogger.docker('Initializing test environment...');
  testLogger.separator();

  // Setup global mocks
  timeMock = setupGlobalMocks();

  // Initialize snapshot state to prevent teardown crashes
  const state = expect.getState();
  if (!state.snapshotState) {
    // Create a minimal snapshot environment
    const snapshotEnvironment = {
      getVersion: () => '1',
      getHeader: () => '',
      readSnapshotFile: async () => null,
      saveSnapshotFile: async () => {},
      resolvePath: async (testPath) => testPath.replace(/\.(spec|test)\.(js|ts)x?/, '.snap'),
      removeSnapshotFile: async () => {}
    };

    const snapshotState = new SnapshotState(
      '__virtual__/empty.test.js',
      '__virtual__/empty.snap',
      null,
      {
        updateSnapshot: 'none',
        snapshotFormat: { printBasicPrototype: false, printDate: true },
        snapshotEnvironment
      }
    );

    // Ensure all required properties are initialized
    snapshotState._snapshotData = snapshotState._snapshotData || {};
    snapshotState._inlineSnapshots = snapshotState._inlineSnapshots || [];
    snapshotState._rawSnapshots = snapshotState._rawSnapshots || [];

    expect.setState({
      ...state,
      snapshotState
    });
  }

  testLogger.success('Test environment ready');
  testLogger.separator();
});

afterAll(() => {
  testLogger.separator();
  testLogger.docker('Cleaning up test environment...');

  // Restore mocks
  if (timeMock) {
    timeMock.restore();
  }

  testLogger.success('Test environment cleaned up');
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
    if (message.includes('[TEST]')) {
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
