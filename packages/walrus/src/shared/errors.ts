// @ts-nocheck - TODO: Add TypeScript types to this file
/**
 * Error Hierarchy for WalSheetz Application
 *
 * Provides structured error handling with recovery strategies and user-friendly messaging.
 * These error classes integrate with the existing ErrorRecoveryService and provide
 * consistent error formatting across the application.
 */

/**
 * Base error class with common functionality
 */
export class WalSheetError extends Error {
  constructor(message, code = null, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
    this.userMessage = message; // User-friendly message
    this.recoverable = true; // Whether the user can retry

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Format error for logging and debugging
   */
  format() {
    return {
      type: this.name,
      message: this.message,
      userMessage: this.userMessage,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
      category: this.getCategory()
    };
  }

  /**
   * Get error category for classification
   */
  getCategory() {
    return 'general';
  }

  /**
   * Get recovery suggestions for the user
   */
  getRecoverySuggestions() {
    return ['Please try again'];
  }

  /**
   * Check if this error should trigger circuit breaker
   */
  shouldTripCircuitBreaker() {
    return true;
  }

  /**
   * Convert to user-friendly notification
   */
  toNotification() {
    return {
      type: 'error',
      title: this.getTitle(),
      message: this.userMessage,
      suggestions: this.getRecoverySuggestions(),
      recoverable: this.recoverable,
      code: this.code
    };
  }

  /**
   * Get user-friendly title for notifications
   */
  getTitle() {
    return 'Error';
  }
}

/**
 * Network-related errors (RPC, WebSocket, HTTP)
 */
export class NetworkError extends WalSheetError {
  constructor(message, code = null, details = {}) {
    super(message, code, details);
    this.userMessage = this.generateUserMessage();
    this.recoverable = true;
  }

  getCategory() {
    return 'network';
  }

  getTitle() {
    return 'Connection Error';
  }

  generateUserMessage() {
    if (this.code === 'TIMEOUT') {
      return 'Connection timed out. Please check your internet connection.';
    }
    if (this.code === 'OFFLINE') {
      return 'You appear to be offline. Please check your internet connection.';
    }
    if (this.code === 'RPC_ERROR') {
      return 'Unable to connect to blockchain network. The service may be temporarily unavailable.';
    }
    if (this.code === 'WEBSOCKET_ERROR') {
      return 'Real-time connection lost. Collaboration features may be limited.';
    }
    return 'Network connection error. Please check your internet connection and try again.';
  }

  getRecoverySuggestions() {
    const suggestions = ['Check your internet connection'];

    if (this.code === 'RPC_ERROR') {
      suggestions.push('Try switching to a different RPC endpoint');
      suggestions.push('Wait a moment and try again');
    }
    if (this.code === 'WEBSOCKET_ERROR') {
      suggestions.push('Refresh the page to restore real-time features');
    }
    if (this.code === 'TIMEOUT') {
      suggestions.push('Try again with a longer timeout');
    }

    suggestions.push('Contact support if the problem persists');
    return suggestions;
  }

  shouldTripCircuitBreaker() {
    // Don't trip circuit breaker for temporary network issues
    return !['TIMEOUT', 'OFFLINE'].includes(this.code);
  }
}

/**
 * Wallet-related errors (connection, signing, balance)
 */
export class WalletError extends WalSheetError {
  constructor(message, code = null, details = {}) {
    super(message, code, details);
    this.userMessage = this.generateUserMessage();
    this.recoverable = this.isRecoverable();
  }

  getCategory() {
    return 'wallet';
  }

  getTitle() {
    return 'Wallet Error';
  }

  generateUserMessage() {
    if (this.code === 'NOT_CONNECTED') {
      return 'Wallet not connected. Please connect your Sui wallet to continue.';
    }
    if (this.code === 'USER_REJECTED') {
      return 'Transaction was rejected. Please approve the transaction to continue.';
    }
    if (this.code === 'INSUFFICIENT_BALANCE') {
      return 'Insufficient SUI tokens for this transaction. Please add more SUI to your wallet.';
    }
    if (this.code === 'INVALID_ADDRESS') {
      return 'Invalid wallet address. Please check your wallet connection.';
    }
    if (this.code === 'NETWORK_MISMATCH') {
      return 'Wallet is connected to wrong network. Please switch to Sui Testnet.';
    }
    if (this.code === 'WALLET_LOCKED') {
      return 'Wallet is locked. Please unlock your wallet and try again.';
    }
    return 'Wallet error occurred. Please check your wallet and try again.';
  }

