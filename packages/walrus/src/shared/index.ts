/**
 * Re-export shared utilities from @dreamlit/shared
 * This file provides backwards compatibility for imports from './shared/'
 */

// Logger and logging utilities
export {
  logger,
  LogComponent,
  LogLevel,
  RequestThrottle,
  globalThrottle,
  ErrorCategory,
} from '@dreamlit/shared';

export type { LogComponentType, ErrorCategoryType } from '@dreamlit/shared';

// Log configuration
export { logConfig, LogConfig } from '@dreamlit/shared';

// EventBus and transaction events
export {
  EventBus,
  transactionEventBus,
  eventBus,
  emitTransactionStart,
  emitTransactionStateChange,
  emitTransactionComplete,
  emitTransactionFailed,
  emitSaveStart,
  emitSaveComplete,
  emitCellEditStart,
  emitCellEditComplete,
  EVENT_SCHEMAS,
} from '@dreamlit/shared';

// RateLimiter
export { RateLimiter } from '@dreamlit/shared';

// NetworkLock
export { networkLock } from '@dreamlit/shared';

// ConfigLoader
export { configLoader } from '@dreamlit/shared';

// StandardizedErrorHandler
export { StandardizedErrorHandler, standardizedErrorHandler } from '@dreamlit/shared';

// Error classes
export {
  WalSheetError,
  NetworkError,
  WalletError,
  ContractError,
  ValidationError,
  StorageError,
  ErrorFactory,
  createNetworkError,
  createWalletError,
  createContractError,
  createValidationError,
  createStorageError,
} from '@dreamlit/shared';
