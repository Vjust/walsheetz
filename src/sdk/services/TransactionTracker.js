/**
 * Transaction Tracker Service
 * Tracks all Sui transactions related to the application
 */

import { EventBus } from "@/sdk/shared/utils/EventBus.js";
import { logger, LogComponent } from "@/sdk/shared/utils/Logger.js";

class TransactionTracker {
  constructor() {
    // Map of transactionDigest -> transaction data
    this.transactions = new Map();

    // Map of objectId -> related transaction digests
    this.objectTransactions = new Map();

    // Map of address -> related transaction digests
    this.addressTransactions = new Map();

    // Pending transactions (waiting for confirmation)
    this.pendingTransactions = new Set();

    // Storage keys
    this.storageKey = 'transaction_history';
    this.storageVersion = '1.0.0';

    // Transaction types
    this.txTypes = {
      BLOB_STORE: 'blob_store',
      BLOB_CERTIFY: 'blob_certify',
      SPREADSHEET_CREATE: 'spreadsheet_create',
      SPREADSHEET_UPDATE: 'spreadsheet_update',
      POA_RENEW: 'poa_renew',
      DEFI_EXECUTE: 'defi_execute',
      OTHER: 'other'
    };

    // Load from storage
    this.loadFromStorage();

    // Subscribe to events
    this.setupEventListeners();

    logger.info(LogComponent.BLOCKCHAIN, 'tx_tracker_init', 'TransactionTracker initialized', {
      transactionCount: this.transactions.size,
      pendingCount: this.pendingTransactions.size
    });
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Walrus blob events
    EventBus.on('walrus:blob:stored', (data) => {
      this.trackTransaction({
        type: this.txTypes.BLOB_STORE,
        status: 'pending',
        blobId: data.blobId,
        metadata: {
          range: data.range,
          size: data.size
        },
        timestamp: data.timestamp
      });
    });

    // PoA certification events
    EventBus.on('poa:certification:completed', (data) => {
      this.trackTransaction({
        type: this.txTypes.BLOB_CERTIFY,
        transactionDigest: data.transactionDigest,
        status: 'confirmed',
        blobId: data.blobId,
        timestamp: data.timestamp
      });
    });

    // Sui transaction events
    EventBus.on('sui:transaction:completed', (data) => {
      this.trackTransaction({
        type: data.txType || this.txTypes.OTHER,
        transactionDigest: data.transactionDigest,
        status: 'confirmed',
        metadata: {
          effects: data.effects,
          objectChanges: data.objectChanges
        },
        timestamp: data.timestamp
      });
    });

    EventBus.on('sui:transaction:failed', (data) => {
      this.trackTransaction({
        type: data.txType || this.txTypes.OTHER,
        status: 'failed',
        error: data.error,
        timestamp: data.timestamp
      });
    });

    // DeFi transaction events
    EventBus.on('defi:transaction:completed', (data) => {
      this.trackTransaction({
        type: this.txTypes.DEFI_EXECUTE,
        transactionDigest: data.transactionDigest,
        status: 'confirmed',
        metadata: {
          adapterId: data.adapterId,
          method: data.method,
          args: data.args,
          effects: data.effects,
          objectChanges: data.objectChanges
        },
        timestamp: data.timestamp
      });
    });

    EventBus.on('defi:transaction:failed', (data) => {
      this.trackTransaction({
        type: this.txTypes.DEFI_EXECUTE,
        status: 'failed',
        error: data.error,
        metadata: {
          adapterId: data.adapterId,
          method: data.method,
          args: data.args
        },
        timestamp: data.timestamp
      });
    });
  }

