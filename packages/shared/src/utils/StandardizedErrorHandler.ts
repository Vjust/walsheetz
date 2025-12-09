import { logger, LogComponent, ErrorCategory } from "./Logger.js";
import { NetworkError, WalletError, ContractError, ValidationError, StorageError } from "./errors.js";

interface RecoveryAction {
  action: string;
  label: string;
  delay?: number;
  fallback?: boolean;
  external?: boolean;
}

interface TechnicalDetails {
  originalError: string;
  errorName: string | undefined;
  stack: string | undefined;
  context: string[];
  category: string;
  timestamp: number;
}

interface ErrorResult {
  success: boolean;
  error: string;
  category: string;
  userMessage: string;
  recoveryActions: RecoveryAction[];
  requiresUserAction: boolean;
  canRetry: boolean;
  shouldFallback: boolean;
  technicalDetails: TechnicalDetails;
  timestamp: number;
}

interface ErrorContext {
  [key: string]: unknown;
}

type ErrorInput = Error | string;

export class StandardizedErrorHandler {
  private errorEventBus: EventTarget | null;

  constructor() {
    this.errorEventBus = typeof window !== 'undefined' ? new EventTarget() : null;
  }

  async processError(error: ErrorInput, context: ErrorContext = {}): Promise<ErrorResult> {
    const errorResult: ErrorResult = {
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

    this.logError(errorResult, context);
    this.emitErrorEvent(errorResult, context);

    return errorResult;
  }

  categorizeError(error: ErrorInput): string {
    const errorMessage = (typeof error === 'string' ? error : error.message || '')?.toLowerCase() || '';

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

    if (
      errorMessage.includes('validation') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('format') ||
      error instanceof ValidationError
    ) {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.UNKNOWN;
  }

  generateUserMessage(error: ErrorInput): string {
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

  getRecoveryActions(error: ErrorInput, context: ErrorContext = {}): RecoveryAction[] {
    const actions: RecoveryAction[] = [];
    const category = this.categorizeError(error);
    const errorMessage = typeof error === 'string' ? error : error.message || '';

    switch (category) {
      case ErrorCategory.NETWORK:
        actions.push(
          { action: 'retry', label: 'Retry Connection', delay: 2000 },
          { action: 'check_connection', label: 'Check Internet Connection' }
        );
        break;

      case ErrorCategory.WALLET:
        if (errorMessage.includes('rejected')) {
          actions.push(
            { action: 'retry', label: 'Approve Transaction', delay: 1000 },
            { action: 'connect_wallet', label: 'Reconnect Wallet' }
          );
        } else if (errorMessage.includes('balance')) {
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

  requiresUserAction(error: ErrorInput): boolean {
    const category = this.categorizeError(error);
    const errorMessage = typeof error === 'string' ? error : error.message || '';

    return category === ErrorCategory.WALLET ||
      category === ErrorCategory.VALIDATION ||
      (category === ErrorCategory.BLOCKCHAIN && errorMessage.includes('notExists'));
  }

  canRetry(error: ErrorInput): boolean {
    const category = this.categorizeError(error);
    const errorMessage = typeof error === 'string' ? error : error.message || '';

    return category !== ErrorCategory.VALIDATION &&
      !(category === ErrorCategory.BLOCKCHAIN && errorMessage.includes('notExists'));
  }

  shouldUseFallback(error: ErrorInput): boolean {
    const category = this.categorizeError(error);

    return category === ErrorCategory.NETWORK ||
      category === ErrorCategory.STORAGE ||
      category === ErrorCategory.BLOCKCHAIN;
  }

  getTechnicalDetails(error: ErrorInput, context: ErrorContext = {}): TechnicalDetails {
    const err = typeof error === 'string' ? null : error;
    return {
      originalError: typeof error === 'string' ? error : error.message || 'Unknown error',
      errorName: err?.name || err?.constructor?.name,
      stack: err?.stack,
      context: Object.keys(context),
      category: this.categorizeError(error),
      timestamp: Date.now()
    };
  }

  logError(errorResult: ErrorResult, context: ErrorContext = {}): void {
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

  emitErrorEvent(errorResult: ErrorResult, context: ErrorContext = {}): void {
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

  addErrorListener(callback: EventListener): () => void {
    if (this.errorEventBus) {
      this.errorEventBus.addEventListener('walsheetz:error', callback);
      return () => this.errorEventBus!.removeEventListener('walsheetz:error', callback);
    }
    return () => {};
  }

  async handleCommonErrors(error: ErrorInput, context: ErrorContext = {}): Promise<ErrorResult> {
    const errorMessage = (typeof error === 'string' ? error : error.message || '')?.toLowerCase() || '';

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

    return this.processError(error, context);
  }
}

export const standardizedErrorHandler = new StandardizedErrorHandler();
