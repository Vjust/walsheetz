/**
 * Test Helpers
 * Common mocks, fixtures, and utilities for testing
 */

import { vi } from 'vitest';
import { testLogger } from './TestLogger.js';

/**
 * Create a mock EventBus
 */
export function createMockEventBus() {
  const listeners = new Map();

  const mockEventBus = {
    on: vi.fn((event, handler) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event).push(handler);
      testLogger.mockCall('EventBus.on', [event], undefined);
    }),

    off: vi.fn((event, handler) => {
      if (listeners.has(event)) {
        const handlers = listeners.get(event);
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
      testLogger.mockCall('EventBus.off', [event], undefined);
    }),

    emit: vi.fn((event, data) => {
      testLogger.mockCall('EventBus.emit', [event, data], undefined);
      if (listeners.has(event)) {
        listeners.get(event).forEach(handler => handler(data));
      }
    }),

    // Helper to get emitted events
    getEmittedEvents: (eventName) => {
      return mockEventBus.emit.mock.calls
        .filter(call => call[0] === eventName)
        .map(call => call[1]);
    },

    // Helper to clear all listeners
    clearAll: () => {
      listeners.clear();
    }
  };

  return mockEventBus;
}

/**
 * Create a mock localStorage
 */
export function createMockLocalStorage() {
  const store = new Map();

  return {
    getItem: vi.fn((key) => {
      const value = store.get(key) || null;
      testLogger.mockCall('localStorage.getItem', [key], value);
      return value;
    }),

    setItem: vi.fn((key, value) => {
      store.set(key, value);
      testLogger.mockCall('localStorage.setItem', [key, value], undefined);
    }),

    removeItem: vi.fn((key) => {
      store.delete(key);
      testLogger.mockCall('localStorage.removeItem', [key], undefined);
    }),

    clear: vi.fn(() => {
      store.clear();
      testLogger.mockCall('localStorage.clear', [], undefined);
    }),

    // Helper to get stored data
    getStore: () => Object.fromEntries(store)
  };
}

/**
 * Create a mock logger
 */
export function createMockLogger() {
  return {
    info: vi.fn((...args) => testLogger.debug(`Logger.info: ${args.join(' ')}`)),
    warn: vi.fn((...args) => testLogger.debug(`Logger.warn: ${args.join(' ')}`)),
    error: vi.fn((...args) => testLogger.debug(`Logger.error: ${args.join(' ')}`)),
    debug: vi.fn((...args) => testLogger.debug(`Logger.debug: ${args.join(' ')}`))
  };
}

/**
 * Create a mock BrowserSuiService
 */
export function createMockBrowserSuiService() {
  return {
    certifyBlob: vi.fn((blobId, options) => {
      const result = {
        success: true,
        transactionDigest: `0x${Math.random().toString(36).substring(2, 15)}`,
        effects: {},
        events: [],
        timestamp: Date.now()
      };
      testLogger.mockCall('browserSuiService.certifyBlob', [blobId, options], result);
      return Promise.resolve(result);
    }),

    isConnected: true
  };
}

/**
 * Create a mock BrowserWalrusService
 */
export function createMockBrowserWalrusService() {
  return {
    getPoACertificate: vi.fn((blobId) => {
      const result = {
        success: true,
        blobId,
        poaStatus: 'certified',
        certificate: {
          blobId,
          expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
          certifiedAt: Date.now()
        }
      };
      testLogger.mockCall('browserWalrusService.getPoACertificate', [blobId], result);
      return Promise.resolve(result);
    }),

    storeBlob: vi.fn((data) => {
      const result = {
        success: true,
        blobId: `blob_${Math.random().toString(36).substring(2, 15)}`,
        metadata: data.metadata || {}
      };
      testLogger.mockCall('browserWalrusService.storeBlob', [data], result);
      return Promise.resolve(result);
    })
  };
}

/**
 * Create mock storage adapter
 */
