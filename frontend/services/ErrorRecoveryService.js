/**
 * Error Recovery Service for WalSheetz
 * Provides intelligent error handling and recovery strategies
 */

import { logger, LogComponent, ErrorCategory } from '../utils/Logger.js';

class ErrorRecoveryService {
  constructor() {
    this.retryQueue = [];
    this.isProcessingQueue = false;
    this.maxConcurrentRetries = 3;
    this.activeRetries = new Set();

    // Recovery strategies
    this.recoveryStrategies = {
      [ErrorCategory.NETWORK]: this.handleNetworkError.bind(this),
      [ErrorCategory.WALLET]: this.handleWalletError.bind(this),
      [ErrorCategory.BLOCKCHAIN]: this.handleBlockchainError.bind(this),
      [ErrorCategory.STORAGE]: this.handleStorageError.bind(this),
      [ErrorCategory.VALIDATION]: this.handleValidationError.bind(this),
      [ErrorCategory.PERMISSION]: this.handlePermissionError.bind(this),
      [ErrorCategory.RATE_LIMIT]: this.handleRateLimitError.bind(this),
      [ErrorCategory.UNKNOWN]: this.handleUnknownError.bind(this)
    };

    logger.info(LogComponent.PERFORMANCE, 'error_recovery_init', 'Error Recovery Service initialized');
  }

  // Main error handling method
  async handleError(error, context = {}) {
    const { component, action, operation } = context;

    const result = logger.logErrorWithRecovery(component, action, error, {
      operation,
      ...context
    });

    const { category, recovery } = result;

    // Execute recovery strategy
    return await this.executeRecovery(category, error, recovery, context);
  }

  // Execute recovery strategy based on error category
  async executeRecovery(category, error, recovery, context) {
    const strategy = this.recoveryStrategies[category];
    if (strategy) {
      return await strategy(error, recovery, context);
    }

    // Fallback to unknown error handler
    return await this.recoveryStrategies[ErrorCategory.UNKNOWN](error, recovery, context);
  }

  // Network error recovery
  async handleNetworkError(error, recovery, context) {
    const { operation, maxRetries = recovery.maxRetries } = context;
    const retryKey = `${operation}-${Date.now()}`;

    // Add to retry queue if within retry limits
    if (this.retryQueue.length < 50) { // Max queue size
      this.retryQueue.push({
        id: retryKey,
        error,
        recovery,
        context,
        attempts: 0,
        maxRetries,
        nextRetry: Date.now() + recovery.delay
      });

      logger.info(LogComponent.PERFORMANCE, 'network_error_queued', 'Network error queued for retry', {
        retryKey,
        operation,
        delay: recovery.delay,
        queueSize: this.retryQueue.length
      });

      // Start processing queue if not already processing
      this.processRetryQueue();
    }

    return {
      success: false,
      queued: true,
      userMessage: recovery.userMessage,
      category: ErrorCategory.NETWORK
    };
  }

  // Wallet error recovery
  async handleWalletError(error, recovery, context) {
    const { operation } = context;

    logger.warn(LogComponent.WALLET_MANAGER, 'wallet_error', 'Wallet error detected', {
      operation,
      error: error.message,
      requiresUserAction: true
    });

    // For wallet errors, we can't auto-retry
    // Emit event to notify UI to prompt user
    this.emitWalletErrorEvent(error, context);

    return {
      success: false,
      requiresUserAction: true,
      userMessage: recovery.userMessage,
      category: ErrorCategory.WALLET
    };
  }

  // Blockchain error recovery
  async handleBlockchainError(error, recovery, context) {
    const { operation, maxRetries = recovery.maxRetries } = context;
    const errorMessage = error.message || error.toString();

    // Handle specific blockchain error types with enhanced recovery

    // 1. Handle "notExists" object errors - immediate state cleanup needed
    if (errorMessage.includes('notExists') || errorMessage.includes('object does not exist')) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'object_not_exists_error', 'Object no longer exists on blockchain', {
        error: errorMessage,
        operation,
        recovery: 'immediate_state_cleanup'
      });

      // Trigger comprehensive cache cleanup across all services
      this.triggerGlobalCacheCleanup(error, context);

      // Determine if this was during gas estimation
      const isGasEstimation = operation === 'gas_estimation' || context.component === 'gas_estimation';
      const userMessage = isGasEstimation
        ? 'Invalid cached data detected during gas estimation. Cache has been cleared and operation will retry.'
        : 'The spreadsheet object is no longer valid. A new spreadsheet will be created automatically.';

