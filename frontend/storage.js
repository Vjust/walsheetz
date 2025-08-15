// Enhanced storage management with blockchain integration
import { syncEngine, initializeSync, trackEdit, forceSave, getSyncStatus } from './sync-engine.js';
import { walletManager, connectWallet, disconnectWallet, getWalletInfo } from '../blockchain/wallet-manager.js';
import { versionControl, getCellHistory, restoreVersion, getVersionStats } from '../blockchain/version-control.js';
import { walrusService, getBatchStatus } from '../blockchain/walrus-service.js';

class BlockchainStorage {
  constructor() {
    this.isInitialized = false;
    this.currentSpreadsheetId = null;
    this.localStorageKey = 'walsheetz_data';
    this.backupData = new Map();
    
    // Event listeners
    this.setupEventListeners();
  }

  // Setup event listeners for blockchain services
  setupEventListeners() {
    // Wallet events
    walletManager.on('connected', (data) => {
      console.log('Wallet connected:', data);
      this.onWalletConnected(data);
    });

    walletManager.on('disconnected', () => {
      console.log('Wallet disconnected');
      this.onWalletDisconnected();
    });

    walletManager.on('error', (error) => {
      console.error('Wallet error:', error);
      this.showNotification('Wallet Error: ' + error, 'error');
    });

    // Sync engine events
    syncEngine.on('saveCompleted', (data) => {
      console.log('Save completed:', data);
      this.onSaveCompleted(data);
    });

    syncEngine.on('saveError', (data) => {
      console.error('Save error:', data);
      this.onSaveError(data);
    });

    syncEngine.on('cellChanged', (data) => {
      this.onCellChanged(data);
    });
  }

  // Initialize blockchain storage
  async initialize(spreadsheetId = null, title = 'WalSheetz Spreadsheet') {
    try {
      // Generate spreadsheet ID if not provided
      if (!spreadsheetId) {
        spreadsheetId = this.generateSpreadsheetId();
      }

      this.currentSpreadsheetId = spreadsheetId;
      
      // Initialize sync engine
      await initializeSync(spreadsheetId, title);
      
      // Try to auto-reconnect wallet
      await walletManager.autoReconnect();
      
      // Load any local backup data
      this.loadLocalBackup();
      
      this.isInitialized = true;
      
      console.log('Blockchain storage initialized:', {
        spreadsheetId,
        title,
        walletConnected: walletManager.isConnected
      });

      return { success: true, spreadsheetId };
    } catch (error) {
      console.error('Failed to initialize blockchain storage:', error);
      throw error;
    }
  }

  // Generate unique spreadsheet ID
  generateSpreadsheetId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Connect wallet
  async connectWallet(walletName = 'Sui Wallet') {
    try {
      const result = await connectWallet(walletName);
      
      if (result.success) {
        this.showNotification(`Connected to ${result.wallet}`, 'success');
        return result;
      } else {
        this.showNotification(`Connection failed: ${result.error}`, 'error');
        return result;
      }
    } catch (error) {
      console.error('Wallet connection failed:', error);
      this.showNotification('Wallet connection failed', 'error');
      throw error;
    }
  }

  // Disconnect wallet
  async disconnectWallet() {
    try {
      const result = await disconnectWallet();
      
      if (result.success) {
        this.showNotification('Wallet disconnected', 'info');
      }
      
      return result;
    } catch (error) {
      console.error('Wallet disconnection failed:', error);
      throw error;
    }
  }

  // Track cell edit (called when user makes changes)
  trackCellEdit(row, col, oldValue, newValue, metadata = {}) {
    if (!this.isInitialized) {
      console.warn('Storage not initialized');
      return;
    }

    try {
      // Create backup before change
      this.createLocalBackup(row, col, oldValue);
      
      // Track the edit
      trackEdit(row, col, oldValue, newValue, {
        ...metadata,
        timestamp: Date.now(),
        spreadsheetId: this.currentSpreadsheetId
      });

      console.log('Cell edit tracked:', { row, col, oldValue, newValue });
    } catch (error) {
      console.error('Failed to track cell edit:', error);
    }
  }

  // Force save to blockchain
  async save() {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized');
    }

    if (!walletManager.isConnected) {
      throw new Error('Wallet not connected');
    }

