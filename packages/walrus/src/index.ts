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
// Shared Utilities (singletons and utilities)
// ============================================================================
export { configLoader } from './shared/ConfigLoader.js';
export { logger, LogLevel, LogComponent, RequestThrottle, globalThrottle } from './shared/Logger.js';
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
  emitCellEditComplete
} from './shared/EventBus.js';
export { default as RateLimiter } from './shared/RateLimiter.js';
export { networkLock } from './shared/NetworkLock.js';
export {
  StandardizedErrorHandler,
  standardizedErrorHandler
} from './shared/StandardizedErrorHandler.js';
export { logConfig } from './shared/LogConfig.ts';
