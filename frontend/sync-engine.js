// Sync engine for WalSheetz - handles auto-save and edit tracking
import { versionControl, trackCellChange, saveVersion } from '../blockchain/version-control.js';
import { walletManager } from '../blockchain/wallet-manager.js';
import { getCurrentConfig } from '../blockchain/config.js';

class SyncEngine {
  constructor() {
    this.isInitialized = false;
    this.spreadsheetId = null;
    this.editCount = 0;
    this.lastSaveTime = Date.now();
    this.autoSaveTimer = null;
    this.isSaving = false;
    this.saveQueue = [];
    this.eventListeners = new Map();
    
    // Configuration
    this.config = getCurrentConfig().storage;
    this.autoSaveInterval = this.config.autoSaveInterval; // 5 seconds
    this.editThreshold = this.config.editThreshold; // 3 edits
    
    // Bind methods
    this.handleCellEdit = this.handleCellEdit.bind(this);
    this.performAutoSave = this.performAutoSave.bind(this);
  }

  // Initialize sync engine
  async initialize(spreadsheetId, title = 'Untitled Spreadsheet') {
    try {
      this.spreadsheetId = spreadsheetId;
      this.spreadsheetTitle = title;
      this.isInitialized = true;
      
      // Start auto-save timer
      this.startAutoSaveTimer();
      
      // Hook into Luckysheet events if available
      this.hookIntoLuckysheet();
      
      this.emit('initialized', {
        spreadsheetId,
        title,
        autoSaveInterval: this.autoSaveInterval,
        editThreshold: this.editThreshold
      });
      
      return { success: true };
    } catch (error) {
      console.error('Failed to initialize sync engine:', error);
      throw error;
    }
  }

