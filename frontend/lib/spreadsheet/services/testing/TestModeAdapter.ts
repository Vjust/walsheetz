/**
 * Test Mode Blockchain Adapter
 *
 * Mock implementation of blockchain operations for test mode.
 * Uses localStorage/StorageAdapter for persistence without actual blockchain interaction.
 */

import { IBlockchainService } from '@dreamlit/walrus-sui-core/blockchain-integration';

export class TestModeAdapter extends IBlockchainService {
  constructor(storageAdapter) {
    super();
    this.storage = storageAdapter;
    this.pendingEdits = [];
    this.syncStatus = {
      lastSync: null,
      pendingChanges: 0,
      isConnected: true, // Always "connected" in test mode
    };

    // Initialize test storage if needed
    this._initTestStorage();
  }

  /**
   * Initialize test-specific storage
   */
  _initTestStorage() {
    const testKey = 'walsheetz_test_spreadsheets';
    if (!localStorage.getItem(testKey)) {
      localStorage.setItem(testKey, JSON.stringify([]));
    }
  }

  /**
   * Get all test spreadsheets from localStorage
   */
  _getTestSpreadsheets() {
    const testKey = 'walsheetz_test_spreadsheets';
    const data = localStorage.getItem(testKey);
    return data ? JSON.parse(data) : [];
  }

  /**
   * Save test spreadsheets to localStorage
   */
  _saveTestSpreadsheets(spreadsheets) {
    const testKey = 'walsheetz_test_spreadsheets';
    localStorage.setItem(testKey, JSON.stringify(spreadsheets));
  }