  isRecoverable() {
    // Most wallet errors are recoverable except for fundamental issues
    return !['INVALID_ADDRESS', 'UNSUPPORTED_WALLET'].includes(this.code);
  }

  getRecoverySuggestions() {
    const suggestions = [];

    if (this.code === 'NOT_CONNECTED') {
      suggestions.push('Click the "Connect Wallet" button');
      suggestions.push('Make sure your Sui wallet extension is installed');
    } else if (this.code === 'USER_REJECTED') {
      suggestions.push('Approve the transaction in your wallet');
      suggestions.push('Check the transaction details carefully');
    } else if (this.code === 'INSUFFICIENT_BALANCE') {
      suggestions.push('Add more SUI tokens to your wallet');
      suggestions.push('Get SUI from the testnet faucet if using testnet');
    } else if (this.code === 'NETWORK_MISMATCH') {
      suggestions.push('Switch your wallet to Sui Testnet');
      suggestions.push('Check wallet network settings');
    } else if (this.code === 'WALLET_LOCKED') {
      suggestions.push('Unlock your wallet');
      suggestions.push('Enter your wallet password');
    } else {
      suggestions.push('Refresh the page and reconnect your wallet');
      suggestions.push('Try a different browser or wallet');
    }

    return suggestions;
  }

  shouldTripCircuitBreaker() {
    // Don't trip circuit breaker for user-action errors
    return !['USER_REJECTED', 'NOT_CONNECTED', 'WALLET_LOCKED'].includes(this.code);
  }
}

/**
 * Smart contract and blockchain errors
 */
export class ContractError extends WalSheetError {
  constructor(message, code = null, details = {}) {
    super(message, code, details);
    this.userMessage = this.generateUserMessage();
    this.recoverable = this.isRecoverable();
  }

  getCategory() {
    return 'contract';
  }

  getTitle() {
    return 'Blockchain Error';
  }

  generateUserMessage() {
    if (this.code === 'EXECUTION_FAILED') {
      return 'Blockchain transaction failed. Please try again.';
    }
    if (this.code === 'GAS_ESTIMATION_FAILED') {
      return 'Unable to estimate transaction cost. Please try again.';
    }
    if (this.code === 'INVALID_TRANSACTION') {
      return 'Transaction is invalid. Please refresh and try again.';
    }
    if (this.code === 'OBJECT_NOT_FOUND') {
      return 'Spreadsheet not found on blockchain. It may have been deleted.';
    }
    if (this.code === 'PERMISSION_DENIED') {
      return 'You do not have permission to perform this action.';
    }
    if (this.code === 'VERSION_MISMATCH') {
      return 'Contract version mismatch. Please refresh the page.';
    }
    if (this.code === 'ABI_INCOMPATIBLE') {
      return 'Application needs to be updated. Please refresh the page.';
    }
    return 'Blockchain operation failed. Please try again.';
  }

  isRecoverable() {
    // Some contract errors are not recoverable
    return !['OBJECT_NOT_FOUND', 'PERMISSION_DENIED', 'VERSION_MISMATCH'].includes(this.code);
  }

  getRecoverySuggestions() {
    const suggestions = [];

    if (this.code === 'EXECUTION_FAILED') {
      suggestions.push('Wait a moment and try again');
      suggestions.push('Check if you have sufficient SUI for gas');
    } else if (this.code === 'GAS_ESTIMATION_FAILED') {
      suggestions.push('Try again in a few moments');
      suggestions.push('Check blockchain network status');
    } else if (this.code === 'OBJECT_NOT_FOUND') {
      suggestions.push('Create a new spreadsheet');
      suggestions.push('Check if the spreadsheet was deleted');
    } else if (this.code === 'PERMISSION_DENIED') {
      suggestions.push('Make sure you own this spreadsheet');
      suggestions.push('Connect with the correct wallet address');
    } else if (this.code === 'VERSION_MISMATCH' || this.code === 'ABI_INCOMPATIBLE') {
      suggestions.push('Refresh the page to update the application');
      suggestions.push('Clear browser cache if problem persists');
    } else {
      suggestions.push('Try the operation again');
      suggestions.push('Check blockchain network status');
    }

    return suggestions;
  }

