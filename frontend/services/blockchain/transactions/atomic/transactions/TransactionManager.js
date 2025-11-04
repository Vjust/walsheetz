import { logger, LogComponent } from '@utils/logging/Logger.js';

/**
 * Generate a UUID v4 for idempotency
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Transaction Manager - Centralized transaction state management and coordination
 *
 * This service extracts transaction management logic from BlockchainAdapter
 * to provide a clean, reusable transaction coordination layer.
 *
 * Features:
 * - Per-spreadsheet transaction state tracking
 * - Queue management with debouncing and batching
 * - Circuit breaker integration
 * - Auto-recovery from stuck transactions
 * - Transaction lifecycle events
 */
export class TransactionManager {
  constructor(options = {}) {
    // Configuration
    this.processingTimeout = options.processingTimeout || 30000; // 30 seconds
    this.debounceDelay = options.debounceDelay || 750; // 750ms
    this.maxBatchSize = options.maxBatchSize || 50;
    this.maxFailureCount = options.maxFailureCount || 5;
    this.baseBackoffDelay = options.baseBackoffDelay || 30000; // 30 seconds
    this.maxBackoffDelay = options.maxBackoffDelay || 300000; // 5 minutes

    // Per-spreadsheet transaction state
    this.transactionStates = new Map(); // Map<spreadsheetId, TransactionState>

    // Per-spreadsheet queuing and batching
    this.saveQueues = new Map(); // Map<spreadsheetId, Array<QueueItem>>
    this.pendingSaves = new Map(); // Map<spreadsheetId, Promise>
    this.debounceTimers = new Map(); // Map<spreadsheetId, timeoutId>

    // Global state
    this.globalState = {
      disabled: false,
      lastGlobalFailure: null,
      globalFailureCount: 0
    };

    // Event listeners
    this.listeners = new Map(); // Map<event, Set<handler>>

    // Idempotency tracking
    this.idempotencyCache = new Map(); // Map<operationHash, {nonce, result, timestamp}>
    this.maxIdempotencyCacheSize = options.maxIdempotencyCacheSize || 1000;
    this.idempotencyCacheTTL = options.idempotencyCacheTTL || 300000; // 5 minutes

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_manager_init', 'TransactionManager initialized', {
      processingTimeout: this.processingTimeout,
      debounceDelay: this.debounceDelay,
      maxBatchSize: this.maxBatchSize,
      maxIdempotencyCacheSize: this.maxIdempotencyCacheSize
    });
  }

  /**
   * Get or create transaction state for a spreadsheet
   */
  _getOrCreateTransactionState(spreadsheetId) {
    if (!this.transactionStates.has(spreadsheetId)) {
      this.transactionStates.set(spreadsheetId, {
        // Transaction lifecycle
        state: 'idle', // idle → preparing → estimating → awaiting_wallet → executing → completed/failed
        isProcessing: false,
        processingStartTime: null,
        lastTransaction: null,

        // Error tracking
        failureCount: 0,
        lastFailureTime: null,
        disabled: false,

        // Queue management
        queuedOperations: 0,
        lastSuccessTime: null,

        // Metadata
        spreadsheetId,
        createdAt: Date.now()
      });
    }
    return this.transactionStates.get(spreadsheetId);
  }

  /**
   * Check if a transaction is currently processing for a spreadsheet
   */
  isProcessing(spreadsheetId) {
    if (!spreadsheetId) return false;

    const state = this._getOrCreateTransactionState(spreadsheetId);

    // Check for stuck transactions and auto-recover
    if (state.isProcessing && state.processingStartTime) {
      const elapsed = Date.now() - state.processingStartTime;
      if (elapsed > this.processingTimeout) {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_timeout_recovery',
          'Auto-recovering from stuck transaction', {
            spreadsheetId,
            elapsed,
            timeout: this.processingTimeout,
            lastTransaction: state.lastTransaction
          });

        this._resetTransactionState(spreadsheetId);
        this._emit('transaction:timeout', { spreadsheetId, elapsed });
        return false;
      }
    }

    return state.isProcessing;
  }

  /**
   * Start a new transaction
   */
  startTransaction(spreadsheetId, transactionType, metadata = {}) {
    const state = this._getOrCreateTransactionState(spreadsheetId);

    // Check if already processing
    if (this.isProcessing(spreadsheetId)) {
      const error = new Error('Transaction already in progress');
      error.code = 'TRANSACTION_IN_PROGRESS';
      throw error;
    }

    // Check if transactions are disabled
    if (this._isDisabled(spreadsheetId)) {
      const cooldownInfo = this._getCooldownInfo(spreadsheetId);
      const error = new Error(`Transactions disabled for ${Math.round(cooldownInfo.remaining / 1000)}s due to repeated failures`);
      error.code = 'TRANSACTIONS_DISABLED';
      error.cooldownRemaining = cooldownInfo.remaining;
      throw error;
    }

    // Start transaction
    const transactionId = `${transactionType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    state.state = 'preparing';
    state.isProcessing = true;
    state.processingStartTime = Date.now();
    state.lastTransaction = {
      id: transactionId,
      type: transactionType,
      startTime: Date.now(),
      metadata
    };

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_start', 'Transaction started', {
      spreadsheetId,
      transactionId,
      transactionType,
      metadata
    });

    this._emit('transaction:start', { spreadsheetId, transactionId, transactionType, metadata });

    return transactionId;
  }

  /**
   * Update transaction state
   */
  updateTransactionState(spreadsheetId, newState, metadata = {}) {
    const state = this._getOrCreateTransactionState(spreadsheetId);

    if (!state.isProcessing) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_state_update_no_transaction',
        'Attempted to update state without active transaction', { spreadsheetId, newState });
      return;
    }

    const oldState = state.state;
    state.state = newState;

    if (state.lastTransaction) {
      state.lastTransaction.lastUpdate = Date.now();
      state.lastTransaction.currentState = newState;
    }

    logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_state_update',
      'Transaction state updated', {
        spreadsheetId,
        transactionId: state.lastTransaction?.id,
        oldState,
        newState,
        metadata
      });

    this._emit('transaction:state_change', {
      spreadsheetId,
      transactionId: state.lastTransaction?.id,
      oldState,
      newState,
      metadata
    });
  }

  /**
   * Complete a transaction successfully
   */
  completeTransaction(spreadsheetId, result = {}) {
    const state = this._getOrCreateTransactionState(spreadsheetId);

    if (!state.isProcessing) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_complete_no_transaction',
        'Attempted to complete transaction without active transaction', { spreadsheetId });
      return;
    }

    const transactionId = state.lastTransaction?.id;
    const duration = Date.now() - (state.processingStartTime || Date.now());

    // Reset state
    state.state = 'completed';
    state.isProcessing = false;
    state.processingStartTime = null;
    state.lastSuccessTime = Date.now();

    // Reset failure tracking on success
    if (state.failureCount > 0) {
      state.failureCount = Math.max(0, state.failureCount - 1);
      state.disabled = false;
    }

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_complete', 'Transaction completed successfully', {
      spreadsheetId,
      transactionId,
      duration,
      result: {
        ...result,
        // Don't log sensitive data
        success: result.success
      }
    });

    this._emit('transaction:complete', { spreadsheetId, transactionId, duration, result });

    // Reset to idle after brief delay to allow event handlers to run
    setTimeout(() => {
      if (state.state === 'completed') {
        state.state = 'idle';
        state.lastTransaction = null;
      }
    }, 100);
  }

  /**
   * Fail a transaction with error handling
   */
  failTransaction(spreadsheetId, error, recovery = {}) {
    const state = this._getOrCreateTransactionState(spreadsheetId);

    if (!state.isProcessing) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_fail_no_transaction',
        'Attempted to fail transaction without active transaction', { spreadsheetId });
      return;
    }

    const transactionId = state.lastTransaction?.id;
    const duration = Date.now() - (state.processingStartTime || Date.now());

    // Update failure tracking
    state.failureCount++;
    state.lastFailureTime = Date.now();

    // Check if we should disable transactions for this spreadsheet
    if (state.failureCount >= this.maxFailureCount) {
      state.disabled = true;
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_disabled',
        'Transactions disabled due to repeated failures', {
          spreadsheetId,
          failureCount: state.failureCount,
          maxFailureCount: this.maxFailureCount
        });
    }

    // Reset processing state
    state.state = 'failed';
    state.isProcessing = false;
    state.processingStartTime = null;

    logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_failed', 'Transaction failed', {
      spreadsheetId,
      transactionId,
      duration,
      failureCount: state.failureCount,
      error: error.message,
      code: error.code,
      recovery
    });

    this._emit('transaction:failed', {
      spreadsheetId,
      transactionId,
      duration,
      error,
      failureCount: state.failureCount,
      recovery
    });

    // Reset to idle after brief delay
    setTimeout(() => {
      if (state.state === 'failed') {
        state.state = 'idle';
        state.lastTransaction = null;
      }
    }, 100);
  }

  /**
   * Reset transaction state (for recovery)
   */
  _resetTransactionState(spreadsheetId) {
    const state = this._getOrCreateTransactionState(spreadsheetId);

    state.state = 'idle';
    state.isProcessing = false;
    state.processingStartTime = null;
    state.lastTransaction = null;

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_state_reset', 'Transaction state reset', {
      spreadsheetId
    });
  }

  /**
   * Get transaction state for debugging
   */
  getTransactionState(spreadsheetId) {
    if (!spreadsheetId) {
      // Return global state summary
      return {
        globalState: this.globalState,
        activeTransactions: Array.from(this.transactionStates.entries())
          .filter(([_, state]) => state.isProcessing)
          .map(([id, state]) => ({ spreadsheetId: id, ...state })),
        totalStates: this.transactionStates.size
      };
    }

    const state = this._getOrCreateTransactionState(spreadsheetId);
    const cooldownInfo = this._getCooldownInfo(spreadsheetId);

    return {
      ...state,
      timeSinceLastFailure: state.lastFailureTime ? Date.now() - state.lastFailureTime : null,
      timeSinceProcessingStart: state.processingStartTime ? Date.now() - state.processingStartTime : null,
      cooldownInfo
    };
  }

  /**
   * Check if transactions are disabled for a spreadsheet
   */
  _isDisabled(spreadsheetId) {
    const state = this._getOrCreateTransactionState(spreadsheetId);

    if (!state.disabled) return false;

    const cooldownInfo = this._getCooldownInfo(spreadsheetId);
    if (cooldownInfo.remaining <= 0) {
      // Cooldown expired, re-enable
      state.disabled = false;
      state.failureCount = Math.max(0, state.failureCount - 1);
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_reenabled',
        'Transactions re-enabled after cooldown', { spreadsheetId });
      return false;
    }

    return true;
  }

  /**
   * Get cooldown information
   */
  _getCooldownInfo(spreadsheetId) {
    const state = this._getOrCreateTransactionState(spreadsheetId);

    if (!state.lastFailureTime) {
      return { remaining: 0, total: 0 };
    }

    const elapsed = Date.now() - state.lastFailureTime;
    const cooldownPeriod = Math.min(
      this.maxBackoffDelay,
      this.baseBackoffDelay * Math.pow(2, state.failureCount - 1)
    );
    const remaining = Math.max(0, cooldownPeriod - elapsed);

    return {
      remaining,
      total: cooldownPeriod,
      elapsed
    };
  }

  /**
   * Event system for transaction lifecycle
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  _emit(event, data) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_event_handler_error',
            'Error in transaction event handler', {
              event,
              error: error.message,
              stack: error.stack
            });
        }
      });
    }
  }

  /**
   * Generate idempotency nonce for an operation
   */
  generateIdempotencyNonce(operationType, spreadsheetId, operationData = {}) {
    const nonce = generateUUID();
    const timestamp = Date.now();

    // Create a hash of the operation for deduplication
    const operationHash = this._hashOperation(operationType, spreadsheetId, operationData);

    logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'idempotency_nonce_generated',
      'Generated idempotency nonce', {
        operationType,
        spreadsheetId,
        nonce,
        operationHash: operationHash.substring(0, 16)
      });

    return {
      nonce,
      operationHash,
      timestamp,
      operationType,
      spreadsheetId
    };
  }

  /**
   * Check if an operation is a duplicate and should be skipped
   */
  checkIdempotency(operationHash, nonce) {
    // Clean expired entries first
    this._cleanExpiredIdempotencyEntries();

    const cached = this.idempotencyCache.get(operationHash);
    if (!cached) {
      return { isDuplicate: false, cachedResult: null };
    }

    // Check if it's the same nonce (exact duplicate)
    if (cached.nonce === nonce) {
      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'idempotency_exact_duplicate',
        'Exact duplicate operation detected', {
          operationHash: operationHash.substring(0, 16),
          nonce,
          cachedTimestamp: cached.timestamp
        });
      return { isDuplicate: true, cachedResult: cached.result };
    }

    // Check if it's a recent duplicate operation (different nonce, same operation)
    const timeSinceLastOperation = Date.now() - cached.timestamp;
    if (timeSinceLastOperation < 5000) { // 5 seconds
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'idempotency_recent_duplicate',
        'Recent duplicate operation detected', {
          operationHash: operationHash.substring(0, 16),
          nonce,
          cachedNonce: cached.nonce,
          timeSinceLastOperation
        });
      return { isDuplicate: true, cachedResult: cached.result };
    }

    return { isDuplicate: false, cachedResult: null };
  }

  /**
   * Store operation result for idempotency
   */
  storeIdempotencyResult(operationHash, nonce, result) {
    // Ensure cache doesn't exceed size limit
    if (this.idempotencyCache.size >= this.maxIdempotencyCacheSize) {
      this._evictOldestIdempotencyEntries();
    }

    this.idempotencyCache.set(operationHash, {
      nonce,
      result,
      timestamp: Date.now()
    });

    logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'idempotency_result_stored',
      'Stored operation result for idempotency', {
        operationHash: operationHash.substring(0, 16),
        nonce,
        cacheSize: this.idempotencyCache.size
      });
  }

  /**
   * Generate operation hash for deduplication
   */
  _hashOperation(operationType, spreadsheetId, operationData) {
    // Create a deterministic hash based on operation parameters
    const dataString = JSON.stringify({
      type: operationType,
      spreadsheetId,
      // Only include relevant data for hashing, excluding timestamps and nonces
      data: {
        title: operationData.title,
        cellCount: operationData.cellCount,
        dataSize: operationData.dataSize,
        // Hash of actual data content if available
        contentHash: operationData.contentHash
      }
    });

    // Simple hash function (for production, consider crypto.subtle.digest)
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return `op_${Math.abs(hash).toString(36)}_${operationType}_${spreadsheetId.substring(0, 8)}`;
  }

  /**
   * Clean expired idempotency entries
   */
  _cleanExpiredIdempotencyEntries() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [hash, entry] of this.idempotencyCache.entries()) {
      if (now - entry.timestamp > this.idempotencyCacheTTL) {
        this.idempotencyCache.delete(hash);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'idempotency_cache_cleaned',
        'Cleaned expired idempotency entries', {
          cleanedCount,
          remainingCount: this.idempotencyCache.size
        });
    }
  }

  /**
   * Evict oldest idempotency entries when cache is full
   */
  _evictOldestIdempotencyEntries() {
    const entries = Array.from(this.idempotencyCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    const evictCount = Math.ceil(this.maxIdempotencyCacheSize * 0.1); // Evict 10%
    for (let i = 0; i < evictCount; i++) {
      this.idempotencyCache.delete(entries[i][0]);
    }

    logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'idempotency_cache_evicted',
      'Evicted oldest idempotency entries', {
        evictCount,
        remainingCount: this.idempotencyCache.size
      });
  }

  /**
   * Get idempotency cache stats
   */
  getIdempotencyStats() {
    const now = Date.now();
    let recentCount = 0;
    let expiredCount = 0;

    for (const entry of this.idempotencyCache.values()) {
      const age = now - entry.timestamp;
      if (age < 60000) { // Less than 1 minute
        recentCount++;
      }
      if (age > this.idempotencyCacheTTL) {
        expiredCount++;
      }
    }

    return {
      totalEntries: this.idempotencyCache.size,
      recentEntries: recentCount,
      expiredEntries: expiredCount,
      maxSize: this.maxIdempotencyCacheSize,
      ttl: this.idempotencyCacheTTL
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    // Clear all timers
    this.debounceTimers.forEach(timerId => clearTimeout(timerId));
    this.debounceTimers.clear();

    // Clear state
    this.transactionStates.clear();
    this.saveQueues.clear();
    this.pendingSaves.clear();
    this.listeners.clear();
    this.idempotencyCache.clear();

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_manager_destroyed',
      'TransactionManager destroyed');
  }
}

// Create singleton instance
export const transactionManager = new TransactionManager();

// Export class for testing
export default TransactionManager;