  // Event handling
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Event listener error:', error);
        }
      });
    }
  }

  // Hook into Luckysheet cell change events
  hookIntoLuckysheet() {
    if (typeof window !== 'undefined' && window.luckysheet) {
      // Hook into Luckysheet's cell update events
      const originalCellUpdate = window.luckysheet.getSheet;
      
      // Store reference to original method
      this.originalLuckysweetMethods = {
        cellUpdate: originalCellUpdate
      };

      // Override Luckysheet events if possible
      if (window.luckysheet.setCellValue) {
        const originalSetCellValue = window.luckysheet.setCellValue;
        window.luckysheet.setCellValue = (row, col, value, options = {}) => {
          // Get old value before change
          const oldValue = this.getCellValue(row, col);
          
          // Call original method
          const result = originalSetCellValue.call(window.luckysheet, row, col, value, options);
          
          // Track the change
          this.handleCellEdit(row, col, oldValue, value, options);
          
          return result;
        };
      }

      // Alternative: Listen for custom events if Luckysheet supports them
      if (window.luckysheet.setHook && typeof window.luckysheet.setHook === 'function') {
        window.luckysheet.setHook('cellEditBefore', (range, value) => {
          this.handleCellEditBefore(range, value);
        });
        
        window.luckysheet.setHook('cellEditEnd', (range, value) => {
          this.handleCellEditEnd(range, value);
        });
      }
      
      console.log('Hooked into Luckysheet events');
    } else {
      console.warn('Luckysheet not found, using manual tracking');
    }
  }

  // Get current cell value from Luckysheet
  getCellValue(row, col, sheetIndex = 0) {
    if (typeof window !== 'undefined' && window.luckysheet && window.luckysheet.getSheetData) {
      try {
        const sheetData = window.luckysheet.getSheetData();
        if (sheetData && sheetData[row] && sheetData[row][col]) {
          return sheetData[row][col].v;
        }
      } catch (error) {
        console.warn('Failed to get cell value from Luckysheet:', error);
      }
    }
    return null;
  }

  // Handle cell edit events
  handleCellEdit(row, col, oldValue, newValue, metadata = {}) {
    if (!this.isInitialized) {
      console.warn('Sync engine not initialized');
      return;
    }

    try {
      // Track the change in version control
      const version = trackCellChange(row, col, oldValue, newValue, {
        sheetId: metadata.sheetId || 0,
        author: walletManager.getWalletInfo().address || 'anonymous',
        timestamp: Date.now(),
        formula: metadata.formula,
        style: metadata.style
      });

      // Increment edit count
      this.editCount++;
      
      this.emit('cellChanged', {
        row,
        col,
        oldValue,
        newValue,
        editCount: this.editCount,
        version: version.id
      });

      // Check if we should trigger auto-save based on edit threshold
      if (this.editCount >= this.editThreshold) {
        this.triggerSave('edit_threshold');
      }

    } catch (error) {
      console.error('Failed to handle cell edit:', error);
      this.emit('error', { type: 'cell_edit', error: error.message });
    }
  }

  // Handle cell edit before event (for preparation)
  handleCellEditBefore(range, value) {
    // Prepare for edit if needed
    this.emit('editStarted', { range, value });
  }

  // Handle cell edit end event (when user presses Enter)
  handleCellEditEnd(range, value) {
    if (range && range.length > 0) {
      const cell = range[0];
      const oldValue = this.getCellValue(cell.row, cell.column);
      this.handleCellEdit(cell.row, cell.column, oldValue, value);
    }
  }

  // Manual cell edit tracking (for when Luckysheet hooks aren't available)
  trackManualEdit(row, col, oldValue, newValue, metadata = {}) {
    this.handleCellEdit(row, col, oldValue, newValue, metadata);
  }

  // Start auto-save timer
  startAutoSaveTimer() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(() => {
      this.checkAutoSave();
    }, 1000); // Check every second

    console.log(`Auto-save timer started (${this.autoSaveInterval / 1000}s interval)`);
  }

  // Stop auto-save timer
  stopAutoSaveTimer() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // Check if auto-save should be triggered
  checkAutoSave() {
    if (!this.isInitialized || this.isSaving) {
      return;
    }

    const timeSinceLastSave = Date.now() - this.lastSaveTime;
    const hasChanges = this.editCount > 0;

    // Auto-save every 5 seconds if there are changes
    if (hasChanges && timeSinceLastSave >= this.autoSaveInterval) {
      this.triggerSave('auto_save_timer');
    }
  }

  // Trigger save operation
  async triggerSave(reason = 'manual') {
    if (!this.isInitialized) {
      throw new Error('Sync engine not initialized');
    }

    if (!walletManager.isConnected) {
      this.emit('saveSkipped', { 
        reason: 'wallet_not_connected',
        editCount: this.editCount 
      });
      return { success: false, reason: 'wallet_not_connected' };
    }

    if (this.isSaving) {
      // Add to queue if already saving
      return new Promise((resolve) => {
        this.saveQueue.push({ resolve, reason });
      });
    }

    try {
      this.isSaving = true;
      
      this.emit('saveStarted', {
        reason,
        editCount: this.editCount,
        timeSinceLastSave: Date.now() - this.lastSaveTime
      });

      // Perform the save
      const result = await saveVersion(
        this.spreadsheetId,
        this.spreadsheetTitle,
        { force: reason === 'manual' }
      );

      if (result.success) {
        // Reset counters
        this.editCount = 0;
        this.lastSaveTime = Date.now();

        this.emit('saveCompleted', {
          reason,
          version: result.version,
          walrusBlobId: result.walrusBlobId,
          suiTransactionDigest: result.suiTransactionDigest,
          changeCount: result.changeCount
        });

        // Process queued saves
        this.processQueuedSaves();

        return result;
      } else {
        throw new Error(result.message || 'Save failed');
      }

    } catch (error) {
      console.error('Save operation failed:', error);
      
      this.emit('saveError', {
        reason,
        error: error.message,
        editCount: this.editCount
      });

      throw error;
    } finally {
      this.isSaving = false;
    }
  }

  // Process queued save operations
  async processQueuedSaves() {
    if (this.saveQueue.length === 0) {
      return;
    }

    const queuedSaves = [...this.saveQueue];
    this.saveQueue = [];

    // Resolve all queued saves with the same result
    const result = { success: true, reason: 'queued_save' };
    queuedSaves.forEach(({ resolve }) => resolve(result));
  }

  // Force save (manual save)
  async forceSave() {
    return await this.triggerSave('manual');
  }

  // Get current sync status
  getSyncStatus() {
    return {
      isInitialized: this.isInitialized,
      spreadsheetId: this.spreadsheetId,
      editCount: this.editCount,
      lastSaveTime: this.lastSaveTime,
      timeSinceLastSave: Date.now() - this.lastSaveTime,
      isSaving: this.isSaving,
      walletConnected: walletManager.isConnected,
      autoSaveEnabled: !!this.autoSaveTimer,
      queuedSaves: this.saveQueue.length
    };
  }

  // Update configuration
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.autoSaveInterval) {
      this.autoSaveInterval = newConfig.autoSaveInterval;
      this.startAutoSaveTimer(); // Restart with new interval
    }
    
    if (newConfig.editThreshold) {
      this.editThreshold = newConfig.editThreshold;
    }

    this.emit('configUpdated', this.config);
  }

  // Cleanup
  destroy() {
    this.stopAutoSaveTimer();
    
    // Restore original Luckysheet methods if they were overridden
    if (this.originalLuckysweetMethods && typeof window !== 'undefined' && window.luckysheet) {
      // Restore methods if needed
    }
    
    this.isInitialized = false;
    this.eventListeners.clear();
    
    this.emit('destroyed', {});
  }
}

// Create singleton instance
export const syncEngine = new SyncEngine();

// Convenience functions
export const initializeSync = (spreadsheetId, title) => syncEngine.initialize(spreadsheetId, title);
export const trackEdit = (row, col, oldValue, newValue, metadata) => syncEngine.trackManualEdit(row, col, oldValue, newValue, metadata);
export const forceSave = () => syncEngine.forceSave();
export const getSyncStatus = () => syncEngine.getSyncStatus();