    try {
      const result = await forceSave();
      
      if (result.success) {
        this.showNotification('Saved to blockchain', 'success');
        // Clear local backup after successful save
        this.clearLocalBackup();
      }
      
      return result;
    } catch (error) {
      console.error('Save failed:', error);
      this.showNotification('Save failed: ' + error.message, 'error');
      throw error;
    }
  }

  // Get cell history
  getCellHistory(row, col, sheetId = 0) {
    return getCellHistory(row, col, sheetId);
  }

  // Restore version
  async restoreVersion(versionId, blobId) {
    try {
      const result = await restoreVersion(versionId, blobId);
      
      if (result.success) {
        this.showNotification('Version restored successfully', 'success');
        // Apply restored data to Luckysheet
        this.applyRestoredData(result.cells);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to restore version:', error);
      this.showNotification('Restore failed: ' + error.message, 'error');
      throw error;
    }
  }

  // Apply restored data to spreadsheet
  applyRestoredData(cells) {
    if (typeof window !== 'undefined' && window.luckysheet) {
      try {
        // Update Luckysheet with restored data
        for (const [cellKey, cellData] of Object.entries(cells)) {
          const [row, col] = cellKey.split('_').map(Number);
          
          // Use Luckysheet API to update cell
          if (window.luckysheet.setCellValue) {
            window.luckysheet.setCellValue(row, col, cellData.v, {
              formula: cellData.f,
              type: cellData.t,
              style: cellData.s
            });
          }
        }
        
        // Refresh the view
        if (window.luckysheet.refresh) {
          window.luckysheet.refresh();
        }
      } catch (error) {
        console.error('Failed to apply restored data:', error);
      }
    }
  }

  // Get storage status
  getStatus() {
    const walletInfo = getWalletInfo();
    const syncStatus = getSyncStatus();
    const batchStatus = getBatchStatus(this.currentSpreadsheetId);
    const versionStats = getVersionStats(this.currentSpreadsheetId);

    return {
      initialized: this.isInitialized,
      spreadsheetId: this.currentSpreadsheetId,
      wallet: {
        connected: walletInfo.isConnected,
        address: walletInfo.address,
        walletName: walletInfo.walletName
      },
      sync: syncStatus,
      batch: batchStatus,
      versions: versionStats,
      lastBackup: this.getLastBackupTime()
    };
  }

  // Local backup methods
  createLocalBackup(row, col, value) {
    const backupKey = `${row}_${col}`;
    const backup = {
      timestamp: Date.now(),
      value,
      spreadsheetId: this.currentSpreadsheetId
    };
    
    this.backupData.set(backupKey, backup);
    this.saveLocalBackup();
  }

  saveLocalBackup() {
    try {
      const backupArray = Array.from(this.backupData.entries());
      localStorage.setItem(this.localStorageKey, JSON.stringify(backupArray));
    } catch (error) {
      console.warn('Failed to save local backup:', error);
    }
  }

  loadLocalBackup() {
    try {
      const backupString = localStorage.getItem(this.localStorageKey);
      if (backupString) {
        const backupArray = JSON.parse(backupString);
        this.backupData = new Map(backupArray);
      }
    } catch (error) {
      console.warn('Failed to load local backup:', error);
    }
  }

  clearLocalBackup() {
    this.backupData.clear();
    localStorage.removeItem(this.localStorageKey);
  }

  getLastBackupTime() {
    let lastTime = 0;
    for (const backup of this.backupData.values()) {
      if (backup.timestamp > lastTime) {
        lastTime = backup.timestamp;
      }
    }
    return lastTime || null;
  }

  // Event handlers
  onWalletConnected(data) {
    if (typeof window !== 'undefined' && window.updateWalletUI) {
      window.updateWalletUI(data);
    }
  }

  onWalletDisconnected() {
    if (typeof window !== 'undefined' && window.updateWalletUI) {
      window.updateWalletUI(null);
    }
  }

  onSaveCompleted(data) {
    console.log('Save completed:', data);
    
    if (typeof window !== 'undefined' && window.updateSaveStatus) {
      window.updateSaveStatus('saved', data);
    }
  }

  onSaveError(data) {
    console.error('Save error:', data);
    
    if (typeof window !== 'undefined' && window.updateSaveStatus) {
      window.updateSaveStatus('error', data);
    }
  }

  onCellChanged(data) {
    if (typeof window !== 'undefined' && window.updateEditCounter) {
      window.updateEditCounter(data.editCount);
    }
  }

  // Show notification (can be overridden by UI)
  showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    if (typeof window !== 'undefined' && window.showNotification) {
      window.showNotification(message, type);
    }
  }

  // Cleanup
  destroy() {
    if (syncEngine) {
      syncEngine.destroy();
    }
    
    this.backupData.clear();
    this.isInitialized = false;
  }
}

// Create singleton instance
export const blockchainStorage = new BlockchainStorage();

// Initialize storage when module loads
if (typeof window !== 'undefined') {
  // Make storage available globally for debugging
  window.blockchainStorage = blockchainStorage;
  
  // Auto-initialize when page loads
  window.addEventListener('load', async () => {
    try {
      await blockchainStorage.initialize();
      console.log('Blockchain storage auto-initialized');
    } catch (error) {
      console.error('Auto-initialization failed:', error);
    }
  });
}

// Export convenience functions
export const initializeStorage = (spreadsheetId, title) => blockchainStorage.initialize(spreadsheetId, title);
export const connectToWallet = (walletName) => blockchainStorage.connectWallet(walletName);
export const saveToBlockchain = () => blockchainStorage.save();
export const getStorageStatus = () => blockchainStorage.getStatus();
