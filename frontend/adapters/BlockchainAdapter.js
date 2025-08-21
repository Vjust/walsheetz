import { IBlockchainService } from '../interfaces/IBlockchainService.js';
import { walletManager } from '../../blockchain/wallet-manager.js';

/**
 * Blockchain service adapter implementing IBlockchainService
 */
export class BlockchainAdapter extends IBlockchainService {
  constructor() {
    super();
    this.walletManager = walletManager;
    this.editTracker = new Map();
    this.syncStatus = {
      lastSync: null,
      pendingChanges: 0,
      isConnected: false
    };
    
    // Listen to wallet events
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.walletManager.on('connected', (data) => {
      this.syncStatus.isConnected = true;
      console.log('Wallet connected:', data);
    });

    this.walletManager.on('disconnected', () => {
      this.syncStatus.isConnected = false;
      console.log('Wallet disconnected');
    });

    this.walletManager.on('error', (error) => {
      console.error('Wallet error:', error);
    });
  }

  async connectWallet() {
    try {
      const result = await this.walletManager.connect();
      
      if (result.success) {
        this.syncStatus.isConnected = true;
        return {
          success: true,
          wallet: result.wallet,
          address: result.address
        };
      } else {
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async disconnectWallet() {
    try {
      await this.walletManager.disconnect();
      this.syncStatus.isConnected = false;
      this.editTracker.clear();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  }

  async saveToBlockchain(data) {
    if (!this.isWalletConnected()) {
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }

    try {
      // Create a simplified transaction for the demo
      // In production, this would interact with Sui blockchain and Walrus storage
      const transactionData = {
        type: 'spreadsheet_save',
        data: JSON.stringify(data),
        timestamp: Date.now(),
        version: data.version || this.generateVersion()
      };

      // For now, simulate blockchain save
      console.log('Saving to blockchain:', transactionData);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update sync status
      this.syncStatus.lastSync = Date.now();
      this.syncStatus.pendingChanges = 0;
      this.editTracker.clear();

      const mockTransactionId = `0x${Math.random().toString(16).substr(2, 8)}`;
      
      return {
        success: true,
        transactionId: mockTransactionId,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  trackCellEdit(row, col, oldValue, newValue) {
    const cellKey = `${row}-${col}`;
    const edit = {
      row,
      col,
      oldValue,
      newValue,
      timestamp: Date.now()
    };

    this.editTracker.set(cellKey, edit);
    this.syncStatus.pendingChanges = this.editTracker.size;

    console.log(`Tracked edit: ${cellKey} = ${newValue}`);
  }

  getSyncStatus() {
    return {
      ...this.syncStatus,
      pendingEdits: Array.from(this.editTracker.values())
    };
  }

  isWalletConnected() {
    return this.walletManager.isConnected;
  }

  getWalletAddress() {
    const walletInfo = this.walletManager.getWalletInfo();
    return walletInfo.address;
  }

  getWalletInfo() {
    return this.walletManager.getWalletInfo();
  }

  generateVersion() {
    return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Additional helper methods for React integration
  async autoReconnect() {
    try {
      const reconnected = await this.walletManager.autoReconnect();
      if (reconnected) {
        this.syncStatus.isConnected = true;
      }
      return reconnected;
    } catch (error) {
      console.error('Auto-reconnect failed:', error);
      return false;
    }
  }

  getPendingEdits() {
    return Array.from(this.editTracker.values());
  }

  clearPendingEdits() {
    this.editTracker.clear();
    this.syncStatus.pendingChanges = 0;
  }
}