  /**
   * Generate a fake object ID
   */
  _generateObjectId() {
    return `test-obj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a fake blob ID
   */
  _generateBlobId() {
    return `test-blob-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Connect to wallet (no-op in test mode)
   */
  async connectWallet() {
    console.log('TestModeAdapter: connectWallet (no-op)');
    return { success: true, wallet: 'Test Wallet', address: '0x1234...cdef' };
  }

  /**
   * Disconnect from wallet (no-op in test mode)
   */
  async disconnectWallet() {
    console.log('TestModeAdapter: disconnectWallet (no-op)');
  }

  /**
   * Track cell edit (store in memory)
   */
  trackCellEdit(row, col, oldValue, newValue) {
    this.pendingEdits.push({ row, col, oldValue, newValue, timestamp: Date.now() });
    this.syncStatus.pendingChanges = this.pendingEdits.length;
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    return this.syncStatus;
  }

  /**
   * Check if wallet is connected (always true in test mode)
   */
  isWalletConnected() {
    return true;
  }

  /**
   * Get wallet address (fake address)
   */
  getWalletAddress() {
    return '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  }

  /**
   * Get user's spreadsheets from test storage
   */
  async getUserSpreadsheets() {
    console.log('TestModeAdapter: getUserSpreadsheets');
    const spreadsheets = this._getTestSpreadsheets();

    return {
      success: true,
      spreadsheets: spreadsheets.map(s => ({
        objectId: s.objectId,
        title: s.title,
        owner: this.getWalletAddress(),
        created: s.created,
        last_modified: s.last_modified,
        version_count: s.versions?.length || 0,
        is_public: s.is_public || false
      }))
    };
  }

  /**
   * Load a spreadsheet from test storage
   */
  async loadSpreadsheet(spreadsheetId, onProgress = null) {
    console.log('TestModeAdapter: loadSpreadsheet', spreadsheetId);

    if (onProgress) onProgress('Loading from test storage...', 'Fetching spreadsheet data');

    const spreadsheets = this._getTestSpreadsheets();
    const spreadsheet = spreadsheets.find(s => s.objectId === spreadsheetId);

    if (!spreadsheet) {
      return {
        success: false,
        error: 'Spreadsheet not found in test storage'
      };
    }

    // Check if spreadsheet is empty (no versions)
    if (!spreadsheet.versions || spreadsheet.versions.length === 0) {
      if (onProgress) onProgress('Spreadsheet is empty', 'No versions found');

      return {
        success: true,
        data: {
          data: {
            cells: {},
            metadata: { title: spreadsheet.title }
          }
        },
        metadata: {
          isEmpty: true,
          spreadsheetId: spreadsheet.objectId,
          title: spreadsheet.title
        }
      };
    }

    // Get the latest version
    const latestVersion = spreadsheet.versions[spreadsheet.versions.length - 1];

    if (onProgress) onProgress('Loading version data...', 'Preparing spreadsheet');

    return {
      success: true,
      data: latestVersion.data,
      metadata: {
        spreadsheetId: spreadsheet.objectId,
        title: spreadsheet.title,
        version: {
          walrus_blob_id: latestVersion.walrus_blob_id,
          content_hash: latestVersion.content_hash,
          timestamp: latestVersion.timestamp
        }
      }
    };
  }

  /**
   * Create a new spreadsheet in test storage
   */
  async createNewSpreadsheetOptimized(title = 'Untitled Spreadsheet', initialData = null) {
    console.log('TestModeAdapter: createNewSpreadsheetOptimized', title);

    const spreadsheetId = this._generateObjectId();
    const blobId = this._generateBlobId();
    const now = Date.now();

    const newSpreadsheet = {
      objectId: spreadsheetId,
      title: title,
      owner: this.getWalletAddress(),
      created: now,
      last_modified: now,
      is_public: false,
      versions: []
    };

    // If initial data provided, create first version
    if (initialData) {
      newSpreadsheet.versions.push({
        walrus_blob_id: blobId,
        content_hash: `test-hash-${now}`,
        timestamp: now,
        description: 'Initial version',
        data: initialData
      });
    }

    // Save to test storage
    const spreadsheets = this._getTestSpreadsheets();
    spreadsheets.push(newSpreadsheet);
    this._saveTestSpreadsheets(spreadsheets);

    // Update storage adapter session
    if (this.storage) {
      this.storage.setCurrentSpreadsheetId(spreadsheetId);
      this.storage.setSpreadsheetTitle(title);
      if (blobId) {
        this.storage.setLastWalrusBlobId(blobId);
      }
    }

    return {
      success: true,
      spreadsheetId: spreadsheetId,
      title: title,
      walrusBlobId: blobId,
      data: initialData || { data: { cells: {}, metadata: { title } } },
      optimized: true,
      gasUsed: 0 // No gas in test mode
    };
  }

  /**
   * Save spreadsheet to test storage
   */
  async saveToBlockchain(data, options = {}) {
    console.log('TestModeAdapter: saveToBlockchain');

    const spreadsheetId = this.storage?.getCurrentSpreadsheetId();
    const title = options.title || this.storage?.getSpreadsheetTitle() || 'Untitled';

    // If no spreadsheet ID, create new one
    if (!spreadsheetId) {
      return await this.createNewSpreadsheetOptimized(title, data);
    }

    // Update existing spreadsheet
    const spreadsheets = this._getTestSpreadsheets();
    const spreadsheet = spreadsheets.find(s => s.objectId === spreadsheetId);

    if (!spreadsheet) {
      // Spreadsheet not found, create new one
      return await this.createNewSpreadsheetOptimized(title, data);
    }

    const blobId = this._generateBlobId();
    const now = Date.now();

    // Add new version
    const newVersion = {
      walrus_blob_id: blobId,
      content_hash: `test-hash-${now}`,
      timestamp: now,
      description: options.description || 'Updated version',
      data: data
    };

    spreadsheet.versions.push(newVersion);
    spreadsheet.last_modified = now;
    if (options.title) {
      spreadsheet.title = options.title;
    }

    this._saveTestSpreadsheets(spreadsheets);

    // Update storage adapter
    if (this.storage) {
      this.storage.setLastWalrusBlobId(blobId);
      if (options.title) {
        this.storage.setSpreadsheetTitle(options.title);
      }
    }

    // Clear pending edits
    this.pendingEdits = [];
    this.syncStatus.pendingChanges = 0;
    this.syncStatus.lastSync = now;

    return {
      success: true,
      spreadsheetId: spreadsheetId,
      walrusBlobId: blobId,
      transactionId: `test-tx-${now}`,
      message: 'Saved to test storage'
    };
  }

  /**
   * Delete spreadsheet from test storage
   */
  async deleteSpreadsheet(spreadsheetId) {
    console.log('TestModeAdapter: deleteSpreadsheet', spreadsheetId);

    const spreadsheets = this._getTestSpreadsheets();
    const index = spreadsheets.findIndex(s => s.objectId === spreadsheetId);

    if (index === -1) {
      return {
        success: false,
        error: 'Spreadsheet not found in test storage'
      };
    }

    const spreadsheet = spreadsheets[index];
    const versionCount = spreadsheet.versions?.length || 0;

    spreadsheets.splice(index, 1);
    this._saveTestSpreadsheets(spreadsheets);

    return {
      success: true,
      transactionDigest: `test-delete-${Date.now()}`,
      deletedVersionCount: versionCount,
      message: 'Deleted from test storage'
    };
  }

  /**
   * Rename spreadsheet in test storage
   */
  async renameSpreadsheet(spreadsheetId, newTitle) {
    console.log('TestModeAdapter: renameSpreadsheet', spreadsheetId, newTitle);

    const spreadsheets = this._getTestSpreadsheets();
    const spreadsheet = spreadsheets.find(s => s.objectId === spreadsheetId);

    if (!spreadsheet) {
      return {
        success: false,
        error: 'Spreadsheet not found in test storage'
      };
    }

    spreadsheet.title = newTitle;
    spreadsheet.last_modified = Date.now();
    this._saveTestSpreadsheets(spreadsheets);

    return {
      success: true,
      message: 'Renamed in test storage'
    };
  }

  /**
   * Make spreadsheet public (no-op in test mode)
   */
  async makeSpreadsheetPublic(spreadsheetId) {
    console.log('TestModeAdapter: makeSpreadsheetPublic', spreadsheetId);

    const spreadsheets = this._getTestSpreadsheets();
    const spreadsheet = spreadsheets.find(s => s.objectId === spreadsheetId);

    if (spreadsheet) {
      spreadsheet.is_public = true;
      this._saveTestSpreadsheets(spreadsheets);
    }

    return { success: true, message: 'Made public in test storage' };
  }

  /**
   * Make spreadsheet private (no-op in test mode)
   */
  async makeSpreadsheetPrivate(spreadsheetId) {
    console.log('TestModeAdapter: makeSpreadsheetPrivate', spreadsheetId);

    const spreadsheets = this._getTestSpreadsheets();
    const spreadsheet = spreadsheets.find(s => s.objectId === spreadsheetId);

    if (spreadsheet) {
      spreadsheet.is_public = false;
      this._saveTestSpreadsheets(spreadsheets);
    }

    return { success: true, message: 'Made private in test storage' };
  }

  /**
   * Transfer ownership (no-op in test mode)
   */
  async transferSpreadsheetOwnership(spreadsheetId, newOwnerAddress) {
    console.log('TestModeAdapter: transferSpreadsheetOwnership', spreadsheetId, newOwnerAddress);
    return { success: true, message: 'Transfer not supported in test mode' };
  }

  /**
   * Prune old versions (no-op in test mode)
   */
  async pruneSpreadsheetVersions(spreadsheetId, keepCount = 10) {
    console.log('TestModeAdapter: pruneSpreadsheetVersions', spreadsheetId, keepCount);

    const spreadsheets = this._getTestSpreadsheets();
    const spreadsheet = spreadsheets.find(s => s.objectId === spreadsheetId);

    if (spreadsheet && spreadsheet.versions && spreadsheet.versions.length > keepCount) {
      const pruned = spreadsheet.versions.length - keepCount;
      spreadsheet.versions = spreadsheet.versions.slice(-keepCount);
      this._saveTestSpreadsheets(spreadsheets);

      return { success: true, prunedCount: pruned, message: 'Pruned in test storage' };
    }

    return { success: true, prunedCount: 0, message: 'Nothing to prune' };
  }

  /**
   * Clear pending edits
   */
  clearPendingEdits() {
    this.pendingEdits = [];
    this.syncStatus.pendingChanges = 0;
  }

  /**
   * Get pending edits
   */
  getPendingEdits() {
    return this.pendingEdits;
  }

  /**
   * Clear all test data (useful for test cleanup)
   */
  clearAllTestData() {
    console.log('TestModeAdapter: clearing all test data');
    const testKey = 'walsheetz_test_spreadsheets';
    localStorage.removeItem(testKey);
    this._initTestStorage();
    this.pendingEdits = [];
    this.syncStatus.pendingChanges = 0;
  }
}
