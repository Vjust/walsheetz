import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * BlockchainAdapter Fallback Retry System Tests
 *
 * Tests critical bugfixes by properly mocking all services BEFORE adapter construction.
 * This ensures the adapter never touches real network services during tests:
 * 1. Wallet gating now invokes predicate (was checking truthy function reference)
 * 2. Fallback retry uses cached data (was using current in-memory sheet)
 * 3. Stale detection, cleanup, and export work correctly
 */

// Mock localStorage with proper Object.keys support
const localStorageMock = (() => {
  let store = {};

  // Create a proxy that properly handles Object.keys()
  return new Proxy(store, {
    get(target, prop) {
      if (prop === 'getItem') return (key) => target[key] || null;
      if (prop === 'setItem') return (key, value) => { target[key] = value; };
      if (prop === 'removeItem') return (key) => { delete target[key]; };
      if (prop === 'clear') return () => { Object.keys(target).forEach(k => delete target[k]); };
      return target[prop];
    },
    has(target, prop) {
      return prop in target;
    },
    ownKeys(target) {
      return Object.keys(target);
    },
    getOwnPropertyDescriptor() {
      return { configurable: true, enumerable: true };
    }
  });
})();
global.localStorage = localStorageMock;

// Mock window with full event listener support for event testing
global.window = global.window || {
  listeners: {},
  addEventListener(event, handler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  },
  removeEventListener(event, handler) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(h => h !== handler);
    }
  },
  dispatchEvent: vi.fn()
};

// CRITICAL: Mock all service modules BEFORE importing BlockchainAdapter
// This prevents the adapter constructor from using real services
vi.mock('../services/BrowserWalletManager.js', () => ({
  browserWalletManager: {
    isConnected: true,
    getWalletInfo: vi.fn().mockReturnValue({ address: '0x1234' }),
    connect: vi.fn().mockResolvedValue({ success: true }),
    disconnect: vi.fn().mockResolvedValue(true),
    autoReconnect: vi.fn().mockResolvedValue(false),
    on: vi.fn(),
    off: vi.fn()
  }
}));

vi.mock('../services/BrowserSuiService.js', () => ({
  browserSuiService: {
    initialize: vi.fn().mockResolvedValue(true),
    getBalance: vi.fn().mockResolvedValue({ totalBalance: '1000000000' }),
    subscribeToEvents: vi.fn(),
    createStorageTransaction: vi.fn(),
    executeTransaction: vi.fn().mockResolvedValue({ success: true, digest: '0xabc' }),
    estimateGas: vi.fn().mockResolvedValue({ estimatedCostSUI: 0.01 }),
    checkSufficientBalance: vi.fn().mockResolvedValue({ sufficient: true })
  }
}));

vi.mock('../services/BrowserWalrusService.js', () => ({
  browserWalrusService: {
    connect: vi.fn().mockResolvedValue(true),
    storeBlob: vi.fn().mockResolvedValue({ success: true, blobId: 'blob123' })
  }
}));