  /**
   * Track a transaction
   * @param {Object} txData - Transaction data
   * @returns {Object} Tracking result
   */
  trackTransaction(txData) {
    try {
      const {
        transactionDigest = null,
        type,
        status = 'pending',
        blobId = null,
        objectId = null,
        address = null,
        error = null,
        metadata = {},
        timestamp = Date.now()
      } = txData;

      // Generate ID for pending transactions without digest
      const txId = transactionDigest || `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      logger.debug(LogComponent.BLOCKCHAIN, 'tx_track', 'Tracking transaction', {
        txId,
        type,
        status
      });

      // Create transaction entry
      const transaction = {
        id: txId,
        transactionDigest,
        type,
        status,
        blobId,
        objectId,
        address,
        error,
        metadata,
        timestamp,
        updatedAt: timestamp
      };

      // Store transaction
      this.transactions.set(txId, transaction);

      // Track pending status
      if (status === 'pending' && !transactionDigest) {
        this.pendingTransactions.add(txId);
      } else if (status !== 'pending') {
        this.pendingTransactions.delete(txId);
      }

      // Index by object ID
      if (objectId) {
        if (!this.objectTransactions.has(objectId)) {
          this.objectTransactions.set(objectId, new Set());
        }
        this.objectTransactions.get(objectId).add(txId);
      }

      // Index by address
      if (address) {
        if (!this.addressTransactions.has(address)) {
          this.addressTransactions.set(address, new Set());
        }
        this.addressTransactions.get(address).add(txId);
      }

      // Save to storage
      this.saveToStorage();

      // Emit event
      EventBus.emit('transaction:tracked', {
        txId,
        type,
        status,
        timestamp
      });

      logger.info(LogComponent.BLOCKCHAIN, 'tx_tracked', 'Transaction tracked', {
        txId,
        type,
        status
      });

      return {
        success: true,
        txId,
        transaction
      };

    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN, 'tx_track_error', 'Failed to track transaction', {
        error: error.message,
        txData
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update transaction status
   * @param {string} txId - Transaction ID or digest
   * @param {Object} updates - Updates to apply
   * @returns {boolean} Success status
   */
  updateTransaction(txId, updates) {
    try {
      const transaction = this.transactions.get(txId);
      if (!transaction) {
        logger.warn(LogComponent.BLOCKCHAIN, 'tx_update_not_found', 'Transaction not found', {
          txId
        });
        return false;
      }

      // Apply updates
      Object.assign(transaction, updates, {
        updatedAt: Date.now()
      });

      // Update pending status
      if (updates.status && updates.status !== 'pending') {
        this.pendingTransactions.delete(txId);
      }

      // Save changes
      this.saveToStorage();

      // Emit event
      EventBus.emit('transaction:updated', {
        txId,
        updates,
        timestamp: Date.now()
      });

      logger.debug(LogComponent.BLOCKCHAIN, 'tx_updated', 'Transaction updated', {
        txId,
        status: transaction.status
      });

      return true;

    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN, 'tx_update_error', 'Failed to update transaction', {
        txId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get transaction by ID or digest
   * @param {string} txId - Transaction ID or digest
   * @returns {Object|null} Transaction data or null
   */
  getTransaction(txId) {
    return this.transactions.get(txId) || null;
  }

  /**
   * Get transactions for an object
   * @param {string} objectId - Sui object ID
   * @returns {Array} Array of transactions
   */
  getObjectTransactions(objectId) {
    const txIds = this.objectTransactions.get(objectId);
    if (!txIds) return [];

    return Array.from(txIds).
    map((txId) => this.transactions.get(txId)).
    filter((tx) => tx !== undefined).
    sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get transactions for an address
   * @param {string} address - Wallet address
   * @returns {Array} Array of transactions
   */
  getAddressTransactions(address) {
    const txIds = this.addressTransactions.get(address);
    if (!txIds) return [];

    return Array.from(txIds).
    map((txId) => this.transactions.get(txId)).
    filter((tx) => tx !== undefined).
    sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get transactions by type
   * @param {string} type - Transaction type
   * @param {number} limit - Max number to return
   * @returns {Array} Array of transactions
   */
  getTransactionsByType(type, limit = 50) {
    return Array.from(this.transactions.values()).
    filter((tx) => tx.type === type).
    sort((a, b) => b.timestamp - a.timestamp).
    slice(0, limit);
  }

  /**
   * Get transactions by status
   * @param {string} status - Transaction status
   * @param {number} limit - Max number to return
   * @returns {Array} Array of transactions
   */
  getTransactionsByStatus(status, limit = 50) {
    return Array.from(this.transactions.values()).
    filter((tx) => tx.status === status).
    sort((a, b) => b.timestamp - a.timestamp).
    slice(0, limit);
  }

  /**
   * Get recent transactions
   * @param {number} limit - Max number to return
   * @returns {Array} Array of transactions
   */
  getRecentTransactions(limit = 50) {
    return Array.from(this.transactions.values()).
    sort((a, b) => b.timestamp - a.timestamp).
    slice(0, limit);
  }

  /**
   * Get pending transactions
   * @returns {Array} Array of pending transactions
   */
  getPendingTransactions() {
    return Array.from(this.pendingTransactions).
    map((txId) => this.transactions.get(txId)).
    filter((tx) => tx !== undefined).
    sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get transaction statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    const transactions = Array.from(this.transactions.values());

    const byType = {};
    const byStatus = {};

    for (const tx of transactions) {
      // Count by type
      byType[tx.type] = (byType[tx.type] || 0) + 1;

      // Count by status
      byStatus[tx.status] = (byStatus[tx.status] || 0) + 1;
    }

    return {
      total: transactions.length,
      pending: this.pendingTransactions.size,
      confirmed: byStatus.confirmed || 0,
      failed: byStatus.failed || 0,
      byType,
      byStatus,
      oldestTimestamp: transactions.length > 0 ?
      Math.min(...transactions.map((tx) => tx.timestamp)) :
      null,
      newestTimestamp: transactions.length > 0 ?
      Math.max(...transactions.map((tx) => tx.timestamp)) :
      null
    };
  }

  /**
   * Delete transaction
   * @param {string} txId - Transaction ID
   * @returns {boolean} Success status
   */
  deleteTransaction(txId) {
    try {
      const transaction = this.transactions.get(txId);
      if (!transaction) return false;

      // Remove from main map
      this.transactions.delete(txId);

      // Remove from pending
      this.pendingTransactions.delete(txId);

      // Remove from object index
      if (transaction.objectId) {
        const objectTxs = this.objectTransactions.get(transaction.objectId);
        if (objectTxs) {
          objectTxs.delete(txId);
          if (objectTxs.size === 0) {
            this.objectTransactions.delete(transaction.objectId);
          }
        }
      }

      // Remove from address index
      if (transaction.address) {
        const addressTxs = this.addressTransactions.get(transaction.address);
        if (addressTxs) {
          addressTxs.delete(txId);
          if (addressTxs.size === 0) {
            this.addressTransactions.delete(transaction.address);
          }
        }
      }

      // Save changes
      this.saveToStorage();

      logger.info(LogComponent.BLOCKCHAIN, 'tx_deleted', 'Transaction deleted', {
        txId
      });

      return true;

    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN, 'tx_delete_error', 'Failed to delete transaction', {
        txId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Clear old transactions
   * @param {number} maxAgeMs - Max age in milliseconds
   * @returns {number} Number of transactions deleted
   */
  clearOldTransactions(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {// Default 30 days
    try {
      const cutoff = Date.now() - maxAgeMs;
      const toDelete = [];

      for (const [txId, tx] of this.transactions) {
        if (tx.timestamp < cutoff && tx.status !== 'pending') {
          toDelete.push(txId);
        }
      }

      for (const txId of toDelete) {
        this.deleteTransaction(txId);
      }

      logger.info(LogComponent.BLOCKCHAIN, 'tx_cleared_old', 'Cleared old transactions', {
        count: toDelete.length,
        maxAgeDays: Math.floor(maxAgeMs / 86400000)
      });

      return toDelete.length;

    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN, 'tx_clear_error', 'Failed to clear old transactions', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Clear all transactions
   */
  clearAll() {
    this.transactions.clear();
    this.objectTransactions.clear();
    this.addressTransactions.clear();
    this.pendingTransactions.clear();
    this.saveToStorage();

    logger.info(LogComponent.BLOCKCHAIN, 'tx_cleared_all', 'Cleared all transactions');
  }

  /**
   * Load from localStorage
   * RAM-only mode: No browser persistence
   */
  loadFromStorage() {
    try {
      // RAM-only, no browser persistence - localStorage.getItem disabled
      // const stored = localStorage.getItem(this.storageKey);
      const stored = null;
      if (!stored) {
        console.log('TransactionTracker: RAM-only mode, no browser persistence');
        return;
      }

      const data = JSON.parse(stored);

      // Validate version
      if (data.version !== this.storageVersion) {
        logger.warn(LogComponent.BLOCKCHAIN, 'tx_version_mismatch', 'Storage version mismatch', {
          stored: data.version,
          current: this.storageVersion
        });
      }

      // Load transactions
      if (data.transactions) {
        this.transactions = new Map(Object.entries(data.transactions));
      }

      // Load object index
      if (data.objectTransactions) {
        for (const [objectId, txIds] of Object.entries(data.objectTransactions)) {
          this.objectTransactions.set(objectId, new Set(txIds));
        }
      }

      // Load address index
      if (data.addressTransactions) {
        for (const [address, txIds] of Object.entries(data.addressTransactions)) {
          this.addressTransactions.set(address, new Set(txIds));
        }
      }

      // Load pending set
      if (data.pendingTransactions) {
        this.pendingTransactions = new Set(data.pendingTransactions);
      }

      logger.info(LogComponent.BLOCKCHAIN, 'tx_loaded', 'Transaction history loaded', {
        transactionCount: this.transactions.size,
        pendingCount: this.pendingTransactions.size
      });

    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN, 'tx_load_error', 'Failed to load transaction history', {
        error: error.message
      });
    }
  }

  /**
   * Save to localStorage
   * RAM-only mode: No browser persistence
   */
  saveToStorage() {
    try {
      // RAM-only, no browser persistence - localStorage.setItem disabled
      // Convert Maps and Sets to serializable format
      // const objectTransactionsObj = {};
      // for (const [objectId, txIds] of this.objectTransactions) {
      //   objectTransactionsObj[objectId] = Array.from(txIds);
      // }

      // const addressTransactionsObj = {};
      // for (const [address, txIds] of this.addressTransactions) {
      //   addressTransactionsObj[address] = Array.from(txIds);
      // }

      // const data = {
      //   version: this.storageVersion,
      //   transactions: Object.fromEntries(this.transactions),
      //   objectTransactions: objectTransactionsObj,
      //   addressTransactions: addressTransactionsObj,
      //   pendingTransactions: Array.from(this.pendingTransactions),
      //   lastUpdated: Date.now()
      // };

      // localStorage.setItem(this.storageKey, JSON.stringify(data));

      console.log('TransactionTracker: RAM-only mode, no browser persistence');
      logger.debug(LogComponent.BLOCKCHAIN, 'tx_saved', 'Transaction history saved (RAM-only)');

    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN, 'tx_save_error', 'Failed to save transaction history', {
        error: error.message
      });
    }
  }

  /**
   * Export transaction data
   * @returns {Object} Exported data
   */
  exportData() {
    return {
      version: this.storageVersion,
      transactions: Object.fromEntries(this.transactions),
      exportedAt: Date.now()
    };
  }

  /**
   * Import transaction data
   * @param {Object} data - Data to import
   * @param {boolean} merge - Whether to merge or replace
   * @returns {boolean} Success status
   */
  importData(data, merge = false) {
    try {
      if (!merge) {
        this.clearAll();
      }

      if (data.transactions) {
        for (const [txId, tx] of Object.entries(data.transactions)) {
          this.trackTransaction(tx);
        }
      }

      logger.info(LogComponent.BLOCKCHAIN, 'tx_imported', 'Transaction history imported', {
        count: Object.keys(data.transactions || {}).length,
        merge
      });

      return true;

    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN, 'tx_import_error', 'Failed to import transaction history', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Cleanup - save before unload
   */
  cleanup() {
    this.saveToStorage();
    logger.info(LogComponent.BLOCKCHAIN, 'tx_cleanup', 'TransactionTracker cleaned up');
  }
}

// Export singleton instance
export const transactionTracker = new TransactionTracker();

// Global access
if (typeof window !== 'undefined') {
  window.transactionTracker = transactionTracker;

  // Save on page unload
  window.addEventListener('beforeunload', () => {
    transactionTracker.cleanup();
  });
}

export default transactionTracker;