import { IStorageService } from '../interfaces/IStorageService.js';

/**
 * Storage service adapter implementing IStorageService
 *
 * RAM-ONLY MODE: All data is stored in memory only for the current session.
 * No data persists to browser storage (localStorage/sessionStorage/IndexedDB).
 * All spreadsheet data MUST be saved to Walrus + Sui blockchain.
 *
 * WARNING: Data will be lost on page refresh unless explicitly saved to blockchain first.
 */
export class StorageAdapter extends IStorageService {
  constructor() {
    super();

    // In-memory storage maps (session-scoped)
    this._data = null;           // Current spreadsheet data
    this._history = {};          // Cell change history by address
    this._session = this.createEmptySession();
    this.maxHistoryEntries = 100;

    console.log('💾 RAM-Only Storage Adapter initialized - Walrus is the single source of truth');
  }

  async saveData(data) {
    const saveId = `storage-save-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      console.log(`[StorageAdapter:${saveId}] 💾 Starting RAM save`, {
        dataSize: JSON.stringify(data).length,
        hasCelldata: !!data?.celldata,
        cellCount: data?.celldata?.length || 0,
        timestamp: new Date().toISOString()
      });

      const saveData = {
        ...data,
        savedAt: Date.now(),
        version: data.version || this.generateVersion()
      };

      // Store in memory only
      const memStart = Date.now();
      this._data = saveData;
      const memDuration = Date.now() - memStart;

      console.log(`[StorageAdapter:${saveId}] 📝 RAM save complete`, {
        duration: `${memDuration}ms`,
        dataSize: JSON.stringify(saveData).length
      });

      // Update history
      const historyStart = Date.now();
      await this.updateHistory(saveData);
      const historyDuration = Date.now() - historyStart;

      const totalDuration = Date.now() - startTime;
      console.log(`[StorageAdapter:${saveId}] ✅ Data saved to RAM`, {
        totalDuration: `${totalDuration}ms`,
        memoryTime: `${memDuration}ms`,
        historyUpdateTime: `${historyDuration}ms`,
        version: saveData.version,
        warning: '⚠️  Data exists in memory only. Must save to blockchain to persist.'
      });

      return { success: true, duration: totalDuration };
    } catch (error) {
      console.error('Failed to save data:', error);
      return {
        success: false,
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      };
    }
  }

  async loadData() {
    const loadId = `storage-load-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      console.log(`[StorageAdapter:${loadId}] 📂 Starting RAM load`, {
        timestamp: new Date().toISOString()
      });

      const fetchStart = Date.now();
      const data = this._data;
      const fetchDuration = Date.now() - fetchStart;

      if (!data) {
        console.log(`[StorageAdapter:${loadId}] 📭 No data in memory, returning default`, {
          fetchDuration: `${fetchDuration}ms`,
          note: 'This is expected on first load or after refresh. Load from blockchain if available.'
        });
        return this.getDefaultData();
      }

      const totalDuration = Date.now() - startTime;
      console.log(`[StorageAdapter:${loadId}] ✅ Data loaded from RAM`, {
        totalDuration: `${totalDuration}ms`,
        fetchTime: `${fetchDuration}ms`,
        dataSize: JSON.stringify(data).length,
        cellCount: data?.celldata?.length || 0,
        version: data?.version,
        savedAt: data?.savedAt ? new Date(data.savedAt).toISOString() : 'unknown'
      });

      return data;
    } catch (error) {
      console.error('Failed to load data:', error);
      return this.getDefaultData();
    }
  }

  getCellHistory(row, col) {
    try {
      const cellKey = `${row}-${col}`;
      return this._history[cellKey] || [];
    } catch (error) {
      console.error('Failed to get cell history:', error);
      return [];
    }
  }

  async clearData() {
    try {
      this._data = null;
      this._history = {};
      console.log('All data cleared from RAM');
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw error;
    }
  }

  async updateHistory(data) {
    try {
      // Add current save to history if it contains edits
      if (data.edits && Array.isArray(data.edits)) {
        data.edits.forEach(edit => {
          const cellKey = `${edit.row}-${edit.col}`;

          if (!this._history[cellKey]) {
            this._history[cellKey] = [];
          }

          this._history[cellKey].push({
            oldValue: edit.oldValue,
            newValue: edit.newValue,
            timestamp: edit.timestamp,
            version: data.version
          });

          // Limit history entries per cell
          if (this._history[cellKey].length > this.maxHistoryEntries) {
            this._history[cellKey] = this._history[cellKey].slice(-this.maxHistoryEntries);
          }
        });
      }
    } catch (error) {
      console.error('Failed to update history:', error);
    }
  }

  getDefaultData() {
    return {
      version: this.generateVersion(),
      createdAt: Date.now(),
      savedAt: Date.now(),
      edits: [],
      metadata: {
        title: 'New Spreadsheet',
        rows: 20,
        cols: 10
      }
    };
  }

  generateVersion() {
    return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Additional utility methods
  getStorageInfo() {
    try {
      const dataSize = this._data ? JSON.stringify(this._data).length : 0;
      const historySize = Object.keys(this._history).length;

      return {
        hasData: !!this._data,
        dataSize: dataSize,
        hasHistory: historySize > 0,
        historyEntries: historySize,
        totalSize: dataSize,
        storageType: 'RAM-only',
        note: 'All data is in memory. No browser persistence.'
      };
    } catch (error) {
      return {
        hasData: false,
        dataSize: 0,
        hasHistory: false,
        historyEntries: 0,
        totalSize: 0,
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      };
    }
  }

  // Session persistence methods for Walrus integration (RAM-only)
  setCurrentSpreadsheetId(spreadsheetId) {
    try {
      this._session.currentSpreadsheetId = spreadsheetId;
      this._session.lastUpdated = Date.now();
      console.log('Current spreadsheet ID saved to session:', spreadsheetId);
    } catch (error) {
      console.error('Failed to save current spreadsheet ID:', error);
    }
  }

  getCurrentSpreadsheetId() {
    try {
      return this._session.currentSpreadsheetId || null;
    } catch (error) {
      console.error('Failed to get current spreadsheet ID:', error);
      return null;
    }
  }

  setLastWalrusBlobId(blobId) {
    try {
      this._session.lastWalrusBlobId = blobId;
      this._session.lastSaveTimestamp = Date.now();
      this._session.lastUpdated = Date.now();
      console.log('Last Walrus blob ID saved to session:', blobId);
    } catch (error) {
      console.error('Failed to save Walrus blob ID:', error);
    }
  }

  getLastWalrusBlobId() {
    try {
      return this._session.lastWalrusBlobId || null;
    } catch (error) {
      console.error('Failed to get Walrus blob ID:', error);
      return null;
    }
  }

  setSpreadsheetTitle(title) {
    try {
      this._session.spreadsheetTitle = title;
      this._session.lastUpdated = Date.now();
      console.log('Spreadsheet title saved to session:', title);
    } catch (error) {
      console.error('Failed to save spreadsheet title:', error);
    }
  }

  getSpreadsheetTitle() {
    try {
      return this._session.spreadsheetTitle || 'Untitled Spreadsheet';
    } catch (error) {
      console.error('Failed to get spreadsheet title:', error);
      return 'Untitled Spreadsheet';
    }
  }

  setWalletAddress(address) {
    try {
      this._session.walletAddress = address;
      this._session.lastUpdated = Date.now();
      console.log('Wallet address saved to session:', address?.substring(0, 10) + '...');
    } catch (error) {
      console.error('Failed to save wallet address:', error);
    }
  }

  getWalletAddress() {
    try {
      return this._session.walletAddress || null;
    } catch (error) {
      console.error('Failed to get wallet address:', error);
      return null;
    }
  }

  setAutoSaveEnabled(enabled) {
    try {
      this._session.autoSaveEnabled = !!enabled;
      this._session.lastUpdated = Date.now();
      console.log('Auto-save preference saved to session:', enabled);
    } catch (error) {
      console.error('Failed to save auto-save preference:', error);
    }
  }

  getAutoSaveEnabled() {
    try {
      return this._session.autoSaveEnabled || false;
    } catch (error) {
      console.error('Failed to get auto-save preference:', error);
      return false;
    }
  }

  getSession() {
    return { ...this._session };
  }

  /**
   * Clear invalid spreadsheet session data when the spreadsheet doesn't exist on-chain
   */
  clearInvalidSpreadsheetSession() {
    try {
      console.log('[StorageAdapter] 🧹 Clearing invalid spreadsheet session data');
      this._session.currentSpreadsheetId = null;
      this._session.spreadsheetTitle = null;
      this._session.lastSaveTimestamp = null;
      this._session.lastWalrusBlobId = null;
      this._session.lastUpdated = Date.now();
      console.log('[StorageAdapter] ✅ Invalid spreadsheet session cleared');
      return true;
    } catch (error) {
      console.error('[StorageAdapter] ❌ Failed to clear invalid session:', error);
      return false;
    }
  }

  createEmptySession() {
    return {
      currentSpreadsheetId: null,
      lastWalrusBlobId: null,
      lastSaveTimestamp: null,
      walletAddress: null,
      spreadsheetTitle: null,
      autoSaveEnabled: false, // Auto-save is disabled by default
      lastUpdated: Date.now(),
      version: '1.0'
    };
  }

  clearSession() {
    try {
      this._session = this.createEmptySession();
      console.log('Session cleared and reset to defaults');
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }

  hasValidSession() {
    try {
      return !!(this._session.currentSpreadsheetId && this._session.walletAddress);
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate session data and clear if corrupted or too old
   */
  validateAndCleanSession() {
    try {
      const sessionInfo = this.getSessionInfo();

      // Check for error in session data
      if (sessionInfo.error) {
        console.warn('🧹 Session data corrupted, clearing:', sessionInfo.error);
        this.clearSession();
        return false;
      }

      // Check if session is too old (older than current page load - for RAM-only, max age is infinite)
      // RAM-only sessions live for the lifetime of the page, no age limit needed

      // Validate required fields
      if (sessionInfo.hasSpreadsheet && !sessionInfo.hasWalletAddress) {
        console.warn('🧹 Session data incomplete (has spreadsheet but no wallet), clearing');
        this.clearSession();
        return false;
      }

      return true;
    } catch (error) {
      console.warn('🧹 Error validating session, clearing:', typeof error === 'string' ? error : error.message || 'Unknown error');
      this.clearSession();
      return false;
    }
  }

  getSessionInfo() {
    try {
      return {
        hasSpreadsheet: !!this._session.currentSpreadsheetId,
        hasWalrusBlobId: !!this._session.lastWalrusBlobId,
        hasWalletAddress: !!this._session.walletAddress,
        spreadsheetTitle: this._session.spreadsheetTitle,
        lastSaveTimestamp: this._session.lastSaveTimestamp,
        sessionAge: Date.now() - (this._session.lastUpdated || 0),
        note: 'RAM-only session, no persistence across page reloads'
      };
    } catch (error) {
      return {
        hasSpreadsheet: false,
        hasWalrusBlobId: false,
        hasWalletAddress: false,
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      };
    }
  }

  async exportData() {
    try {
      const data = await this.loadData();
      const session = this.getSession();

      return {
        spreadsheet: data,
        history: { ...this._history },
        session: session,
        exportedAt: Date.now(),
        note: 'This is RAM-only data. Export for backup/testing purposes only.'
      };
    } catch (error) {
      throw new Error(`Failed to export data: ${typeof error === 'string' ? error : error.message || 'Unknown error'}`);
    }
  }

  async importData(importedData) {
    try {
      if (importedData.spreadsheet) {
        await this.saveData(importedData.spreadsheet);
      }

      if (importedData.history && typeof importedData.history === 'object') {
        this._history = { ...importedData.history };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      };
    }
  }

  // Walrus epoch preference management (RAM-only)
  setWalrusEpochPreference(spreadsheetId, epochs) {
    try {
      if (!spreadsheetId) {
        console.warn('Cannot set Walrus epoch preference: no spreadsheet ID provided');
        return false;
      }

      if (!this._session.epochPreferences) {
        this._session.epochPreferences = {};
      }

      this._session.epochPreferences[spreadsheetId] = epochs;
      console.log(`Walrus epoch preference saved for spreadsheet ${spreadsheetId}:`, epochs);
      return true;
    } catch (error) {
      console.error('Failed to save Walrus epoch preference:', error);
      return false;
    }
  }

  getWalrusEpochPreference(spreadsheetId) {
    try {
      if (!spreadsheetId) {
        return null;
      }

      if (!this._session.epochPreferences) {
        return null;
      }

      return this._session.epochPreferences[spreadsheetId] || null;
    } catch (error) {
      console.error('Failed to get Walrus epoch preference:', error);
      return null;
    }
  }

  /**
   * Store blob expiry information for tracking renewal status
   * @param {string} blobId - Walrus blob ID
   * @param {Object} expiryInfo - Expiry information {timestamp, epochs, endEpoch}
   * @returns {boolean} Success status
   */
  setWalrusBlobExpiry(blobId, expiryInfo) {
    try {
      if (!blobId) {
        console.warn('Cannot set blob expiry: no blob ID provided');
        return false;
      }

      if (!this._session.blobExpiry) {
        this._session.blobExpiry = {};
      }

      this._session.blobExpiry[blobId] = {
        ...expiryInfo,
        lastUpdated: Date.now()
      };

      console.log(`Blob expiry information stored for ${blobId}:`, this._session.blobExpiry[blobId]);
      return true;
    } catch (error) {
      console.error('Failed to store blob expiry information:', error);
      return false;
    }
  }

  /**
   * Get blob expiry information
   * @param {string} blobId - Walrus blob ID
   * @returns {Object|null} Expiry information or null
   */
  getWalrusBlobExpiry(blobId) {
    try {
      if (!blobId) {
        return null;
      }

      if (!this._session.blobExpiry) {
        return null;
      }

      return this._session.blobExpiry[blobId] || null;
    } catch (error) {
      console.error('Failed to get blob expiry information:', error);
      return null;
    }
  }

  /**
   * Get all tracked blob expiry information
   * @returns {Object} Map of blobId -> expiryInfo
   */
  getAllBlobExpiry() {
    try {
      return this._session.blobExpiry || {};
    } catch (error) {
      console.error('Failed to get all blob expiry information:', error);
      return {};
    }
  }

  /**
   * Check if blob is approaching expiry
   * @param {string} blobId - Walrus blob ID
   * @param {number} warningDays - Number of days before expiry to warn (default 7)
   * @returns {boolean} True if blob expiry is approaching
   */
  isBlobExpiryApproaching(blobId, warningDays = 7) {
    try {
      const expiryInfo = this.getWalrusBlobExpiry(blobId);
      if (!expiryInfo || !expiryInfo.timestamp) {
        return false;
      }

      const now = Date.now();
      const warningMs = warningDays * 86400000; // Convert to milliseconds
      const timeUntilExpiry = expiryInfo.timestamp - now;

      return timeUntilExpiry > 0 && timeUntilExpiry < warningMs;
    } catch (error) {
      console.error('Failed to check blob expiry status:', error);
      return false;
    }
  }
}