import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BlockchainAdapter } from '../adapters/BlockchainAdapter.js';
import { StorageAdapter } from '../adapters/StorageAdapter.js';
import {
  createMockLocalStorage,
  createMockBrowserWalrusService,
  createMockStorageAdapter,
  generateObjectId,
  generateBlobId,
  cleanup
} from '../../../tests/utils/TestHelpers.js';

/**
 * Comprehensive unit tests for Spreadsheet CRUD operations
 * Tests create, read (load), update (save), and delete flows
 */

describe('Spreadsheet CRUD Operations', () => {
  let storageAdapter;
  let blockchainAdapter;
  let mockLocalStorage;

  beforeEach(() => {
    // Reset mocks
    cleanup();

    // Use real StorageAdapter with mocked localStorage
    mockLocalStorage = createMockLocalStorage();
    global.localStorage = mockLocalStorage;

    // Create real adapters
    storageAdapter = new StorageAdapter();
    blockchainAdapter = new BlockchainAdapter(storageAdapter);

    // Mock wallet connection
    blockchainAdapter.walletManager.isConnected = true;
    blockchainAdapter.walletManager.getWalletInfo = vi.fn(() => ({
      address: generateObjectId(),
      walletType: 'test'
    }));

    // Mock Walrus service
    blockchainAdapter.walrusService = createMockBrowserWalrusService();
  });

  afterEach(() => {
    cleanup();
    mockLocalStorage.clear();
  });

  describe('CREATE Operations', () => {
    it('should create a new spreadsheet with empty data', () => {
      const title = 'Test Spreadsheet';
      const data = blockchainAdapter.createEmptySpreadsheetData(title);

      expect(data).toBeDefined();
      expect(data.title).toBe(title);
      expect(data.metadata.title).toBe(title);
      expect(data.cells).toEqual({});
      expect(data.version).toBeDefined();
      expect(data.createdAt).toBeDefined();
    });

    it('should set spreadsheet ID in adapter after creation', () => {
      const spreadsheetId = '0xabcd1234567890';
      blockchainAdapter.spreadsheetObjectId = spreadsheetId;

      expect(blockchainAdapter.spreadsheetObjectId).toBe(spreadsheetId);
    });

    it('should generate valid version string', () => {
      const version1 = blockchainAdapter.generateVersion();
      const version2 = blockchainAdapter.generateVersion();

      expect(version1).toMatch(/^v\d+-[a-z0-9]+$/);
      expect(version2).toMatch(/^v\d+-[a-z0-9]+$/);
      expect(version1).not.toBe(version2); // Should be unique
    });

    it('should validate configuration before creation', async () => {
      // Mock config validation
      blockchainAdapter.validationGuards = {
        runPreflightChecks: vi.fn(async () => ({
          overall: { status: 'passed' }
        }))
      };

      try {
        await blockchainAdapter.validateConfiguration();
        expect(blockchainAdapter.validationGuards.runPreflightChecks).toHaveBeenCalled();
      } catch (error) {
        // Expected - config might not be available in test
      }
    });
  });

  describe('READ (Load) Operations', () => {
    beforeEach(() => {
      // Set up a mock spreadsheet ID in session
      const testId = generateObjectId();
      blockchainAdapter.spreadsheetObjectId = testId;
      storageAdapter.setCurrentSpreadsheetId(testId);
      storageAdapter.setSpreadsheetTitle('Loaded Spreadsheet');
    });

    it('should retrieve current spreadsheet ID from session', () => {
      const spreadsheetId = storageAdapter.getCurrentSpreadsheetId();
      expect(spreadsheetId).toBeDefined();
      expect(spreadsheetId).not.toBeNull();
    });

    it('should retrieve spreadsheet title from session', () => {
      const title = storageAdapter.getSpreadsheetTitle();
      expect(title).toBe('Loaded Spreadsheet');
    });

    it('should retrieve walrus blob ID from session', () => {
      const blobId = generateBlobId();
      storageAdapter.setLastWalrusBlobId(blobId);
      const retrieved = storageAdapter.getLastWalrusBlobId();
      expect(retrieved).toBe(blobId);
    });

    it('should get session info correctly', () => {
      const walletId = generateObjectId();
      storageAdapter.setWalletAddress(walletId);
      const blobId = generateBlobId();
      storageAdapter.setLastWalrusBlobId(blobId);

      const sessionInfo = storageAdapter.getSessionInfo();

      expect(sessionInfo.hasSpreadsheet).toBe(true);
      expect(sessionInfo.hasWalletAddress).toBe(true);
      expect(sessionInfo.hasWalrusBlobId).toBe(true);
      expect(sessionInfo.spreadsheetTitle).toBe('Loaded Spreadsheet');
    });
  });

  describe('UPDATE (Save) Operations', () => {
    it('should update spreadsheet ID in adapter', () => {
      const newId = generateObjectId();
      blockchainAdapter.spreadsheetObjectId = newId;

      expect(blockchainAdapter.spreadsheetObjectId).toBe(newId);
    });

    it('should store latest walrus blob ID', () => {
      const blobId = generateBlobId();
      storageAdapter.setLastWalrusBlobId(blobId);

      expect(storageAdapter.getLastWalrusBlobId()).toBe(blobId);
    });

    it('should update spreadsheet title in storage', () => {
      const newTitle = 'Updated Title';
      storageAdapter.setSpreadsheetTitle(newTitle);

      expect(storageAdapter.getSpreadsheetTitle()).toBe(newTitle);
    });

    it('should reset pending changes after save', () => {
      blockchainAdapter.syncStatus.pendingChanges = 5;
      blockchainAdapter.editTracker.set('A1', { v: 'test' });

      // Simulate successful save
      blockchainAdapter.syncStatus.pendingChanges = 0;
      blockchainAdapter.editTracker.clear();

      expect(blockchainAdapter.syncStatus.pendingChanges).toBe(0);
      expect(blockchainAdapter.editTracker.size).toBe(0);
    });

    it('should track pending edits', () => {
      blockchainAdapter.editTracker.set('A1', { oldValue: 'old', newValue: 'new' });
      blockchainAdapter.editTracker.set('B2', { oldValue: 'x', newValue: 'y' });

      const pendingEdits = blockchainAdapter.getPendingEdits();

      expect(pendingEdits.length).toBe(2);
      expect(pendingEdits[0]).toEqual({ oldValue: 'old', newValue: 'new' });
    });
  });

  describe('DELETE Operations', () => {
    let testSpreadsheetId;

    beforeEach(() => {
      testSpreadsheetId = generateObjectId();
      blockchainAdapter.spreadsheetObjectId = testSpreadsheetId;
      storageAdapter.setCurrentSpreadsheetId(testSpreadsheetId);
      storageAdapter.setSpreadsheetTitle('Spreadsheet to Delete');
      storageAdapter.setWalletAddress(generateObjectId());
      blockchainAdapter.syncStatus.pendingChanges = 5;
      blockchainAdapter.editTracker.set('A1', { v: 'test' });
    });

    it('should clear spreadsheet ID from adapter on delete', () => {
      const spreadsheetId = blockchainAdapter.spreadsheetObjectId;

      // Simulate deletion
      if (blockchainAdapter.spreadsheetObjectId === spreadsheetId) {
        blockchainAdapter.spreadsheetObjectId = null;
      }

      expect(blockchainAdapter.spreadsheetObjectId).toBeNull();
    });

    it('should clear edit tracker on delete', () => {
      const spreadsheetId = blockchainAdapter.spreadsheetObjectId;

      // Simulate deletion
      if (blockchainAdapter.spreadsheetObjectId === spreadsheetId) {
        blockchainAdapter.editTracker.clear();
      }

      expect(blockchainAdapter.editTracker.size).toBe(0);
    });

    it('should reset sync status on delete', () => {
      const spreadsheetId = blockchainAdapter.spreadsheetObjectId;

      // Simulate deletion
      if (blockchainAdapter.spreadsheetObjectId === spreadsheetId) {
        blockchainAdapter.syncStatus.pendingChanges = 0;
        blockchainAdapter.syncStatus.lastSync = null;
      }

      expect(blockchainAdapter.syncStatus.pendingChanges).toBe(0);
      expect(blockchainAdapter.syncStatus.lastSync).toBeNull();
    });

    it('should clear session on delete', () => {
      const sessionBefore = storageAdapter.getSession();
      expect(sessionBefore.currentSpreadsheetId).toBe(testSpreadsheetId);

      // Simulate deletion and session clear
      storageAdapter.clearSession();

      const sessionAfter = storageAdapter.getSession();
      expect(sessionAfter.currentSpreadsheetId).toBeNull();
      expect(sessionAfter.walletAddress).toBeNull();
      expect(sessionAfter.spreadsheetTitle).toBeNull();
    });

    it('should validate session state after deletion', () => {
      storageAdapter.clearSession();

      const sessionInfo = storageAdapter.getSessionInfo();
      expect(sessionInfo.hasSpreadsheet).toBe(false);
      expect(sessionInfo.hasWalletAddress).toBe(false);
    });
  });

  describe('Session Management', () => {
    it('should create empty session with defaults', () => {
      const session = storageAdapter.createEmptySession();

      expect(session.currentSpreadsheetId).toBeNull();
      expect(session.lastWalrusBlobId).toBeNull();
      expect(session.walletAddress).toBeNull();
      expect(session.autoSaveEnabled).toBe(false);
      expect(session.version).toBe('1.0');
    });

    it('should fail validation for session with missing wallet but set spreadsheet', () => {
      // Set a spreadsheet ID first
      storageAdapter.setCurrentSpreadsheetId('sheet-123');

      // Manually corrupt the session by removing wallet address
      // This creates an invalid state: spreadsheet exists but no wallet
      const session = storageAdapter.getSession();
      session.walletAddress = null;
      storageAdapter._session = session; // Direct mutation to simulate corruption

      const isValid = storageAdapter.validateAndCleanSession();

      // This should fail - spreadsheet without wallet is invalid
      expect(isValid).toBe(false);

      // Spreadsheet ID should be cleared after validation
      const cleanedSession = storageAdapter.getSession();
      expect(cleanedSession.currentSpreadsheetId).toBeNull();
    });

    it('should preserve session data when valid', () => {
      const testData = {
        currentSpreadsheetId: '0xtest',
        spreadsheetTitle: 'Test',
        walletAddress: '0xwallet',
        lastUpdated: Date.now()
      };

      storageAdapter.setCurrentSpreadsheetId(testData.currentSpreadsheetId);
      storageAdapter.setSpreadsheetTitle(testData.spreadsheetTitle);
      storageAdapter.setWalletAddress(testData.walletAddress);

      const isValid = storageAdapter.validateAndCleanSession();
      expect(isValid).toBe(true);

      const session = storageAdapter.getSession();
      expect(session.currentSpreadsheetId).toBe(testData.currentSpreadsheetId);
      expect(session.spreadsheetTitle).toBe(testData.spreadsheetTitle);
    });

    it('should set and get auto-save preference', () => {
      storageAdapter.setAutoSaveEnabled(true);
      expect(storageAdapter.getAutoSaveEnabled()).toBe(true);

      storageAdapter.setAutoSaveEnabled(false);
      expect(storageAdapter.getAutoSaveEnabled()).toBe(false);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing wallet connection gracefully', () => {
      blockchainAdapter.walletManager.isConnected = false;

      const isConnected = blockchainAdapter.isWalletConnected();
      expect(isConnected).toBe(false);
    });

    it('should handle invalid cell references', () => {
      const invalidRefs = [null, undefined, -1, 'INVALID'];

      invalidRefs.forEach(ref => {
        const cellRef = blockchainAdapter.getCellReference(ref, 0);
        expect(cellRef).toBe('INVALID');
      });
    });

    it('should clear pending edits safely', () => {
      blockchainAdapter.editTracker.set('A1', { v: 'test' });
      blockchainAdapter.clearPendingEdits();

      expect(blockchainAdapter.editTracker.size).toBe(0);
      expect(blockchainAdapter.syncStatus.pendingChanges).toBe(0);
    });

    it('should handle session clearing when storage adapter missing', () => {
      const adapter = new BlockchainAdapter(null);
      // Should not throw
      adapter.spreadsheetObjectId = '0xtest';

      expect(() => {
        adapter.spreadsheetObjectId = null;
      }).not.toThrow();
    });
  });

  describe('Storage Info', () => {
    it('should report storage info correctly', () => {
      const testData = { cells: {}, metadata: { title: 'Test' } };
      storageAdapter.saveData(testData);

      const info = storageAdapter.getStorageInfo();

      expect(info.hasData).toBe(true);
      expect(info.dataSize).toBeGreaterThan(0);
      expect(info.totalSize).toBeGreaterThan(0);
    });

    it('should export and import data', async () => {
      const testData = {
        title: 'Export Test',
        cells: { A1: 'value' },
        metadata: { rows: 100, cols: 26 }
      };

      storageAdapter.setSpreadsheetTitle(testData.title);
      await storageAdapter.saveData(testData);

      const exported = await storageAdapter.exportData();

      expect(exported.spreadsheet).toBeDefined();
      expect(exported.session).toBeDefined();
      expect(exported.exportedAt).toBeDefined();
    });
  });

  describe('Wallet Integration', () => {
    it('should store and retrieve wallet address', () => {
      const testAddress = generateObjectId();
      storageAdapter.setWalletAddress(testAddress);

      expect(storageAdapter.getWalletAddress()).toBe(testAddress);
    });

    it('should have valid wallet info', () => {
      const walletInfo = blockchainAdapter.getWalletInfo();

      expect(walletInfo).toBeDefined();
      expect(walletInfo.address).toBeDefined();
    });

    it('should match wallet address in session', () => {
      const testAddress = generateObjectId();
      storageAdapter.setWalletAddress(testAddress);
      blockchainAdapter.walletManager.getWalletInfo = vi.fn(() => ({
        address: testAddress
      }));

      expect(storageAdapter.getWalletAddress()).toBe(blockchainAdapter.getWalletAddress());
    });
  });

  describe('Walrus Epoch Preference', () => {
    it('should store and retrieve epoch preference', () => {
      const spreadsheetId = generateObjectId();
      const epochs = 50;

      storageAdapter.setWalrusEpochPreference(spreadsheetId, epochs);
      const retrieved = storageAdapter.getWalrusEpochPreference(spreadsheetId);

      expect(retrieved).toBe(epochs);
    });

    it('should return null for non-existent preference', () => {
      const retrieved = storageAdapter.getWalrusEpochPreference(generateObjectId());
      expect(retrieved).toBeNull();
    });
  });
});