vi.mock('../services/CollaborationService.js', () => ({
  collaborationService: {
    connectUser: vi.fn().mockResolvedValue({ userId: '123', userName: 'Test' }),
    disconnectUser: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../services/ErrorRecoveryService.js', () => ({
  errorRecoveryService: {
    handleError: vi.fn().mockResolvedValue({ userMessage: 'Error occurred', category: 'BLOCKCHAIN', requiresUserAction: false })
  }
}));

vi.mock('../services/ProgressiveEnhancementService.js', () => ({
  progressiveEnhancementService: {
    forceHealthCheck: vi.fn().mockResolvedValue({ degradationLevel: 0 }),
    executeWithFallback: vi.fn().mockImplementation((name, primary, fallback) => primary()),
    getServiceStatus: vi.fn().mockReturnValue({ degradationLevel: 0 }),
    getAvailableFeatures: vi.fn().mockReturnValue([]),
    getStatusMessage: vi.fn().mockReturnValue('All systems operational')
  }
}));

vi.mock('../services/OfflineModeService.js', () => ({
  offlineModeService: {
    isOnline: true,
    createOfflineSpreadsheet: vi.fn().mockResolvedValue({ success: true, spreadsheetId: 'offline123' }),
    saveOfflineSpreadsheet: vi.fn().mockResolvedValue({ success: true }),
    loadOfflineSpreadsheet: vi.fn().mockResolvedValue({ success: true, data: {} }),
    getOfflineSpreadsheets: vi.fn().mockReturnValue([]),
    processPendingOperations: vi.fn().mockResolvedValue([]),
    getOfflineStatus: vi.fn().mockReturnValue({ isOffline: false }),
    // Prevent constructor from running and accessing window
    setupOfflineDetection: vi.fn(),
    loadPersistedData: vi.fn()
  }
}));

vi.mock('../utils/Logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    startTimer: vi.fn(),
    endTimer: vi.fn(),
    logBlockchainOperation: vi.fn(),
    logCellOperation: vi.fn(),
    getTimerDuration: vi.fn().mockReturnValue(100)
  },
  LogComponent: {
    BLOCKCHAIN_ADAPTER: 'BLOCKCHAIN_ADAPTER',
    WALLET_MANAGER: 'WALLET_MANAGER',
    STORAGE_SERVICE: 'STORAGE_SERVICE',
    COLLABORATION: 'COLLABORATION'
  },
  ErrorCategory: {
    BLOCKCHAIN: 'BLOCKCHAIN',
    WALLET: 'WALLET',
    NETWORK: 'NETWORK'
  }
}));

vi.mock('../utils/ConfigLoader.js', () => ({
  configLoader: {
    getConfig: vi.fn().mockResolvedValue({
      currentNetwork: 'testnet',
      packageId: '0xtest',
      registryObjectId: '0xreg'
    })
  }
}));

vi.mock('../utils/ValidationGuards.js', () => ({
  validationGuards: {
    runPreflightChecks: vi.fn().mockResolvedValue({ overall: { status: 'passed' } })
  }
}));

vi.mock('../services/TransactionManager.js', () => ({
  transactionManager: {
    getTransactionState: vi.fn().mockReturnValue({})
  }
}));

vi.mock('../utils/EventBus.js', () => ({
  transactionEventBus: {}
}));

vi.mock('../utils/errors.js', () => ({
  NetworkError: Error,
  WalletError: Error,
  ContractError: Error,
  ValidationError: Error,
  StorageError: Error,
  ErrorFactory: {
    create: vi.fn((type, msg) => new Error(msg)),
    fromError: vi.fn((err) => ({ details: {} }))
  }
}));

vi.mock('../utils/StandardizedErrorHandler.js', () => ({
  standardizedErrorHandler: {
    processError: vi.fn().mockResolvedValue({
      userMessage: 'An error occurred',
      category: 'BLOCKCHAIN',
      recoveryActions: [],
      requiresUserAction: false
    })
  }
}));

vi.mock('../utils/TransactionExperience.js', () => ({
  transactionExperienceManager: {
    prepareTransaction: vi.fn().mockReturnValue({}),
    executeWithExperience: vi.fn().mockResolvedValue({ success: true }),
    emitTransactionEvent: vi.fn()
  }
}));

// NOW we can import BlockchainAdapter - it will use all the mocked services
import { BlockchainAdapter } from '../BlockchainAdapter.js';

