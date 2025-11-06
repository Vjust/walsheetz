import { logger, LogComponent, ErrorCategory } from '@utils/logging/Logger.js';
import { ErrorFactory, NetworkError, WalletError, ContractError, ValidationError, StorageError } from './errors.js';

/**
 * Standardized Error Handler for consistent error processing across service layers
 *
 * This utility provides:
 * - Consistent error categorization and logging
 * - User-friendly error message generation
 * - Recovery strategy recommendations
 * - Error event emission for UI handling
 */
export class StandardizedErrorHandler {
  constructor() {
    this.errorEventBus = typeof window !== 'undefined' ?
      new EventTarget() : null;
  }

  /**
   * Process an error and return standardized result
   */
  async processError(error, context = {}) {
    const errorResult = {
      success: false,
      error: typeof error === 'string' ? error : error.message || 'Unknown error',
      category: this.categorizeError(error),
      userMessage: this.generateUserMessage(error),
      recoveryActions: this.getRecoveryActions(error, context),
      requiresUserAction: this.requiresUserAction(error),
      canRetry: this.canRetry(error),
      shouldFallback: this.shouldUseFallback(error),
      technicalDetails: this.getTechnicalDetails(error, context),
      timestamp: Date.now()
    };

    // Log the error with standardized format
    this.logError(errorResult, context);

    // Emit error event for UI handling
    this.emitErrorEvent(errorResult, context);

    return errorResult;
  }

  /**
   * Categorize error into standard categories
   */
  categorizeError(error) {
    const errorMessage = (typeof error === 'string' ? error : error.message || '')?.toLowerCase() || '';
    const errorName = error.name || error.constructor?.name || 'Unknown';

    // Network-related errors
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('unreachable') ||
      errorMessage.includes('fetch') ||
      error instanceof NetworkError
    ) {
      return ErrorCategory.NETWORK;
    }

    // Wallet-related errors
    if (
      errorMessage.includes('wallet') ||
      errorMessage.includes('rejected') ||
      errorMessage.includes('denied') ||
      errorMessage.includes('signature') ||
      errorMessage.includes('balance') ||
      errorMessage.includes('insufficient') ||
      errorMessage.includes('gas') ||
      error instanceof WalletError
    ) {
      return ErrorCategory.WALLET;
    }

    // Storage-related errors
    if (
      errorMessage.includes('storage') ||
      errorMessage.includes('walrus') ||
      errorMessage.includes('blob') ||
      errorMessage.includes('upload') ||
      errorMessage.includes('download') ||
      error instanceof StorageError
    ) {
      return ErrorCategory.STORAGE;
    }

    // Blockchain/contract-related errors
    if (
      errorMessage.includes('blockchain') ||
      errorMessage.includes('transaction') ||
      errorMessage.includes('contract') ||
      errorMessage.includes('sui') ||
      errorMessage.includes('object') ||
      errorMessage.includes('notExists') ||
      error instanceof ContractError
    ) {
      return ErrorCategory.BLOCKCHAIN;
    }

    // Validation errors
    if (
      errorMessage.includes('validation') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('format') ||
      error instanceof ValidationError
    ) {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.GENERAL;
  }