      return {
        category: ErrorCategory.BLOCKCHAIN,
        userMessage,
        requiresUserAction: false,
        queued: false,
        immediateAction: 'clear_invalid_state',
        canRetry: isGasEstimation, // Gas estimation errors can be retried after cache cleanup
        isGasEstimationError: isGasEstimation
      };
    }

    // 2. Handle "Invalid Transaction digest" errors - blockchain state issue
    if (errorMessage.includes('Invalid Transaction digest') || errorMessage.includes('invalid digest')) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'invalid_digest_error', 'Transaction digest validation failed', {
        error: errorMessage,
        operation,
        recovery: 'retry_with_delay'
      });

      return {
        category: ErrorCategory.BLOCKCHAIN,
        userMessage: 'Network is busy. Please wait a moment and try again.',
        requiresUserAction: false,
        queued: true,
        delay: 5000, // 5 second delay
        canRetry: true,
        maxRetries: 3
      };
    }

    // 3. Handle transaction timeout or network congestion
    if (errorMessage.includes('timeout') || errorMessage.includes('network congestion')) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'network_congestion_error', 'Network congestion detected', {
        error: errorMessage,
        operation,
        recovery: 'exponential_backoff'
      });

      return {
        category: ErrorCategory.BLOCKCHAIN,
        userMessage: 'Network is experiencing high traffic. Retrying with exponential backoff.',
        requiresUserAction: false,
        queued: true,
        delay: Math.min(5000 * Math.pow(2, (context.attempt || 0)), 30000), // Exponential backoff up to 30s
        canRetry: true,
        maxRetries: 5
      };
    }

    // 4. Handle user rejection errors
    if (errorMessage.includes('User rejected') || errorMessage.includes('user denied')) {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'user_rejection_error', 'User rejected transaction', {
        error: errorMessage,
        operation
      });

      return {
        category: ErrorCategory.WALLET,
        userMessage: 'Transaction was cancelled. Please try again when ready.',
        requiresUserAction: true,
        queued: false,
        canRetry: false
      };
    }

    // 5. Check if it's a gas-related error
    if (errorMessage.toLowerCase().includes('insufficient') ||
        errorMessage.toLowerCase().includes('gas')) {
      return this.handleGasError(error, recovery, context);
    }

    // For other blockchain errors, add to retry queue
    const retryKey = `blockchain-${operation}-${Date.now()}`;

    if (this.retryQueue.length < 50) {
      this.retryQueue.push({
        id: retryKey,
        error,
        recovery,
        context,
        attempts: 0,
        maxRetries,
        nextRetry: Date.now() + recovery.delay
      });

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'blockchain_error_queued', 'Blockchain error queued for retry', {
        retryKey,
        operation,
        delay: recovery.delay
      });

      this.processRetryQueue();
    }

    return {
      success: false,
      queued: true,
      userMessage: recovery.userMessage,
      category: ErrorCategory.BLOCKCHAIN
    };
  }

  // Handle gas-related errors specifically
  async handleGasError(error, recovery, context) {
    logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'gas_error', 'Gas estimation error detected', {
      error: error.message,
      operation: context.operation
    });

    // Emit event to notify UI about gas issues
    this.emitGasErrorEvent(error, context);

    return {
      success: false,
      requiresUserAction: true,
      userMessage: 'Transaction requires more gas. Please adjust gas settings.',
      category: ErrorCategory.BLOCKCHAIN,
      subCategory: 'gas'
    };
  }

  // Storage error recovery
  async handleStorageError(error, recovery, context) {
    const { operation, maxRetries = recovery.maxRetries } = context;
    const retryKey = `storage-${operation}-${Date.now()}`;

    // Add to retry queue for storage errors
    if (this.retryQueue.length < 50) {
      this.retryQueue.push({
        id: retryKey,
        error,
        recovery,
        context,
        attempts: 0,
        maxRetries,
        nextRetry: Date.now() + recovery.delay
      });

      logger.info(LogComponent.STORAGE_SERVICE, 'storage_error_queued', 'Storage error queued for retry', {
        retryKey,
        operation,
        delay: recovery.delay
      });

      this.processRetryQueue();
    }

    return {
      success: false,
      queued: true,
      userMessage: recovery.userMessage,
      category: ErrorCategory.STORAGE
    };
  }

  // Validation error recovery
  async handleValidationError(error, recovery, context) {
    logger.warn(LogComponent.UI_COMPONENT, 'validation_error', 'Validation error detected', {
      error: error.message,
      operation: context.operation
    });

    // Validation errors don't need retry, just user feedback
    return {
      success: false,
      requiresUserAction: true,
      userMessage: recovery.userMessage,
      category: ErrorCategory.VALIDATION,
      details: error.details || {}
    };
  }

  // Permission error recovery
  async handlePermissionError(error, recovery, context) {
    logger.error(LogComponent.UI_COMPONENT, 'permission_error', 'Permission error detected', {
      error: error.message,
      operation: context.operation
    });

    // Permission errors don't need retry
    return {
      success: false,
      requiresUserAction: false,
      userMessage: recovery.userMessage,
      category: ErrorCategory.PERMISSION
    };
  }

  // Rate limit error recovery
  async handleRateLimitError(error, recovery, context) {
    const { operation } = context;
    const retryKey = `ratelimit-${operation}-${Date.now()}`;

    // Add to retry queue with longer delay
    if (this.retryQueue.length < 50) {
      this.retryQueue.push({
        id: retryKey,
        error,
        recovery,
        context,
        attempts: 0,
        maxRetries: 1, // Only retry once for rate limits
        nextRetry: Date.now() + recovery.delay
      });

      logger.warn(LogComponent.PERFORMANCE, 'rate_limit_queued', 'Rate limit error queued for retry', {
        retryKey,
        operation,
        delay: recovery.delay
      });

      this.processRetryQueue();
    }

    return {
      success: false,
      queued: true,
      userMessage: recovery.userMessage,
      category: ErrorCategory.RATE_LIMIT
    };
  }

  // Unknown error recovery
  async handleUnknownError(error, recovery, context) {
    const { operation } = context;

    logger.error(LogComponent.PERFORMANCE, 'unknown_error', 'Unknown error encountered', {
      error: error.message,
      operation,
      stack: error.stack
    });

    // For unknown errors, provide basic retry with fallback
    return {
      success: false,
      userMessage: recovery.userMessage,
      category: ErrorCategory.UNKNOWN,
      fallbackToOffline: true
    };
  }

  // Process retry queue
  async processRetryQueue() {
    if (this.isProcessingQueue || this.retryQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    logger.info(LogComponent.PERFORMANCE, 'retry_queue_processing', 'Starting retry queue processing', {
      queueSize: this.retryQueue.length
    });

    const now = Date.now();
    const readyItems = this.retryQueue.filter(item => now >= item.nextRetry);

    for (const item of readyItems) {
      if (this.activeRetries.size >= this.maxConcurrentRetries) {
        break; // Respect concurrency limit
      }

      if (this.activeRetries.has(item.id)) {
        continue; // Already being processed
      }

      this.activeRetries.add(item.id);
      this.processRetryItem(item);
    }

    this.isProcessingQueue = false;
  }

  // Process individual retry item
  async processRetryItem(item) {
    try {
      item.attempts++;

      logger.info(LogComponent.PERFORMANCE, 'retry_attempt', 'Attempting to retry operation', {
        retryId: item.id,
        attempts: item.attempts,
        maxRetries: item.maxRetries,
        operation: item.context.operation
      });

      // Here you would implement the actual retry logic
      // For now, we'll just simulate success/failure
      const success = await this.attemptOperationRetry(item);

      if (success) {
        // Remove from queue
        this.retryQueue = this.retryQueue.filter(q => q.id !== item.id);
        logger.info(LogComponent.PERFORMANCE, 'retry_success', 'Retry succeeded', {
          retryId: item.id,
          attempts: item.attempts
        });

        // Emit success event
        this.emitRetrySuccessEvent(item);
      } else if (item.attempts >= item.maxRetries) {
        // Remove from queue after max retries
        this.retryQueue = this.retryQueue.filter(q => q.id !== item.id);
        logger.warn(LogComponent.PERFORMANCE, 'retry_exhausted', 'Max retries exhausted', {
          retryId: item.id,
          attempts: item.attempts
        });

        // Emit failure event
        this.emitRetryFailureEvent(item);
      } else {
        // Schedule next retry
        item.nextRetry = Date.now() + (item.recovery.delay * item.attempts);
        logger.info(LogComponent.PERFORMANCE, 'retry_scheduled', 'Next retry scheduled', {
          retryId: item.id,
          nextRetryIn: item.nextRetry - Date.now()
        });
      }

    } catch (error) {
      logger.error(LogComponent.PERFORMANCE, 'retry_error', 'Error during retry processing', {
        retryId: item.id,
        error: error.message
      });

      // Remove from queue on processing error
      this.retryQueue = this.retryQueue.filter(q => q.id !== item.id);
    } finally {
      this.activeRetries.delete(item.id);
    }
  }

  // Simulate operation retry (replace with actual logic)
  async attemptOperationRetry(item) {
    // This would be replaced with actual operation-specific retry logic
    return Math.random() > 0.7; // 30% success rate for simulation
  }

  // Event emission methods
  emitWalletErrorEvent(error, context) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wallet-error', {
        detail: { error, context }
      }));
    }
  }

  emitGasErrorEvent(error, context) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gas-error', {
        detail: { error, context }
      }));
    }
  }

  emitRetrySuccessEvent(item) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('retry-success', {
        detail: { item }
      }));
    }
  }

  emitRetryFailureEvent(item) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('retry-failure', {
        detail: { item }
      }));
    }
  }

  // Get retry queue status
  getRetryQueueStatus() {
    return {
      queueSize: this.retryQueue.length,
      activeRetries: this.activeRetries.size,
      isProcessing: this.isProcessingQueue,
      readyForRetry: this.retryQueue.filter(item => Date.now() >= item.nextRetry).length
    };
  }

  // Clear retry queue
  clearRetryQueue() {
    const cleared = this.retryQueue.length;
    this.retryQueue = [];
    this.activeRetries.clear();

    logger.info(LogComponent.PERFORMANCE, 'retry_queue_cleared', 'Retry queue cleared', {
      itemsCleared: cleared
    });

    return cleared;
  }

  // Trigger comprehensive cache cleanup across all services
  triggerGlobalCacheCleanup(error, context) {
    logger.warn(LogComponent.PERFORMANCE, 'global_cache_cleanup', 'Triggering global cache cleanup for invalid objects', {
      error: error.message,
      context: context.operation || 'unknown'
    });

    try {
      // Clear caches in all blockchain-related services

      // 1. Clear Sui service cache
      if (typeof window !== 'undefined' && window.browserSuiService) {
        if (typeof window.browserSuiService.clearInvalidObjectCache === 'function') {
          window.browserSuiService.clearInvalidObjectCache();
        }
      }

      // 2. Clear wallet manager cache
      if (typeof window !== 'undefined' && window.browserWalletManager) {
        if (typeof window.browserWalletManager.clearInvalidObjects === 'function') {
          window.browserWalletManager.clearInvalidObjects();
        }
      }

      // 3. Clear blockchain adapter cache
      if (typeof window !== 'undefined' && window.walSheetzBlockchainAdapter) {
        if (typeof window.walSheetzBlockchainAdapter.clearInvalidObjectCache === 'function') {
          window.walSheetzBlockchainAdapter.clearInvalidObjectCache();
        }
      }

      // 4. Clear Walrus service cache
      if (typeof window !== 'undefined' && window.browserWalrusService) {
        if (typeof window.browserWalrusService.clearInvalidObjectCache === 'function') {
          window.browserWalrusService.clearInvalidObjectCache();
        }
      }

      // 5. Emit global cache clear event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cache-invalidation', {
          detail: {
            error,
            context,
            reason: 'invalid_object_detected',
            timestamp: Date.now()
          }
        }));
      }

      logger.info(LogComponent.PERFORMANCE, 'global_cache_cleanup_complete', 'Global cache cleanup completed');
    } catch (cleanupError) {
      logger.error(LogComponent.PERFORMANCE, 'global_cache_cleanup_error', 'Error during global cache cleanup', {
        error: cleanupError.message
      });
    }
  }

  // Graceful shutdown
  shutdown() {
    this.clearRetryQueue();
    logger.info(LogComponent.PERFORMANCE, 'error_recovery_shutdown', 'Error Recovery Service shut down');
  }
}

// Create singleton instance
export const errorRecoveryService = new ErrorRecoveryService();

// Global access for debugging
if (typeof window !== 'undefined') {
  window.walSheetzErrorRecovery = errorRecoveryService;
}

export default errorRecoveryService;