describe('BlockchainAdapter Fallback Retry System', () => {
  let adapter;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    // Create the adapter - constructor will use mocked services (no real initialization)
    adapter = new BlockchainAdapter(null);

    // Mock saveToBlockchain to control the retry behavior in tests
    adapter.saveToBlockchain = vi.fn().mockResolvedValue({ success: true });
  });

  describe('retryFallbackSave()', () => {
    it('should use cached fallback data, not current sheet', async () => {
      const fallbackData = {
        title: 'Offline Edit',
        cells: { 'A1': 'value1', 'B2': 'value2' },
        metadata: { lastEdit: Date.now() }
      };

      localStorage.setItem('walsheetz_fallback_123', JSON.stringify(fallbackData));

      await adapter.retryFallbackSave('walsheetz_fallback_123');

      // VERIFY: saveToBlockchain called with cached data (CRITICAL FIX #2)
      expect(adapter.saveToBlockchain).toHaveBeenCalledWith(
        fallbackData,
        { epochs: 50 }
      );
    });

    it('should delete fallback key on success', async () => {
      const fallbackData = { title: 'Test', cells: {} };
      localStorage.setItem('walsheetz_fallback_456', JSON.stringify(fallbackData));

      await adapter.retryFallbackSave('walsheetz_fallback_456');

      expect(localStorage.getItem('walsheetz_fallback_456')).toBeNull();
    });

    it('should keep fallback key on failure', async () => {
      adapter.saveToBlockchain.mockResolvedValueOnce({ success: false, error: 'Network error' });
      const fallbackData = { title: 'Test', cells: {} };
      localStorage.setItem('walsheetz_fallback_789', JSON.stringify(fallbackData));

      await adapter.retryFallbackSave('walsheetz_fallback_789');

      expect(localStorage.getItem('walsheetz_fallback_789')).toBe(JSON.stringify(fallbackData));
    });

    it('should return success object on success', async () => {
      const fallbackData = { title: 'Test', cells: {} };
      localStorage.setItem('walsheetz_fallback_abc', JSON.stringify(fallbackData));

      const result = await adapter.retryFallbackSave('walsheetz_fallback_abc');

      expect(result).toEqual({
        success: true,
        localKey: 'walsheetz_fallback_abc',
        message: 'Fallback save synced to blockchain'
      });
    });
  });

  describe('autoRetryFallbacksOnStartup()', () => {
    it('should wait for wallet connection before retrying', async () => {
      // CRITICAL FIX #1: Test that wallet gating works
      // If wallet is connected, fallback saves should be retried
      const fallbackData = { title: 'Test', cells: {} };
      localStorage.setItem('walsheetz_fallback_001', JSON.stringify(fallbackData));

      // Mock wallet connection by setting walletManager.isConnected to true
      adapter.walletManager.isConnected = true;

      // Call the retry method - it will poll and retry since wallet is connected
      await adapter.autoRetryFallbacksOnStartup();

      // Should have attempted retry (saveToBlockchain should have been called)
      expect(adapter.saveToBlockchain).toHaveBeenCalled();
    }, { timeout: 15000 });

    it('should skip retry if wallet never connects (timeout)', async () => {
      const fallbackData = { title: 'Test', cells: {} };
      localStorage.setItem('walsheetz_fallback_timeout', JSON.stringify(fallbackData));

      // Mock wallet as disconnected
      adapter.walletManager.isConnected = false;

      vi.useFakeTimers();

      try {
        const retryPromise = adapter.autoRetryFallbacksOnStartup();

        // Fast-forward full timeout (50 attempts * 100ms = 5000ms)
        await vi.advanceTimersByTimeAsync(6000);

        // Now wait for the promise with real timers
        vi.useRealTimers();
        await retryPromise;
      } catch (err) {
        // Ignore timeout errors - we expect the method to timeout
        vi.useRealTimers();
      }

      // Fallback should still be there (no retry attempted since wallet never connected)
      expect(localStorage.getItem('walsheetz_fallback_timeout')).toBe(JSON.stringify(fallbackData));
      expect(adapter.saveToBlockchain).not.toHaveBeenCalled();
    }, { timeout: 15000 });

    it('should retry all fallback keys when wallet connected', async () => {
      const fallback1 = { title: 'Edit 1', cells: {} };
      const fallback2 = { title: 'Edit 2', cells: {} };

      localStorage.setItem('walsheetz_fallback_001', JSON.stringify(fallback1));
      localStorage.setItem('walsheetz_fallback_002', JSON.stringify(fallback2));

      // Mock wallet as connected
      adapter.walletManager.isConnected = true;

      // Simplified: Just call the method directly
      // The adapter's polling will find the fallbacks in localStorage
      const result = await adapter.autoRetryFallbacksOnStartup();

      // Both should be retried
      expect(adapter.saveToBlockchain).toHaveBeenCalledTimes(2);
    }, { timeout: 15000 });
  });

  describe('checkStaleFallbacks()', () => {
    // Note: Use real timestamps for stale detection testing (age calculation)
    // since fake timers can cause unexpected behavior with Date.now()

    it('should detect fallbacks older than 7 days', () => {
      const now = Date.now();
      const eightDaysAgoTimestamp = now - (8 * 24 * 60 * 60 * 1000);
      const threeDaysAgoTimestamp = now - (3 * 24 * 60 * 60 * 1000);

      // Store with timestamps in the KEY (format: walsheetz_fallback_TIMESTAMP)
      // checkStaleFallbacks extracts timestamp from key name
      const oldData = { title: 'Old', cells: {} };
      const recentData = { title: 'Recent', cells: {} };

      localStorage.setItem(`walsheetz_fallback_${eightDaysAgoTimestamp}`, JSON.stringify(oldData));
      localStorage.setItem(`walsheetz_fallback_${threeDaysAgoTimestamp}`, JSON.stringify(recentData));

      // Check with real time
      const staleList = adapter.checkStaleFallbacks(7);

      // Verify we found exactly the old entry
      expect(staleList.length).toBe(1);
      expect(staleList[0].key).toBe(`walsheetz_fallback_${eightDaysAgoTimestamp}`);
      expect(staleList[0].ageDays).toBeGreaterThanOrEqual(7);
    });

    it('should not include recent fallbacks', () => {
      const now = Date.now();
      const recentTimestamp = now - (3 * 24 * 60 * 60 * 1000);
      localStorage.setItem(`walsheetz_fallback_${recentTimestamp}`, JSON.stringify({
        title: 'Recent',
        cells: {}
      }));

      const staleList = adapter.checkStaleFallbacks(7);

      expect(staleList).toHaveLength(0);
    });
  });

  describe('deleteStaleFallbacks()', () => {
    it('should delete specified fallback keys', () => {
      localStorage.setItem('walsheetz_fallback_111', JSON.stringify({ data: 'a' }));
      localStorage.setItem('walsheetz_fallback_222', JSON.stringify({ data: 'b' }));

      const result = adapter.deleteStaleFallbacks(['walsheetz_fallback_111']);

      expect(result.deletedCount).toBe(1);
      expect(localStorage.getItem('walsheetz_fallback_111')).toBeNull();
      expect(localStorage.getItem('walsheetz_fallback_222')).not.toBeNull();
    });
  });

  describe('exportFallbackAsJSON()', () => {
    it('should export fallback as properly formatted JSON', () => {
      const fallbackData = { title: 'Test Sheet', cells: { 'A1': 'value' } };
      localStorage.setItem('walsheetz_fallback_export_test', JSON.stringify(fallbackData));

      const json = adapter.exportFallbackAsJSON('walsheetz_fallback_export_test');

      expect(json).toBeDefined();
      const parsed = JSON.parse(json);
      expect(parsed.data).toEqual(fallbackData);
      expect(parsed.originalKey).toBe('walsheetz_fallback_export_test');
      expect(parsed.exportedAt).toBeDefined();
    });

    it('should return null if fallback not found', () => {
      const json = adapter.exportFallbackAsJSON('walsheetz_fallback_nonexistent');

      expect(json).toBeNull();
    });
  });
});