  shouldTripCircuitBreaker() {
    // Trip circuit breaker for system errors, not user errors
    return ['EXECUTION_FAILED', 'VERSION_MISMATCH', 'ABI_INCOMPATIBLE'].includes(this.code);
  }
}

/**
 * Data validation and format errors
 */
export class ValidationError extends WalSheetError {
  constructor(message, code = null, details = {}) {
    super(message, code, details);
    this.userMessage = this.generateUserMessage();
    this.recoverable = true;
  }

  getCategory() {
    return 'validation';
  }

  getTitle() {
    return 'Validation Error';
  }

  generateUserMessage() {
    if (this.code === 'INVALID_CELL_DATA') {
      return 'Invalid cell data format. Please check your input.';
    }
    if (this.code === 'SPREADSHEET_TOO_LARGE') {
      return 'Spreadsheet is too large to save. Please reduce the amount of data.';
    }
    if (this.code === 'INVALID_TITLE') {
      return 'Invalid spreadsheet title. Please use a valid title.';
    }
    if (this.code === 'MALFORMED_DATA') {
      return 'Data format is corrupted. Please try reloading the spreadsheet.';
    }
    if (this.code === 'MISSING_REQUIRED_FIELD') {
      return 'Required information is missing. Please fill in all required fields.';
    }
    return 'Data validation failed. Please check your input and try again.';
  }

  getRecoverySuggestions() {
    const suggestions = [];

    if (this.code === 'INVALID_CELL_DATA') {
      suggestions.push('Check for special characters in your data');
      suggestions.push('Ensure numeric values are properly formatted');
    } else if (this.code === 'SPREADSHEET_TOO_LARGE') {
      suggestions.push('Remove unused rows and columns');
      suggestions.push('Split large data into multiple spreadsheets');
    } else if (this.code === 'INVALID_TITLE') {
      suggestions.push('Use only letters, numbers, and common symbols');
      suggestions.push('Keep title under 100 characters');
    } else if (this.code === 'MALFORMED_DATA') {
      suggestions.push('Try reloading the page');
      suggestions.push('Import the spreadsheet again');
    } else {
      suggestions.push('Review your input data');
      suggestions.push('Try with simpler data first');
    }

    return suggestions;
  }

  shouldTripCircuitBreaker() {
    // Validation errors shouldn't trip circuit breaker
    return false;
  }
}

/**
 * Storage service errors (Walrus, local storage)
 */
export class StorageError extends WalSheetError {
  constructor(message, code = null, details = {}) {
    super(message, code, details);
    this.userMessage = this.generateUserMessage();
    this.recoverable = this.isRecoverable();
  }

  getCategory() {
    return 'storage';
  }

  getTitle() {
    return 'Storage Error';
  }

  generateUserMessage() {
    if (this.code === 'WALRUS_UNAVAILABLE') {
      return 'Decentralized storage is temporarily unavailable. Your data is safe locally.';
    }
    if (this.code === 'UPLOAD_FAILED') {
      return 'Failed to upload data to storage. Please try again.';
    }
    if (this.code === 'DOWNLOAD_FAILED') {
      return 'Failed to download data from storage. Please check your connection.';
    }
    if (this.code === 'STORAGE_FULL') {
      return 'Storage quota exceeded. Please free up space or upgrade your plan.';
    }
    if (this.code === 'INVALID_BLOB_ID') {
      return 'Invalid storage reference. The data may have been moved or deleted.';
    }
    return 'Storage operation failed. Please try again.';
  }

  isRecoverable() {
    // Most storage errors are recoverable
    return !['STORAGE_FULL', 'INVALID_BLOB_ID'].includes(this.code);
  }

