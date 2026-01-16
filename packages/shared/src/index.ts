/**
 * @dreamlit/shared
 *
 * Shared utilities for Dreamlit Walrus SDK packages
 */

// Re-export types (excluding LogLevel to avoid conflict with LogConfig.LogLevel)
export {
  type Result,
  type Maybe,
  type AsyncResult,
  type Callback,
  type AsyncCallback,
  type Disposable,
  type EventHandler,
  type Config,
  type RetryOptions,
  type RateLimitOptions,
  ok,
  err,
  isDefined,
  unwrap,
  unwrapOr,
} from './types/index.js';

// Re-export logging (interface-based logging)
export * from './logging/index.js';

// Re-export events
export * from './events/index.js';

// Re-export config
export * from './config/index.js';

// Re-export network
export * from './network/index.js';

// Re-export cell utilities
export * from './utils/cellUtils.js';

// Re-export blockchain utilities
export * from './utils/blockchain/ExplorerLinks.js';
export * from './utils/blockchain/AbiHelpers.js';

// Re-export application-specific Logger (with LogLevel constant, LogComponent, etc.)
export * from './utils/Logger.js';
export * from './utils/LogConfig.js';

// Re-export EventBus for transaction events
export * from './utils/EventBus.js';

// Re-export RateLimiter
export { default as RateLimiter } from './utils/RateLimiter.js';

// Re-export ConfigLoader
export { configLoader } from './utils/ConfigLoader.js';

// Re-export NetworkLock
export { networkLock } from './utils/NetworkLock.js';

// Re-export StandardizedErrorHandler
export * from './utils/StandardizedErrorHandler.js';

// Re-export error classes
export * from './utils/errors.js';

// Re-export schemas
export * from './schemas/index.js';
