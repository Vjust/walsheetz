// @ts-nocheck - TODO: Add TypeScript types to this file
import { logger, LogComponent, ErrorCategory } from './Logger.js';

const getMessage = (error) => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  return String(error);
};

const isInstanceOf = (error, names = []) => {
  const message = getMessage(error).toLowerCase();
  const name = error && (error.name || error.constructor?.name || '');
  return names.some((needle) =>
    message.includes(needle) || name.toLowerCase().includes(needle)
  );
};

export class StandardizedErrorHandler {
  constructor() {
    this.listeners = new Set();
  }

  async processError(error, context = {}) {
    const category = this.categorizeError(error);

    const result = {
      success: false,
      error: getMessage(error) || 'Unknown error',
      category,
      userMessage: this.getUserMessage(category, error),
      recoveryActions: this.getRecoveryActions(category),
      requiresUserAction: this.requiresUserAction(category),
      canRetry: this.canRetry(category, error),
      shouldFallback: this.shouldFallback(category),
      technicalDetails: this.getTechnicalDetails(error, context),
      timestamp: Date.now()
    };

    this.logError(result, context);
    this.emit(result, context);

    return result;
  }

  categorizeError(error) {
    if (isInstanceOf(error, ['network', 'connection', 'timeout', 'fetch'])) {
      return ErrorCategory.NETWORK;
    }

    if (isInstanceOf(error, ['wallet', 'signature', 'balance', 'sui', 'gas', 'rejected'])) {
      return ErrorCategory.WALLET;
    }

    if (isInstanceOf(error, ['storage', 'walrus', 'blob', 'upload'])) {
      return ErrorCategory.STORAGE;
    }

    if (isInstanceOf(error, ['transaction', 'contract', 'blockchain', 'object'])) {
      return ErrorCategory.BLOCKCHAIN;
    }

    if (isInstanceOf(error, ['validation', 'invalid', 'format'])) {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.UNKNOWN || ErrorCategory.GENERAL || 'unknown';
  }

  getUserMessage(category, error) {
    switch (category) {
      case ErrorCategory.NETWORK:
        return 'Network issue detected. Please check your connection and retry.';
      case ErrorCategory.WALLET:
        return 'Wallet interaction failed. Please review in your wallet and try again.';
      case ErrorCategory.STORAGE:
        return 'Decentralized storage temporarily unavailable. Please retry shortly.';
      case ErrorCategory.BLOCKCHAIN:
        return 'Blockchain transaction failed. Please retry or review transaction details.';
      case ErrorCategory.VALIDATION:
        return 'Validation error encountered. Please verify your input data.';
      default:
        return getMessage(error) || 'An unexpected error occurred.';
    }
  }

  getRecoveryActions(category) {
    switch (category) {
      case ErrorCategory.NETWORK:
        return [{ action: 'retry', label: 'Retry operation', delay: 2000 }];
      case ErrorCategory.WALLET:
        return [{ action: 'review_wallet', label: 'Review in wallet' }];
      case ErrorCategory.STORAGE:
        return [{ action: 'retry', label: 'Retry save', delay: 5000 }];
      case ErrorCategory.BLOCKCHAIN:
        return [{ action: 'retry', label: 'Retry transaction', delay: 3000 }];
      case ErrorCategory.VALIDATION:
        return [{ action: 'review_data', label: 'Review your data' }];
      default:
        return [{ action: 'retry', label: 'Try again', delay: 2000 }];
    }
  }

  requiresUserAction(category) {
    return category === ErrorCategory.WALLET || category === ErrorCategory.VALIDATION;
  }

  canRetry(category, error) {
    if (category === ErrorCategory.VALIDATION) {
      return false;
    }

    if (category === ErrorCategory.BLOCKCHAIN) {
      const message = getMessage(error).toLowerCase();
      return !message.includes('notexists');
    }

    return true;
  }

  shouldFallback(category) {
    return (
      category === ErrorCategory.NETWORK ||
      category === ErrorCategory.STORAGE ||
      category === ErrorCategory.BLOCKCHAIN
    );
  }

  getTechnicalDetails(error, context) {
    return {
      errorName: error?.name || error?.constructor?.name || 'UnknownError',
      message: getMessage(error),
      stack: error?.stack,
      contextKeys: Object.keys(context || {})
    };
  }

  logError(result, context) {
    const level = result.requiresUserAction ? 'warn' : 'error';
    logger[level](LogComponent.BLOCKCHAIN_ADAPTER, 'standardized_error', 'Processed error', {
      category: result.category,
      userMessage: result.userMessage,
      canRetry: result.canRetry,
      contextKeys: result.technicalDetails.contextKeys
    });
  }

  emit(result, context) {
    if (!this.listeners.size) return;
    const payload = { detail: { errorResult: result, context, timestamp: Date.now() } };
    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch (err) {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'error_listener_failure', 'Listener threw during standardized error emission', {
          listenerName: listener.name || 'anonymous',
          error: getMessage(err)
        });
      }
    }
  }

  addErrorListener(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async handleCommonErrors(error, context = {}) {
    return this.processError(error, context);
  }
}

export const standardizedErrorHandler = new StandardizedErrorHandler();
