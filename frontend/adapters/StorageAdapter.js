import { IStorageService } from '../interfaces/IStorageService.js';

/**
 * Storage service adapter implementing IStorageService
 */
export class StorageAdapter extends IStorageService {
  constructor() {
    super();
    this.storageKey = 'walsheetz_data';
    this.historyKey = 'walsheetz_history';
    this.sessionKey = 'walsheetz_session';
    this.maxHistoryEntries = 100;
  }

  async saveData(data) {
    const saveId = `storage-save-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      console.log(`[StorageAdapter:${saveId}] 💾 Starting data save`, {
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

      // Save to localStorage
      const localStorageStart = Date.now();
      localStorage.setItem(this.storageKey, JSON.stringify(saveData));
      const localStorageDuration = Date.now() - localStorageStart;
      
      console.log(`[StorageAdapter:${saveId}] 📝 Local storage write complete`, {
        duration: `${localStorageDuration}ms`,
        storageKey: this.storageKey,
        dataSize: JSON.stringify(saveData).length
      });
      
      // Update history
      const historyStart = Date.now();
      await this.updateHistory(saveData);
      const historyDuration = Date.now() - historyStart;

      const totalDuration = Date.now() - startTime;
      console.log(`[StorageAdapter:${saveId}] ✅ Data saved successfully`, {
        totalDuration: `${totalDuration}ms`,
        localStorageTime: `${localStorageDuration}ms`,
        historyUpdateTime: `${historyDuration}ms`,
        version: saveData.version
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
      console.log(`[StorageAdapter:${loadId}] 📂 Starting data load`, {
        storageKey: this.storageKey,
        timestamp: new Date().toISOString()
      });
      
      const fetchStart = Date.now();
      const stored = localStorage.getItem(this.storageKey);
      const fetchDuration = Date.now() - fetchStart;
      
      if (!stored) {
        console.log(`[StorageAdapter:${loadId}] 📭 No stored data found, returning default`, {
          fetchDuration: `${fetchDuration}ms`
        });
        // Return default empty spreadsheet data
        return this.getDefaultData();
      }

      const parseStart = Date.now();
      const data = JSON.parse(stored);
      const parseDuration = Date.now() - parseStart;
      
      const totalDuration = Date.now() - startTime;
      console.log(`[StorageAdapter:${loadId}] ✅ Data loaded from localStorage`, {
        totalDuration: `${totalDuration}ms`,
        fetchTime: `${fetchDuration}ms`,
        parseTime: `${parseDuration}ms`,
        dataSize: stored.length,
        cellCount: data?.celldata?.length || 0,
        version: data?.version,
        savedAt: data?.savedAt ? new Date(data.savedAt).toISOString() : 'unknown'
      });
      
      return data;
    } catch (error) {
      console.error('Failed to load data:', error);
      
      // Return default data on error
      return this.getDefaultData();
    }
  }

  getCellHistory(row, col) {
    try {
      const historyData = localStorage.getItem(this.historyKey);
      
      if (!historyData) {
        return [];
      }

      const history = JSON.parse(historyData);
      const cellKey = `${row}-${col}`;
      
      return history[cellKey] || [];
    } catch (error) {
      console.error('Failed to get cell history:', error);
      return [];
    }
  }

  async clearData() {
    try {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem(this.historyKey);
      console.log('All data cleared from localStorage');
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw error;
    }
  }

  async updateHistory(data) {
    try {
      let history = {};
      
      const existingHistory = localStorage.getItem(this.historyKey);
      if (existingHistory) {
        history = JSON.parse(existingHistory);
      }

      // Add current save to history if it contains edits
      if (data.edits && Array.isArray(data.edits)) {
        data.edits.forEach(edit => {
          const cellKey = `${edit.row}-${edit.col}`;
          
          if (!history[cellKey]) {
            history[cellKey] = [];
          }
          
          history[cellKey].push({
            oldValue: edit.oldValue,
            newValue: edit.newValue,
            timestamp: edit.timestamp,
            version: data.version
          });

          // Limit history entries per cell
          if (history[cellKey].length > this.maxHistoryEntries) {
            history[cellKey] = history[cellKey].slice(-this.maxHistoryEntries);
          }
        });
      }

      localStorage.setItem(this.historyKey, JSON.stringify(history));
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
      const data = localStorage.getItem(this.storageKey);
      const history = localStorage.getItem(this.historyKey);
      
      return {
        hasData: !!data,
        dataSize: data ? data.length : 0,
        hasHistory: !!history,
        historySize: history ? history.length : 0,
        totalSize: (data?.length || 0) + (history?.length || 0)
      };
    } catch (error) {
      return {
        hasData: false,
        dataSize: 0,
        hasHistory: false,
        historySize: 0,
        totalSize: 0,
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      };
    }
  }

  // Session persistence methods for Walrus integration
  setCurrentSpreadsheetId(spreadsheetId) {
    try {
      const session = this.getSession();
      session.currentSpreadsheetId = spreadsheetId;
      session.lastUpdated = Date.now();
      localStorage.setItem(this.sessionKey, JSON.stringify(session));
      console.log('Current spreadsheet ID saved to session:', spreadsheetId);
    } catch (error) {
      console.error('Failed to save current spreadsheet ID:', error);
    }
  }

  getCurrentSpreadsheetId() {
    try {
      const session = this.getSession();
      return session.currentSpreadsheetId || null;
    } catch (error) {
      console.error('Failed to get current spreadsheet ID:', error);
      return null;
    }
  }

  setLastWalrusBlobId(blobId) {
    try {
      const session = this.getSession();
      session.lastWalrusBlobId = blobId;
      session.lastSaveTimestamp = Date.now();
      session.lastUpdated = Date.now();
      localStorage.setItem(this.sessionKey, JSON.stringify(session));
      console.log('Last Walrus blob ID saved to session:', blobId);
    } catch (error) {
      console.error('Failed to save Walrus blob ID:', error);
    }
  }

  getLastWalrusBlobId() {
    try {
      const session = this.getSession();
      return session.lastWalrusBlobId || null;
    } catch (error) {
      console.error('Failed to get Walrus blob ID:', error);
      return null;
    }
  }

  setSpreadsheetTitle(title) {
    try {
      const session = this.getSession();
      session.spreadsheetTitle = title;
      session.lastUpdated = Date.now();
      localStorage.setItem(this.sessionKey, JSON.stringify(session));
      console.log('Spreadsheet title saved to session:', title);
    } catch (error) {
      console.error('Failed to save spreadsheet title:', error);
    }
  }

  getSpreadsheetTitle() {
    try {
      const session = this.getSession();
      return session.spreadsheetTitle || 'Untitled Spreadsheet';
    } catch (error) {
      console.error('Failed to get spreadsheet title:', error);
      return 'Untitled Spreadsheet';
    }
  }

  setWalletAddress(address) {
    try {
      const session = this.getSession();
      session.walletAddress = address;
      session.lastUpdated = Date.now();
      localStorage.setItem(this.sessionKey, JSON.stringify(session));
      console.log('Wallet address saved to session:', address?.substring(0, 10) + '...');
    } catch (error) {
      console.error('Failed to save wallet address:', error);
    }
  }

  getWalletAddress() {
    try {
      const session = this.getSession();
      return session.walletAddress || null;
    } catch (error) {
      console.error('Failed to get wallet address:', error);
      return null;
    }
  }

  setAutoSaveEnabled(enabled) {
    try {
      const session = this.getSession();
      session.autoSaveEnabled = !!enabled;
      session.lastUpdated = Date.now();
      localStorage.setItem(this.sessionKey, JSON.stringify(session));
      console.log('Auto-save preference saved to session:', enabled);
    } catch (error) {
      console.error('Failed to save auto-save preference:', error);
    }
  }

  getAutoSaveEnabled() {
    try {
      const session = this.getSession();
      return session.autoSaveEnabled || false; // Default to disabled
    } catch (error) {
      console.error('Failed to get auto-save preference:', error);
      return false; // Default to disabled on error
    }
  }

  getSession() {
    try {
      const stored = localStorage.getItem(this.sessionKey);
      if (!stored) {
        return this.createEmptySession();
      }
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to parse session data, creating new session:', error);
      return this.createEmptySession();
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
      localStorage.removeItem(this.sessionKey);
      console.log('Session cleared');
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }

  hasValidSession() {
    try {
      const session = this.getSession();
      return !!(session.currentSpreadsheetId && session.walletAddress);
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

      // Check if session is too old (older than 7 days)
      const maxSessionAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
      if (sessionInfo.sessionAge > maxSessionAge) {
        console.warn('🧹 Session data too old, clearing:', {
          ageHours: Math.round(sessionInfo.sessionAge / (60 * 60 * 1000)),
          maxAgeHours: Math.round(maxSessionAge / (60 * 60 * 1000))
        });
        this.clearSession();
        return false;
      }

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
      const session = this.getSession();
      return {
        hasSpreadsheet: !!session.currentSpreadsheetId,
        hasWalrusBlobId: !!session.lastWalrusBlobId,
        hasWalletAddress: !!session.walletAddress,
        spreadsheetTitle: session.spreadsheetTitle,
        lastSaveTimestamp: session.lastSaveTimestamp,
        sessionAge: Date.now() - (session.lastUpdated || 0)
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
      const history = localStorage.getItem(this.historyKey);
      const session = this.getSession();
      
      return {
        spreadsheet: data,
        history: history ? JSON.parse(history) : {},
        session: session,
        exportedAt: Date.now()
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

      if (importedData.history) {
        localStorage.setItem(this.historyKey, JSON.stringify(importedData.history));
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      };
    }
  }

  // Walrus epoch preference management
  setWalrusEpochPreference(spreadsheetId, epochs) {
    try {
      if (!spreadsheetId) {
        console.warn('Cannot set Walrus epoch preference: no spreadsheet ID provided');
        return false;
      }

      const key = `walsheetz_epoch_pref_${spreadsheetId}`
      localStorage.setItem(key, epochs.toString())
      console.log(`Walrus epoch preference saved for spreadsheet ${spreadsheetId}:`, epochs)
      return true;
    } catch (error) {
      console.error('Failed to save Walrus epoch preference:', error)
      return false;
    }
  }

  getWalrusEpochPreference(spreadsheetId) {
    try {
      if (!spreadsheetId) {
        return null;
      }

      const key = `walsheetz_epoch_pref_${spreadsheetId}`
      const stored = localStorage.getItem(key)

      if (!stored) {
        return null;
      }

      return parseInt(stored);
    } catch (error) {
      console.error('Failed to get Walrus epoch preference:', error)
      return null;
    }
  }
}