  getRecoverySuggestions() {
    const suggestions = [];

    if (this.code === 'WALRUS_UNAVAILABLE') {
      suggestions.push('Try again in a few minutes');
      suggestions.push('Your data remains safe in local storage');
    } else if (this.code === 'UPLOAD_FAILED') {
      suggestions.push('Check your internet connection');
      suggestions.push('Try uploading again');
    } else if (this.code === 'DOWNLOAD_FAILED') {
      suggestions.push('Refresh the page and try again');
      suggestions.push('Check if the file still exists');
    } else if (this.code === 'STORAGE_FULL') {
      suggestions.push('Delete old or unused spreadsheets');
      suggestions.push('Contact support for storage upgrade options');
    } else {
      suggestions.push('Try the operation again');
      suggestions.push('Check your connection and available space');
    }

    return suggestions;
  }
}

/**
 * Error factory for creating appropriate error types
 */
export class ErrorFactory {
  static create(category, message, code = null, details = {}) {
    switch (category) {
      case 'network':
        return new NetworkError(message, code, details);
      case 'wallet':
        return new WalletError(message, code, details);
      case 'contract':
        return new ContractError(message, code, details);
      case 'validation':
        return new ValidationError(message, code, details);
      case 'storage':
        return new StorageError(message, code, details);
      default:
        return new WalSheetError(message, code, details);
    }
  }

  /**
   * Convert existing Error to appropriate WalSheetError
   */
  static fromError(error, category = null, code = null) {
    if (error instanceof WalSheetError) {
      return error;
    }

    // Auto-detect category from error message or type
    if (!category) {
      category = this.detectCategory(error);
    }

    // Auto-detect code from error message
    if (!code) {
      code = this.detectCode(error);
    }

    const details = {
      originalError: error.name,
      originalMessage: error.message,
      stack: error.stack
    };

    return this.create(category, error.message, code, details);
  }

  /**
   * Detect error category from error details
   */
  static detectCategory(error) {
    const message = error.message?.toLowerCase() || '';

    if (message.includes('network') || message.includes('timeout') ||
        message.includes('connection') || message.includes('fetch')) {
      return 'network';
    }
    if (message.includes('wallet') || message.includes('sign') ||
        message.includes('balance') || message.includes('rejected')) {
      return 'wallet';
    }
    if (message.includes('contract') || message.includes('transaction') ||
        message.includes('gas') || message.includes('execution')) {
      return 'contract';
    }
    if (message.includes('validation') || message.includes('invalid') ||
        message.includes('format')) {
      return 'validation';
    }
    if (message.includes('storage') || message.includes('walrus') ||
        message.includes('upload') || message.includes('download')) {
      return 'storage';
    }

    return 'general';
  }

  /**
   * Detect error code from error details
   */
  static detectCode(error) {
    const message = error.message?.toLowerCase() || '';

    // Network codes
    if (message.includes('timeout')) return 'TIMEOUT';
    if (message.includes('offline')) return 'OFFLINE';
    if (message.includes('rpc')) return 'RPC_ERROR';

    // Wallet codes
    if (message.includes('rejected')) return 'USER_REJECTED';
    if (message.includes('insufficient')) return 'INSUFFICIENT_BALANCE';
    if (message.includes('not connected')) return 'NOT_CONNECTED';

    // Contract codes
    if (message.includes('execution failed')) return 'EXECUTION_FAILED';
    if (message.includes('gas estimation')) return 'GAS_ESTIMATION_FAILED';
    if (message.includes('not found')) return 'OBJECT_NOT_FOUND';

    return null;
  }
}

// Export convenience functions
export const createNetworkError = (message, code, details) =>
  new NetworkError(message, code, details);

export const createWalletError = (message, code, details) =>
  new WalletError(message, code, details);

export const createContractError = (message, code, details) =>
  new ContractError(message, code, details);

export const createValidationError = (message, code, details) =>
  new ValidationError(message, code, details);

export const createStorageError = (message, code, details) =>
  new StorageError(message, code, details);

// Export all error classes
export {};