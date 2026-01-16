/**
 * Error Hierarchy for WalSheetz Application
 */

type ErrorCode = string | null;
type ErrorCategory = 'network' | 'wallet' | 'contract' | 'validation' | 'storage' | 'general';

interface ErrorDetails {
  [key: string]: unknown;
}

interface ErrorNotification {
  type: string;
  title: string;
  message: string;
  suggestions: string[];
  recoverable: boolean;
  code: ErrorCode;
}

interface FormattedError {
  type: string;
  message: string;
  userMessage: string;
  code: ErrorCode;
  details: ErrorDetails;
  timestamp: number;
  recoverable: boolean;
  category: string;
}

export class WalSheetError extends Error {
  code: ErrorCode;
  details: ErrorDetails;
  timestamp: number;
  userMessage: string;
  recoverable: boolean;

  constructor(message: string, code: ErrorCode = null, details: ErrorDetails = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
    this.userMessage = message;
    this.recoverable = true;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  format(): FormattedError {
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

  getCategory(): string {
    return 'general';
  }

  getRecoverySuggestions(): string[] {
    return ['Please try again'];
  }

  shouldTripCircuitBreaker(): boolean {
    return true;
  }

  toNotification(): ErrorNotification {
    return {
      type: 'error',
      title: this.getTitle(),
      message: this.userMessage,
      suggestions: this.getRecoverySuggestions(),
      recoverable: this.recoverable,
      code: this.code
    };
  }

  getTitle(): string {
    return 'Error';
  }
}

export class NetworkError extends WalSheetError {
  constructor(message: string, code: ErrorCode = null, details: ErrorDetails = {}) {
    super(message, code, details);
    this.userMessage = this.generateUserMessage();
    this.recoverable = true;
  }

  getCategory(): string { return 'network'; }
  getTitle(): string { return 'Connection Error'; }

  private generateUserMessage(): string {
    if (this.code === 'TIMEOUT') return 'Connection timed out. Please check your internet connection.';
    if (this.code === 'OFFLINE') return 'You appear to be offline. Please check your internet connection.';
    if (this.code === 'RPC_ERROR') return 'Unable to connect to blockchain network. The service may be temporarily unavailable.';
    if (this.code === 'WEBSOCKET_ERROR') return 'Real-time connection lost. Some live updates may be delayed.';
    return 'Network connection error. Please check your internet connection and try again.';
  }

  getRecoverySuggestions(): string[] {
    const suggestions = ['Check your internet connection'];
    if (this.code === 'RPC_ERROR') { suggestions.push('Try switching to a different RPC endpoint', 'Wait a moment and try again'); }
    if (this.code === 'WEBSOCKET_ERROR') { suggestions.push('Refresh the page to retry'); }
    if (this.code === 'TIMEOUT') { suggestions.push('Try again with a longer timeout'); }
    suggestions.push('Contact support if the problem persists');
    return suggestions;
  }

  shouldTripCircuitBreaker(): boolean {
    return !['TIMEOUT', 'OFFLINE'].includes(this.code || '');
  }
}

export class WalletError extends WalSheetError {
  constructor(message: string, code: ErrorCode = null, details: ErrorDetails = {}) {
    super(message, code, details);
    this.userMessage = this.generateUserMessage();
    this.recoverable = this.isRecoverable();
  }

  getCategory(): string { return 'wallet'; }
  getTitle(): string { return 'Wallet Error'; }

  private generateUserMessage(): string {
    if (this.code === 'NOT_CONNECTED') return 'Wallet not connected. Please connect your Sui wallet to continue.';
    if (this.code === 'USER_REJECTED') return 'Transaction was rejected. Please approve the transaction to continue.';
    if (this.code === 'INSUFFICIENT_BALANCE') return 'Insufficient SUI tokens for this transaction. Please add more SUI to your wallet.';
    if (this.code === 'INVALID_ADDRESS') return 'Invalid wallet address. Please check your wallet connection.';
    if (this.code === 'NETWORK_MISMATCH') return 'Wallet is connected to wrong network. Please switch to Sui Testnet.';
    if (this.code === 'WALLET_LOCKED') return 'Wallet is locked. Please unlock your wallet and try again.';
    return 'Wallet error occurred. Please check your wallet and try again.';
  }

  private isRecoverable(): boolean {
    return !['INVALID_ADDRESS', 'UNSUPPORTED_WALLET'].includes(this.code || '');
  }

  getRecoverySuggestions(): string[] {
    const suggestions: string[] = [];
    if (this.code === 'NOT_CONNECTED') { suggestions.push('Click the "Connect Wallet" button', 'Make sure your Sui wallet extension is installed'); }
    else if (this.code === 'USER_REJECTED') { suggestions.push('Approve the transaction in your wallet', 'Check the transaction details carefully'); }
    else if (this.code === 'INSUFFICIENT_BALANCE') { suggestions.push('Add more SUI tokens to your wallet', 'Get SUI from the testnet faucet if using testnet'); }
    else if (this.code === 'NETWORK_MISMATCH') { suggestions.push('Switch your wallet to Sui Testnet', 'Check wallet network settings'); }
    else if (this.code === 'WALLET_LOCKED') { suggestions.push('Unlock your wallet', 'Enter your wallet password'); }
    else { suggestions.push('Refresh the page and reconnect your wallet', 'Try a different browser or wallet'); }
    return suggestions;
  }

  shouldTripCircuitBreaker(): boolean {
    return !['USER_REJECTED', 'NOT_CONNECTED', 'WALLET_LOCKED'].includes(this.code || '');
  }
}

export class ContractError extends WalSheetError {
  constructor(message: string, code: ErrorCode = null, details: ErrorDetails = {}) {
    super(message, code, details);
    this.userMessage = this.generateUserMessage();
    this.recoverable = this.isRecoverable();
  }

  getCategory(): string { return 'contract'; }
  getTitle(): string { return 'Blockchain Error'; }

  private generateUserMessage(): string {
    if (this.code === 'EXECUTION_FAILED') return 'Blockchain transaction failed. Please try again.';
    if (this.code === 'GAS_ESTIMATION_FAILED') return 'Unable to estimate transaction cost. Please try again.';
    if (this.code === 'INVALID_TRANSACTION') return 'Transaction is invalid. Please refresh and try again.';
    if (this.code === 'OBJECT_NOT_FOUND') return 'Spreadsheet not found on blockchain. It may have been deleted.';
    if (this.code === 'PERMISSION_DENIED') return 'You do not have permission to perform this action.';
    if (this.code === 'VERSION_MISMATCH') return 'Contract version mismatch. Please refresh the page.';
    if (this.code === 'ABI_INCOMPATIBLE') return 'Application needs to be updated. Please refresh the page.';
    return 'Blockchain operation failed. Please try again.';
  }

  private isRecoverable(): boolean {
    return !['OBJECT_NOT_FOUND', 'PERMISSION_DENIED', 'VERSION_MISMATCH'].includes(this.code || '');
  }

  getRecoverySuggestions(): string[] {
    const suggestions: string[] = [];
    if (this.code === 'EXECUTION_FAILED') { suggestions.push('Wait a moment and try again', 'Check if you have sufficient SUI for gas'); }
    else if (this.code === 'GAS_ESTIMATION_FAILED') { suggestions.push('Try again in a few moments', 'Check blockchain network status'); }
    else if (this.code === 'OBJECT_NOT_FOUND') { suggestions.push('Create a new spreadsheet', 'Check if the spreadsheet was deleted'); }
    else if (this.code === 'PERMISSION_DENIED') { suggestions.push('Make sure you own this spreadsheet', 'Connect with the correct wallet address'); }
    else if (this.code === 'VERSION_MISMATCH' || this.code === 'ABI_INCOMPATIBLE') { suggestions.push('Refresh the page to update the application', 'Clear browser cache if problem persists'); }
    else { suggestions.push('Try the operation again', 'Check blockchain network status'); }
    return suggestions;
  }

  shouldTripCircuitBreaker(): boolean {
    return ['EXECUTION_FAILED', 'VERSION_MISMATCH', 'ABI_INCOMPATIBLE'].includes(this.code || '');
  }
}

export class ValidationError extends WalSheetError {
  constructor(message: string, code: ErrorCode = null, details: ErrorDetails = {}) {
    super(message, code, details);
    this.userMessage = this.generateUserMessage();
    this.recoverable = true;
  }

  getCategory(): string { return 'validation'; }
  getTitle(): string { return 'Validation Error'; }

  private generateUserMessage(): string {
    if (this.code === 'INVALID_CELL_DATA') return 'Invalid cell data format. Please check your input.';
    if (this.code === 'SPREADSHEET_TOO_LARGE') return 'Spreadsheet is too large to save. Please reduce the amount of data.';
    if (this.code === 'INVALID_TITLE') return 'Invalid spreadsheet title. Please use a valid title.';
    if (this.code === 'MALFORMED_DATA') return 'Data format is corrupted. Please try reloading the spreadsheet.';
    if (this.code === 'MISSING_REQUIRED_FIELD') return 'Required information is missing. Please fill in all required fields.';
    return 'Data validation failed. Please check your input and try again.';
  }

  getRecoverySuggestions(): string[] {
    const suggestions: string[] = [];
    if (this.code === 'INVALID_CELL_DATA') { suggestions.push('Check for special characters in your data', 'Ensure numeric values are properly formatted'); }
    else if (this.code === 'SPREADSHEET_TOO_LARGE') { suggestions.push('Remove unused rows and columns', 'Split large data into multiple spreadsheets'); }
    else if (this.code === 'INVALID_TITLE') { suggestions.push('Use only letters, numbers, and common symbols', 'Keep title under 100 characters'); }
    else if (this.code === 'MALFORMED_DATA') { suggestions.push('Try reloading the page', 'Import the spreadsheet again'); }
    else { suggestions.push('Review your input data', 'Try with simpler data first'); }
    return suggestions;
  }

  shouldTripCircuitBreaker(): boolean { return false; }
}

export class StorageError extends WalSheetError {
  constructor(message: string, code: ErrorCode = null, details: ErrorDetails = {}) {
    super(message, code, details);
    this.userMessage = this.generateUserMessage();
    this.recoverable = this.isRecoverable();
  }

  getCategory(): string { return 'storage'; }
  getTitle(): string { return 'Storage Error'; }

  private generateUserMessage(): string {
    if (this.code === 'WALRUS_UNAVAILABLE') return 'Decentralized storage is temporarily unavailable. Your data is safe locally.';
    if (this.code === 'UPLOAD_FAILED') return 'Failed to upload data to storage. Please try again.';
    if (this.code === 'DOWNLOAD_FAILED') return 'Failed to download data from storage. Please check your connection.';
    if (this.code === 'STORAGE_FULL') return 'Storage quota exceeded. Please free up space or upgrade your plan.';
    if (this.code === 'INVALID_BLOB_ID') return 'Invalid storage reference. The data may have been moved or deleted.';
    return 'Storage operation failed. Please try again.';
  }

  private isRecoverable(): boolean {
    return !['STORAGE_FULL', 'INVALID_BLOB_ID'].includes(this.code || '');
  }

  getRecoverySuggestions(): string[] {
    const suggestions: string[] = [];
    if (this.code === 'WALRUS_UNAVAILABLE') { suggestions.push('Try again in a few minutes', 'Your data remains safe in local storage'); }
    else if (this.code === 'UPLOAD_FAILED') { suggestions.push('Check your internet connection', 'Try uploading again'); }
    else if (this.code === 'DOWNLOAD_FAILED') { suggestions.push('Refresh the page and try again', 'Check if the file still exists'); }
    else if (this.code === 'STORAGE_FULL') { suggestions.push('Delete old or unused spreadsheets', 'Contact support for storage upgrade options'); }
    else { suggestions.push('Try the operation again', 'Check your connection and available space'); }
    return suggestions;
  }
}

export class ErrorFactory {
  static create(category: ErrorCategory, message: string, code: ErrorCode = null, details: ErrorDetails = {}): WalSheetError {
    switch (category) {
      case 'network': return new NetworkError(message, code, details);
      case 'wallet': return new WalletError(message, code, details);
      case 'contract': return new ContractError(message, code, details);
      case 'validation': return new ValidationError(message, code, details);
      case 'storage': return new StorageError(message, code, details);
      default: return new WalSheetError(message, code, details);
    }
  }

  static fromError(error: Error, category: ErrorCategory | null = null, code: ErrorCode = null): WalSheetError {
    if (error instanceof WalSheetError) return error;
    if (!category) category = this.detectCategory(error);
    if (!code) code = this.detectCode(error);
    const details = { originalError: error.name, originalMessage: error.message, stack: error.stack };
    return this.create(category, error.message, code, details);
  }

  static detectCategory(error: Error): ErrorCategory {
    const message = error.message?.toLowerCase() || '';
    if (message.includes('network') || message.includes('timeout') || message.includes('connection') || message.includes('fetch')) return 'network';
    if (message.includes('wallet') || message.includes('sign') || message.includes('balance') || message.includes('rejected')) return 'wallet';
    if (message.includes('contract') || message.includes('transaction') || message.includes('gas') || message.includes('execution')) return 'contract';
    if (message.includes('validation') || message.includes('invalid') || message.includes('format')) return 'validation';
    if (message.includes('storage') || message.includes('walrus') || message.includes('upload') || message.includes('download')) return 'storage';
    return 'general';
  }

  static detectCode(error: Error): ErrorCode {
    const message = error.message?.toLowerCase() || '';
    if (message.includes('timeout')) return 'TIMEOUT';
    if (message.includes('offline')) return 'OFFLINE';
    if (message.includes('rpc')) return 'RPC_ERROR';
    if (message.includes('rejected')) return 'USER_REJECTED';
    if (message.includes('insufficient')) return 'INSUFFICIENT_BALANCE';
    if (message.includes('not connected')) return 'NOT_CONNECTED';
    if (message.includes('execution failed')) return 'EXECUTION_FAILED';
    if (message.includes('gas estimation')) return 'GAS_ESTIMATION_FAILED';
    if (message.includes('not found')) return 'OBJECT_NOT_FOUND';
    return null;
  }
}

export const createNetworkError = (message: string, code: ErrorCode, details: ErrorDetails = {}): NetworkError => new NetworkError(message, code, details);
export const createWalletError = (message: string, code: ErrorCode, details: ErrorDetails = {}): WalletError => new WalletError(message, code, details);
export const createContractError = (message: string, code: ErrorCode, details: ErrorDetails = {}): ContractError => new ContractError(message, code, details);
export const createValidationError = (message: string, code: ErrorCode, details: ErrorDetails = {}): ValidationError => new ValidationError(message, code, details);
export const createStorageError = (message: string, code: ErrorCode, details: ErrorDetails = {}): StorageError => new StorageError(message, code, details);
