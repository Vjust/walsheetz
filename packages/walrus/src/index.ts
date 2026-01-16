/**
 * @dreamlit/walrus - Walrus Decentralized Storage Adapter
 *
 * Browser-optimized entry point for Walrus storage operations.
 * For Node.js environments, use the 'node' export.
 */

// ============================================================================
// Main Browser Service
// ============================================================================
export { BrowserWalrusService, browserWalrusService } from './browser/BrowserWalrusService.js';

// ============================================================================
// Core Modules (Pure Functions)
// ============================================================================
export {
  compressDataWithAlgorithm,
  decompressDataWithAlgorithm,
  detectCompressionAlgorithm,
  isCompressed,
  type CompressionAlgorithm,
  type CompressionResult
} from './core/compression.js';

export {
  createCellDelta,
  applyCellDelta,
  reconstructFromDelta,
  calculateDeltaEfficiency,
  type CellDelta,
  type CellChange,
  type SpreadsheetDelta
} from './core/delta.js';

export {
  verifyBlobIntegrity,
  performComprehensiveIntegrityCheck,
  type BlobIntegrityResult,
  type IntegrityCheckStep,
  type ComprehensiveIntegrityReport
} from './core/integrity.js';

// ============================================================================
// Batch Management
// ============================================================================
export { BatchManager, type BatchManagerOptions } from './batch/BatchManager.js';
export { BrowserBatchPersistence } from './batch/adapters/BrowserBatchPersistence.js';
export { NodeBatchPersistence } from './batch/adapters/NodeBatchPersistence.js';
export type { IBatchPersistence, Batch } from './batch/interfaces.js';

// ============================================================================
// Deduplication
// ============================================================================
export { DeduplicationManager } from './deduplication/DeduplicationManager.js';
export { BrowserDeduplicationRegistry } from './deduplication/adapters/BrowserDeduplicationRegistry.js';
export { NodeDeduplicationRegistry } from './deduplication/adapters/NodeDeduplicationRegistry.js';
export type { IDeduplicationRegistry, DeduplicationEntry } from './deduplication/interfaces.js';

// ============================================================================
// Client Modules
// ============================================================================
export { WalrusBlobClient } from './client/WalrusBlobClient.js';
export { WalrusConnectionManager } from './client/WalrusConnectionManager.js';
export { WalrusSdkClient } from './client/WalrusSdkClient.js';

// WalrusSdkClientLoader exports functions, not a class
export {
  loadWalrusSdkClient,
  getCachedWalrusSdkClient,
  clearCachedClient,
  isWalrusSdkReady
} from './client/WalrusSdkClientLoader.js';

// ============================================================================
// Health & Monitoring
// ============================================================================
export { HealthMonitor } from './health/HealthMonitor.js';

// ============================================================================
// Retry & Queue
// ============================================================================
export { RetryQueue } from './retry/RetryQueue.js';

// ============================================================================
// Transports
// ============================================================================
export { Transport } from './transports/Transport.js';
export { DirectTransport } from './transports/DirectTransport.js';
export { ProxyTransport } from './transports/ProxyTransport.js';

// ============================================================================
// Data Utilities (functions, not classes)
// ============================================================================
export {
  encodeSpreadsheetData,
  decodeSpreadsheetData,
  compressData,
  decompressData,
  isGzipCompressed,
  calculateContentHash
} from './utils/DataEncoder.js';

export { validateDataForWalrus } from './utils/DataValidator.js';

export { readBlobRange } from './utils/BlobRangeReader.js';
export { streamBlobToGrid } from './utils/GridStreamer.js';
export { getPoaCertificate } from './utils/PoACertificateReader.js';

export {
  emitOperationEvent,
  emitHealthStatusChange,
  emitConnectionChange
} from './utils/WalrusEventEmitter.js';

// ============================================================================
// Configuration
// ============================================================================
export { resolveWalrusEndpoints } from './config/WalrusConfigResolver.js';
export { withWalrusEndpoint } from './config/endpointHelper.js';
export {
  config as walrusConfig,
  getCurrentConfig,
  getSuiContractConfig,
  isTestnet,
  isMainnet
} from './config/BlockchainConfig.js';

// ============================================================================
// Shared Utilities (re-exported from @dreamlit/shared)
// ============================================================================
export {
  // Logger and logging
  logger,
  LogLevel,
  LogComponent,
  RequestThrottle,
  globalThrottle,
  ErrorCategory,
  logConfig,
  LogConfig,
  // EventBus
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
  // RateLimiter
  RateLimiter,
  // NetworkLock
  networkLock,
  // ConfigLoader
  configLoader,
  // StandardizedErrorHandler
  StandardizedErrorHandler,
  standardizedErrorHandler,
  // Error classes
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
} from './shared/index.js';

export type { LogComponentType, ErrorCategoryType } from './shared/index.js';