export function createMockStorageAdapter() {
  const session = {
    currentSpreadsheetId: `obj_${Math.random().toString(36).substring(2, 15)}`,
    lastWalrusBlobId: null
  };

  return {
    getCurrentSpreadsheetId: vi.fn(() => {
      testLogger.mockCall('storageAdapter.getCurrentSpreadsheetId', [], session.currentSpreadsheetId);
      return session.currentSpreadsheetId;
    }),

    getLastWalrusBlobId: vi.fn(() => {
      testLogger.mockCall('storageAdapter.getLastWalrusBlobId', [], session.lastWalrusBlobId);
      return session.lastWalrusBlobId;
    }),

    setLastWalrusBlobId: vi.fn((blobId) => {
      session.lastWalrusBlobId = blobId;
      testLogger.mockCall('storageAdapter.setLastWalrusBlobId', [blobId], undefined);
    })
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Create a deferred promise
 */
export function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Generate test blob ID
 */
export function generateBlobId() {
  return `blob_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Generate test object ID
 */
export function generateObjectId() {
  return `0x${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Generate test transaction digest
 */
export function generateTxDigest() {
  return `0x${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create test fixture for blob version
 */
export function createBlobVersionFixture(overrides = {}) {
  return {
    blobId: generateBlobId(),
    objectId: generateObjectId(),
    version: 1,
    timestamp: Date.now(),
    transactionDigest: generateTxDigest(),
    parentBlobId: null,
    size: 1024,
    contentHash: `hash_${Math.random().toString(36).substring(2, 15)}`,
    createdBy: generateObjectId(),
    description: 'Test version',
    poaStatus: 'uncertified',
    expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    ...overrides
  };
}

/**
 * Create test fixture for transaction
 */
export function createTransactionFixture(overrides = {}) {
  return {
    id: generateTxDigest(),
    transactionDigest: generateTxDigest(),
    type: 'blob_store',
    status: 'confirmed',
    blobId: generateBlobId(),
    objectId: generateObjectId(),
    address: generateObjectId(),
    error: null,
    metadata: {},
    timestamp: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  };
}

/**
 * Create test fixture for PoA certificate
 */
export function createCertificateFixture(overrides = {}) {
  return {
    blobId: generateBlobId(),
    status: 'certified',
    certificate: {
      blobId: overrides.blobId || generateBlobId(),
      expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
      certifiedAt: Date.now()
    },
    transactionDigest: generateTxDigest(),
    firstCertified: Date.now(),
    lastChecked: Date.now(),
    lastRenewed: null,
    renewalCount: 0,
    ...overrides
  };
}

/**
 * Mock console methods
 */
export function mockConsole() {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    debug: console.debug
  };

  console.log = vi.fn();
  console.error = vi.fn();
  console.warn = vi.fn();
  console.debug = vi.fn();

  return () => {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.debug = originalConsole.debug;
  };
}

/**
 * Setup global mocks
 */
export function setupGlobalMocks() {
  // Mock localStorage if not available
  if (typeof global.localStorage === 'undefined') {
    global.localStorage = createMockLocalStorage();
  }

  // Mock window if not available
  if (typeof global.window === 'undefined') {
    global.window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
  }

  // Mock Date.now for consistent timestamps in tests
  const originalDateNow = Date.now;
  let mockTime = 1700000000000; // Fixed timestamp for tests

  global.Date.now = vi.fn(() => mockTime);

  return {
    advanceTime: (ms) => {
      mockTime += ms;
    },
    setTime: (time) => {
      mockTime = time;
    },
    resetTime: () => {
      mockTime = 1700000000000;
    },
    restore: () => {
      global.Date.now = originalDateNow;
    }
  };
}

/**
 * Clean up after tests
 */
export function cleanup() {
  vi.clearAllMocks();
  vi.clearAllTimers();

  // Clear localStorage if mocked
  if (global.localStorage && typeof global.localStorage.clear === 'function') {
    global.localStorage.clear();
  }
}

export default {
  createMockEventBus,
  createMockLocalStorage,
  createMockLogger,
  createMockBrowserSuiService,
  createMockBrowserWalrusService,
  createMockStorageAdapter,
  waitFor,
  createDeferred,
  generateBlobId,
  generateObjectId,
  generateTxDigest,
  createBlobVersionFixture,
  createTransactionFixture,
  createCertificateFixture,
  mockConsole,
  setupGlobalMocks,
  cleanup
};