  /**
   * Generate user-friendly error message
   */
  generateUserMessage(error) {
    const errorMessage = typeof error === 'string' ? error : error.message || 'An unexpected error occurred';
    const category = this.categorizeError(error);

    switch (category) {
      case ErrorCategory.NETWORK:
        return 'Connection issue - please check your internet connection and try again.';

      case ErrorCategory.WALLET:
        if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
          return 'Transaction was rejected by your wallet. Please approve the transaction and try again.';
        } else if (errorMessage.includes('balance') || errorMessage.includes('insufficient')) {
          return 'Insufficient SUI balance for transaction. Please add funds to your wallet and try again.';
        } else {
          return 'Wallet connection issue - please check your wallet and try again.';
        }

      case ErrorCategory.STORAGE:
        if (errorMessage.includes('walrus')) {
          return 'Decentralized storage temporarily unavailable. Your data is safe locally - try again in a few minutes.';
        } else {
          return 'Storage error occurred. Please try saving again.';
        }

      case ErrorCategory.BLOCKCHAIN:
        if (errorMessage.includes('notExists')) {
          return 'The spreadsheet no longer exists on the blockchain. Please create a new spreadsheet.';
        } else {
          return 'Blockchain transaction failed. Please try again.';
        }

      case ErrorCategory.VALIDATION:
        return 'Data validation failed. Please check your input and try again.';

      default:
        return 'An unexpected error occurred. Please try again or contact support if the problem persists.';
    }
  }

  /**
   * Get recovery actions for the error
   */
  getRecoveryActions(error, context = {}) {
    const actions = [];
    const category = this.categorizeError(error);

    switch (category) {
      case ErrorCategory.NETWORK:
        actions.push(
          { action: 'retry', label: 'Retry Connection', delay: 2000 },
          { action: 'check_connection', label: 'Check Internet Connection' }
        );
        break;

      case ErrorCategory.WALLET:
        if ((typeof error === 'string' ? error : error.message || '').includes('rejected')) {
          actions.push(
            { action: 'retry', label: 'Approve Transaction', delay: 1000 },
            { action: 'connect_wallet', label: 'Reconnect Wallet' }
          );
        } else if ((typeof error === 'string' ? error : error.message || '').includes('balance')) {
          actions.push(
            { action: 'add_funds', label: 'Add SUI Tokens', external: true },
            { action: 'retry', label: 'Retry After Adding Funds', delay: 5000 }
          );
        } else {
          actions.push(
            { action: 'connect_wallet', label: 'Reconnect Wallet' },
            { action: 'retry', label: 'Retry Operation', delay: 3000 }
          );
        }
        break;

      case ErrorCategory.STORAGE:
        actions.push(
          { action: 'retry', label: 'Retry Storage Operation', delay: 5000 },
          { action: 'fallback_local', label: 'Save Locally', fallback: true }
        );
        break;

      case ErrorCategory.BLOCKCHAIN:
        actions.push(
          { action: 'retry', label: 'Retry Transaction', delay: 3000 },
          { action: 'fallback_local', label: 'Save Locally', fallback: true }
        );
        break;

      case ErrorCategory.VALIDATION:
        actions.push(
          { action: 'review_data', label: 'Review Data' },
          { action: 'retry', label: 'Retry After Fix', delay: 1000 }
        );
        break;

      default:
        actions.push(
          { action: 'retry', label: 'Try Again', delay: 2000 },
          { action: 'contact_support', label: 'Contact Support', external: true }
        );
    }

    return actions;
  }

  /**
   * Determine if error requires user action
   */
  requiresUserAction(error) {
    const category = this.categorizeError(error);

    return category === ErrorCategory.WALLET ||
           category === ErrorCategory.VALIDATION ||
           category === ErrorCategory.BLOCKCHAIN && (typeof error === 'string' ? error : error.message || '').includes('notExists');
  }

  /**
   * Determine if error can be retried
   */
  canRetry(error) {
    const category = this.categorizeError(error);

    // Don't retry validation errors or non-existent objects
    return category !== ErrorCategory.VALIDATION &&
           !(category === ErrorCategory.BLOCKCHAIN && (typeof error === 'string' ? error : error.message || '').includes('notExists'));
  }

  /**
   * Determine if should use fallback mode
   */
  shouldUseFallback(error) {
    const category = this.categorizeError(error);

    // Use fallback for network, storage, and blockchain errors
    return category === ErrorCategory.NETWORK ||
           category === ErrorCategory.STORAGE ||
           category === ErrorCategory.BLOCKCHAIN;
  }

  /**
   * Get technical details for debugging
   */
  getTechnicalDetails(error, context = {}) {
    return {
      originalError: typeof error === 'string' ? error : error.message || 'Unknown error',
      errorName: error.name || error.constructor?.name,
      stack: error.stack,
      context: Object.keys(context),
      category: this.categorizeError(error),
      timestamp: Date.now()
    };
  }

  /**
   * Log error with standardized format
   */
  logError(errorResult, context = {}) {
    const logLevel = errorResult.requiresUserAction ? 'warn' : 'error';

    logger[logLevel](LogComponent.BLOCKCHAIN_ADAPTER, 'standardized_error', 'Standardized error processed', {
      category: errorResult.category,
      userMessage: errorResult.userMessage,
      requiresUserAction: errorResult.requiresUserAction,
      canRetry: errorResult.canRetry,
      contextKeys: Object.keys(context),
      technicalDetails: errorResult.technicalDetails
    });
  }

  /**
   * Emit error event for UI handling
   */
  emitErrorEvent(errorResult, context = {}) {
    if (this.errorEventBus) {
      this.errorEventBus.dispatchEvent(new CustomEvent('walsheetz:error', {
        detail: {
          errorResult,
          context,
          timestamp: Date.now()
        }
      }));
    }
  }

  /**
   * Add error event listener
   */
  addErrorListener(callback) {
    if (this.errorEventBus) {
      this.errorEventBus.addEventListener('walsheetz:error', callback);
      return () => this.errorEventBus.removeEventListener('walsheetz:error', callback);
    }
    return () => {}; // No-op cleanup function
  }

  /**
   * Handle common error patterns and provide specific recovery
   */
  async handleCommonErrors(error, context = {}) {
    const errorMessage = (typeof error === 'string' ? error : error.message || '')?.toLowerCase() || '';

    // Handle specific error patterns
    if (errorMessage.includes('insufficient gas')) {
      return this.processError(new WalletError('Insufficient gas for transaction. Please add more SUI tokens.', 'INSUFFICIENT_GAS'), context);
    }

    if (errorMessage.includes('user rejected')) {
      return this.processError(new WalletError('Transaction rejected by user.', 'USER_REJECTED'), context);
    }

    if (errorMessage.includes('network timeout')) {
      return this.processError(new NetworkError('Network timeout occurred.', 'TIMEOUT'), context);
    }

    if (errorMessage.includes('walrus unavailable')) {
      return this.processError(new StorageError('Walrus storage temporarily unavailable.', 'SERVICE_UNAVAILABLE'), context);
    }

    // Default error handling
    return this.processError(error, context);
  }
}

// Global standardized error handler instance
export const standardizedErrorHandler = new StandardizedErrorHandler();
