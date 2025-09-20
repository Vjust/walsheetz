import { logger, LogComponent } from './Logger.js';

/**
 * Transaction Experience Manager - Improves user experience with wallet transactions
 *
 * This utility provides:
 * - User-friendly transaction descriptions
 * - Progress tracking and explanations
 * - Transaction bundling where possible
 * - Clear communication about what the user is approving
 */
export class TransactionExperienceManager {
  constructor() {
    this.activeTransactions = new Map(); // Track active transactions
    this.transactionQueue = []; // Queue for sequential transactions
    this.processingQueue = false;
  }

  /**
   * Prepare transaction with user-friendly description
   */
  prepareTransaction(type, metadata = {}) {
    const transactionInfo = this.getTransactionInfo(type, metadata);

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_prepare', `Preparing transaction: ${transactionInfo.description}`, {
      type,
      metadata: Object.keys(metadata)
    });

    return {
      ...metadata,
      userDescription: transactionInfo.description,
      userExplanation: transactionInfo.explanation,
      estimatedTime: transactionInfo.estimatedTime,
      requiresWalletApproval: transactionInfo.requiresWallet,
      canBeBatched: transactionInfo.canBeBatched
    };
  }

  /**
   * Get transaction information based on type
   */
  getTransactionInfo(type, metadata = {}) {
    const info = {
      spreadsheet: {
        title: metadata.title || 'Untitled Spreadsheet',
        cellCount: metadata.cellCount || 0,
        isNew: !metadata.existingSpreadsheetId
      }
    };

    switch (type) {
      case 'create_spreadsheet':
        return {
          description: `Create New Spreadsheet "${info.spreadsheet.title}"`,
          explanation: 'This creates a new spreadsheet object on the Sui blockchain. Your data will be stored securely and permanently.',
          estimatedTime: '5-10 seconds',
          requiresWallet: true,
          canBeBatched: false, // Cannot be batched with other operations
          category: 'creation'
        };

      case 'save_version':
        return {
          description: `Save Spreadsheet "${info.spreadsheet.title}" (${info.spreadsheet.cellCount} cells)`,
          explanation: 'This saves your spreadsheet data to decentralized storage and records it on the blockchain. Your data is encrypted and permanently accessible.',
          estimatedTime: '8-15 seconds',
          requiresWallet: true,
          canBeBatched: true, // Can be batched with storage operations
          category: 'update'
        };

      case 'combined_create_save':
        return {
          description: `Create & Save Spreadsheet "${info.spreadsheet.title}"`,
          explanation: 'This creates your spreadsheet and saves your initial data in one efficient operation. Your data will be encrypted and stored on the decentralized web.',
          estimatedTime: '10-20 seconds',
          requiresWallet: true,
          canBeBatched: false, // Already combined
          category: 'creation'
        };

      case 'update_metadata':
        return {
          description: `Update Spreadsheet "${info.spreadsheet.title}"`,
          explanation: 'This updates the spreadsheet title or other metadata on the blockchain.',
          estimatedTime: '3-8 seconds',
          requiresWallet: true,
          canBeBatched: false,
          category: 'metadata'
        };

      case 'make_public':
        return {
          description: `Make Spreadsheet "${info.spreadsheet.title}" Public`,
          explanation: 'This changes your spreadsheet from private to public visibility. Anyone with the link can view it.',
          estimatedTime: '5-10 seconds',
          requiresWallet: true,
          canBeBatched: false,
          category: 'permission'
        };

      case 'make_private':
        return {
          description: `Make Spreadsheet "${info.spreadsheet.title}" Private`,
          explanation: 'This changes your spreadsheet from public to private visibility. Only you can access it.',
          estimatedTime: '5-10 seconds',
          requiresWallet: true,
          canBeBatched: false,
          category: 'permission'
        };

      case 'transfer_ownership':
        return {
          description: `Transfer Spreadsheet "${info.spreadsheet.title}"`,
          explanation: 'This transfers ownership of your spreadsheet to another wallet address.',
          estimatedTime: '5-10 seconds',
          requiresWallet: true,
          canBeBatched: false,
          category: 'ownership'
        };

      case 'delete_spreadsheet':
        return {
          description: `Delete Spreadsheet "${info.spreadsheet.title}"`,
          explanation: 'This permanently deletes your spreadsheet from the blockchain. This action cannot be undone.',
          estimatedTime: '8-15 seconds',
          requiresWallet: true,
          canBeBatched: false,
          category: 'deletion'
        };

      default:
        return {
          description: `Process Spreadsheet "${info.spreadsheet.title}"`,
          explanation: 'This performs a blockchain operation on your spreadsheet.',
          estimatedTime: '5-15 seconds',
          requiresWallet: true,
          canBeBatched: false,
          category: 'general'
        };
    }
  }

  /**
   * Execute transactions with improved user experience
   */
  async executeWithExperience(transaction, type, metadata = {}) {
    const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const transactionInfo = this.getTransactionInfo(type, metadata);

    // Prepare transaction with user-friendly info
    const preparedTransaction = this.prepareTransaction(type, {
      ...metadata,
      transactionId,
      preparedAt: Date.now()
    });

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_execute_start', `Starting transaction execution: ${type}`, {
      transactionId,
      type,
      description: transactionInfo.description
    });

    try {
      // Emit transaction start event with user-friendly info
      this.emitTransactionEvent('transaction:start', {
        transactionId,
        type,
        description: transactionInfo.description,
        explanation: transactionInfo.explanation,
        estimatedTime: transactionInfo.estimatedTime,
        category: transactionInfo.category,
        metadata: preparedTransaction
      });

      const startTime = Date.now();

      // Execute the transaction
      const result = await transaction.execute(preparedTransaction);

      const duration = Date.now() - startTime;

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_execute_success', `Transaction completed successfully: ${type}`, {
        transactionId,
        type,
        duration: `${duration}ms`,
        result: {
          success: result.success,
          digest: result.digest?.substring(0, 16) + '...'
        }
      });

      // Emit transaction success event
      this.emitTransactionEvent('transaction:success', {
        transactionId,
        type,
        duration,
        result: {
          success: result.success,
          transactionDigest: result.digest
        },
        metadata: preparedTransaction
      });

      return result;

    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_execute_failed', `Transaction failed: ${type}`, {
        transactionId,
        type,
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      });

      // Emit transaction failure event
      this.emitTransactionEvent('transaction:failed', {
        transactionId,
        type,
        error: typeof error === 'string' ? error : error.message || 'Unknown error',
        requiresUserAction: this.isUserActionRequired(error),
        canRetry: this.canRetryTransaction(error),
        metadata: preparedTransaction
      });

      throw error;
    }
  }

  /**
   * Queue multiple transactions for sequential execution
   */
  async executeQueue(transactions) {
    if (this.processingQueue) {
      throw new Error('Transaction queue is already being processed');
    }

    this.processingQueue = true;
    this.transactionQueue = transactions;

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_queue_start', `Starting transaction queue processing`, {
      queueLength: transactions.length
    });

    try {
      const results = [];

      for (let i = 0; i < transactions.length; i++) {
        const { transaction, type, metadata } = transactions[i];

        // Emit queue progress event
        this.emitTransactionEvent('queue:progress', {
          currentIndex: i + 1,
          totalCount: transactions.length,
          currentTransaction: type,
          description: this.getTransactionInfo(type, metadata).description
        });

        const result = await this.executeWithExperience(transaction, type, metadata);
        results.push(result);

        // Small delay between transactions for better UX
        if (i < transactions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_queue_complete', `Transaction queue completed successfully`, {
        totalTransactions: transactions.length,
        successfulTransactions: results.filter(r => r.success).length
      });

      // Emit queue completion event
      this.emitTransactionEvent('queue:complete', {
        totalTransactions: transactions.length,
        successfulTransactions: results.filter(r => r.success).length,
        results
      });

      return results;

    } finally {
      this.processingQueue = false;
      this.transactionQueue = [];
    }
  }

  /**
   * Check if error requires user action
   */
  isUserActionRequired(error) {
    const errorMessage = error.message?.toLowerCase() || '';

    return errorMessage.includes('rejected') ||
           errorMessage.includes('denied') ||
           errorMessage.includes('user') ||
           errorMessage.includes('wallet');
  }

  /**
   * Check if transaction can be retried
   */
  canRetryTransaction(error) {
    const errorMessage = error.message?.toLowerCase() || '';

    return !errorMessage.includes('notExists') &&
           !errorMessage.includes('insufficient') &&
           !errorMessage.includes('balance');
  }

  /**
   * Emit transaction event for UI integration
   */
  emitTransactionEvent(eventType, data) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`walsheetz:transaction:${eventType}`, {
        detail: {
          ...data,
          timestamp: Date.now()
        }
      }));
    }
  }

  /**
   * Add transaction event listener
   */
  addTransactionListener(eventType, callback) {
    if (typeof window !== 'undefined') {
      window.addEventListener(`walsheetz:transaction:${eventType}`, callback);
      return () => window.removeEventListener(`walsheetz:transaction:${eventType}`, callback);
    }
    return () => {}; // No-op cleanup function
  }

  /**
   * Get transaction status
   */
  getTransactionStatus(transactionId) {
    return {
      transactionId,
      isActive: this.activeTransactions.has(transactionId),
      startTime: this.activeTransactions.get(transactionId)?.startTime,
      type: this.activeTransactions.get(transactionId)?.type
    };
  }

  /**
   * Clear completed transactions
   */
  cleanupCompletedTransactions() {
    const now = Date.now();
    let cleaned = 0;

    for (const [transactionId, transaction] of this.activeTransactions.entries()) {
      // Remove transactions older than 5 minutes
      if (now - transaction.startTime > 5 * 60 * 1000) {
        this.activeTransactions.delete(transactionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_cleanup', `Cleaned up ${cleaned} completed transactions`);
    }
  }
}

// Global transaction experience manager instance
export const transactionExperienceManager = new TransactionExperienceManager();
