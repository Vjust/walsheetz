/**
 * @walsheetz/shared - Common Foundation
 *
 * Shared utilities and services used across all WalSheetz modules.
 * This is the foundation layer with zero external dependencies.
 *
 * @module @walsheetz/shared
 */

// ============================================================================
// Configuration & Logging
// ============================================================================

export { configLoader } from './utils/ConfigLoader.js';
export { logger } from './utils/Logger.js';
export { LogConfig } from './utils/LogConfig.js';

// ============================================================================
// Event System
// ============================================================================

export { eventBus, EventBus } from './utils/EventBus.js';

// ============================================================================
// Error Handling
// ============================================================================

export {
  WalSheetzError,
  BlockchainError,
  WalrusError,
  ValidationError,
  ConfigurationError,
  NetworkError,
  StorageError,
  AuthenticationError,
  TransactionError,
  TimeoutError,
} from './utils/errors.js';

export { StandardizedErrorHandler } from './utils/StandardizedErrorHandler.js';

// ============================================================================
// Resilience & Rate Limiting
// ============================================================================

export { ResilientExecutor } from './utils/CircuitBreaker.js';
export { RateLimiter } from './utils/RateLimiter.js';
export { NetworkLock } from './utils/NetworkLock.js';

// ============================================================================
// Validation
// ============================================================================

export {
  validateSpreadsheetId,
  validateBlobId,
  validateSuiAddress,
  validateTransactionDigest,
  guardAgainstMissingDependency,
  guardAgainstInvalidState,
  guardAgainstNullOrUndefined,
} from './utils/ValidationGuards.js';

// ============================================================================
// Development & Testing
// ============================================================================

export { devTools } from './utils/devTools.js';
export { isTestMode, enableTestMode, disableTestMode } from './utils/testMode.js';

// ============================================================================
// Telemetry & Monitoring
// ============================================================================

export { telemetry } from './utils/Telemetry.js';

// ============================================================================
// Services
// ============================================================================

export { indexedDBCache } from './services/IndexedDBCache.js';
// SentryStub is internal, not exported (it's used via import aliasing in vite/vitest)
