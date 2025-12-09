import { logger, LogComponent } from '../Logger.js';

interface TransactionMetadata {
  title?: string;
  cellCount?: number;
  existingSpreadsheetId?: string;
  transactionId?: string;
  preparedAt?: number;
  [key: string]: unknown;
}

interface TransactionInfo {
  description: string;
  explanation: string;
  estimatedTime: string;
  requiresWallet: boolean;
  canBeBatched: boolean;
  category: string;
}

interface PreparedTransaction extends TransactionMetadata {
  userDescription: string;
  userExplanation: string;
  estimatedTime: string;
  requiresWalletApproval: boolean;
  canBeBatched: boolean;
}

interface TransactionResult {
  success: boolean;
  digest?: string;
  [key: string]: unknown;
}

interface Transaction {
  execute: (prepared: PreparedTransaction) => Promise<TransactionResult>;
}

interface QueuedTransaction {
  transaction: Transaction;
  type: string;
  metadata: TransactionMetadata;
}

interface ActiveTransaction {
  startTime: number;
  type: string;
}

export class TransactionExperienceManager {
  private activeTransactions: Map<string, ActiveTransaction>;
  private transactionQueue: QueuedTransaction[];
  private processingQueue: boolean;

  constructor() {
    this.activeTransactions = new Map();
    this.transactionQueue = [];
    this.processingQueue = false;
  }

  prepareTransaction(type: string, metadata: TransactionMetadata = {}): PreparedTransaction {
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

  getTransactionInfo(type: string, metadata: TransactionMetadata = {}): TransactionInfo {
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
          explanation: 'This creates a new spreadsheet object on the Sui blockchain.',
          estimatedTime: '5-10 seconds',
          requiresWallet: true,
          canBeBatched: false,
          category: 'creation'
        };

      case 'save_version':
        return {
          description: `Save Spreadsheet "${info.spreadsheet.title}" (${info.spreadsheet.cellCount} cells)`,
          explanation: 'This saves your spreadsheet data to decentralized storage.',
          estimatedTime: '8-15 seconds',
          requiresWallet: true,
          canBeBatched: true,
          category: 'update'
        };

      case 'combined_create_save':
        return {
          description: `Create & Save Spreadsheet "${info.spreadsheet.title}"`,
          explanation: 'This creates your spreadsheet and saves data in one operation.',
          estimatedTime: '10-20 seconds',
          requiresWallet: true,
          canBeBatched: false,
          category: 'creation'
        };

      case 'update_metadata':
        return {
          description: `Update Spreadsheet "${info.spreadsheet.title}"`,
          explanation: 'This updates the spreadsheet metadata on the blockchain.',
          estimatedTime: '3-8 seconds',
          requiresWallet: true,
          canBeBatched: false,
          category: 'metadata'
        };

      case 'make_public':
        return {
          description: `Make Spreadsheet "${info.spreadsheet.title}" Public`,
          explanation: 'This changes your spreadsheet to public visibility.',
          estimatedTime: '5-10 seconds',
          requiresWallet: true,
          canBeBatched: false,
          category: 'permission'
        };

      case 'make_private':
        return {
          description: `Make Spreadsheet "${info.spreadsheet.title}" Private`,
          explanation: 'This changes your spreadsheet to private visibility.',
          estimatedTime: '5-10 seconds',
          requiresWallet: true,
          canBeBatched: false,
          category: 'permission'
        };

      case 'transfer_ownership':
        return {
          description: `Transfer Spreadsheet "${info.spreadsheet.title}"`,
          explanation: 'This transfers ownership to another wallet address.',
          estimatedTime: '5-10 seconds',
          requiresWallet: true,
          canBeBatched: false,
          category: 'ownership'
        };

      case 'delete_spreadsheet':
        return {
          description: `Delete Spreadsheet "${info.spreadsheet.title}"`,
          explanation: 'This permanently deletes your spreadsheet.',
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

  async executeWithExperience(transaction: Transaction, type: string, metadata: TransactionMetadata = {}): Promise<TransactionResult> {
    const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const transactionInfo = this.getTransactionInfo(type, metadata);

    const preparedTransaction = this.prepareTransaction(type, {
      ...metadata,
      transactionId,
      preparedAt: Date.now()
    });

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_execute_start', `Starting transaction: ${type}`, {
      transactionId,
      type,
      description: transactionInfo.description
    });

    try {
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
      const result = await transaction.execute(preparedTransaction);
      const duration = Date.now() - startTime;

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_execute_success', `Transaction completed: ${type}`, {
        transactionId,
        type,
        duration: `${duration}ms`
      });

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
      const err = error as Error;
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_execute_failed', `Transaction failed: ${type}`, {
        transactionId,
        type,
        error: err.message || 'Unknown error'
      });

      this.emitTransactionEvent('transaction:failed', {
        transactionId,
        type,
        error: err.message || 'Unknown error',
        requiresUserAction: this.isUserActionRequired(err),
        canRetry: this.canRetryTransaction(err),
        metadata: preparedTransaction
      });

      throw error;
    }
  }

  async executeQueue(transactions: QueuedTransaction[]): Promise<TransactionResult[]> {
    if (this.processingQueue) {
      throw new Error('Transaction queue is already being processed');
    }

    this.processingQueue = true;
    this.transactionQueue = transactions;

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_queue_start', `Starting queue processing`, {
      queueLength: transactions.length
    });

    try {
      const results: TransactionResult[] = [];

      for (let i = 0; i < transactions.length; i++) {
        const { transaction, type, metadata } = transactions[i];

        this.emitTransactionEvent('queue:progress', {
          currentIndex: i + 1,
          totalCount: transactions.length,
          currentTransaction: type,
          description: this.getTransactionInfo(type, metadata).description
        });

        const result = await this.executeWithExperience(transaction, type, metadata);
        results.push(result);

        if (i < transactions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_queue_complete', `Queue completed`, {
        totalTransactions: transactions.length,
        successfulTransactions: results.filter(r => r.success).length
      });

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

  isUserActionRequired(error: Error): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    return errorMessage.includes('rejected') ||
           errorMessage.includes('denied') ||
           errorMessage.includes('user') ||
           errorMessage.includes('wallet');
  }

  canRetryTransaction(error: Error): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    return !errorMessage.includes('notExists') &&
           !errorMessage.includes('insufficient') &&
           !errorMessage.includes('balance');
  }

  emitTransactionEvent(eventType: string, data: Record<string, unknown>): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`walsheetz:transaction:${eventType}`, {
        detail: {
          ...data,
          timestamp: Date.now()
        }
      }));
    }
  }

  addTransactionListener(eventType: string, callback: EventListener): () => void {
    if (typeof window !== 'undefined') {
      window.addEventListener(`walsheetz:transaction:${eventType}`, callback);
      return () => window.removeEventListener(`walsheetz:transaction:${eventType}`, callback);
    }
    return () => {};
  }

  getTransactionStatus(transactionId: string) {
    return {
      transactionId,
      isActive: this.activeTransactions.has(transactionId),
      startTime: this.activeTransactions.get(transactionId)?.startTime,
      type: this.activeTransactions.get(transactionId)?.type
    };
  }

  cleanupCompletedTransactions(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [transactionId, transaction] of this.activeTransactions.entries()) {
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

export const transactionExperienceManager = new TransactionExperienceManager();
