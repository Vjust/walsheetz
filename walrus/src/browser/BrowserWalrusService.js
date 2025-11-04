// Browser-compatible Walrus service for WalSheetz - Refactored thin facade
import { getCurrentConfig } from "../config/BlockchainConfig.js";
import { configLoader } from "../shared/ConfigLoader.js";
import RateLimiter from "../shared/RateLimiter.js";
// Note: sui-graphql-service dependency removed for standalone walrus package
// This will be available in @dreamlit/walrus-sui-core
// For now, getBlobMetadata will return null if this service is not injected

// Core modules
import { resolveWalrusEndpoints } from "../config/WalrusConfigResolver.js";
import { ProxyTransport } from "../transports/ProxyTransport.js";
import { WalrusBlobClient } from "../client/WalrusBlobClient.js";
import { WalrusConnectionManager } from "../client/WalrusConnectionManager.js";
import { HealthMonitor } from "../health/HealthMonitor.js";
import { RetryQueue } from "../retry/RetryQueue.js";

// Utility modules
import { getPoaCertificate } from "../utils/PoACertificateReader.js";
import { readBlobRange as readRange } from "../utils/BlobRangeReader.js";
import { streamBlobToGrid as streamToGrid } from "../utils/GridStreamer.js";

class BrowserWalrusService {
  constructor() {
    const config = getCurrentConfig();
    this.configLoader = configLoader;

    // Initialize rate limiters
    const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
    this.rateLimiterEnabled = !isTest && config.walrus?.features?.rateLimiterEnabled !== false;
    this.limiters = {};

    if (this.rateLimiterEnabled) {
      const rateLimits = config.walrus?.rateLimits || {};
      this.limiters.walrusAgg = new RateLimiter({
        name: 'walrus-aggregator',
        ...(rateLimits.walrusAggregator || { maxRPS: 3, burst: 3, maxConcurrent: 2 })
      });
      this.limiters.walrusPub = new RateLimiter({
        name: 'walrus-publisher',
        ...(rateLimits.walrusPublisher || { maxRPS: 1, burst: 1, maxConcurrent: 1 })
      });
    }

    // Initialize core modules (lazy, resolved when needed)
    this._endpoints = null;
    this._transport = null;
    this._blobClient = null;
    this._connectionManager = new WalrusConnectionManager();
    this._healthMonitor = null;
    this._retryQueue = new RetryQueue(50);

    // Start services (skip in test mode)
    if (!isTest) {
      this._initServices();
    } else {
      this._connectionManager.recordSuccess(); // Assume connected in tests
    }

    console.log('[BrowserWalrusService] Initialized (refactored)');
  }

  async _initServices() {
    // Lazy init endpoints and services
    await this._ensureInitialized();

    // Start health monitoring
    if (this._healthMonitor) {
      this._healthMonitor.start();
    }

    // Start retry queue processing
    this._retryQueue.start();
  }

  async _ensureInitialized() {
    if (this._blobClient) return;

    // Resolve endpoints from config
    const config = await this.configLoader.getConfig();
    this._endpoints = resolveWalrusEndpoints(config);

    // Create transport
    this._transport = new ProxyTransport(this.limiters);

    // Create blob client
    this._blobClient = new WalrusBlobClient(this._endpoints, this._transport, this._connectionManager);

    // Create health monitor (pass connectionManager for CORS/degraded mode detection)
    this._healthMonitor = new HealthMonitor(this._endpoints, this._transport, this._connectionManager);
  }

  /**
   * Store blob to Walrus
   * @param {Object} data - Spreadsheet data
   * @param {Object} options - Storage options
   * @returns {Promise<{blobId: string, contentHash: string}>}
   */
  async storeBlob(data, options = {}) {
    await this._ensureInitialized();

    try {
      return await this._blobClient.storeBlob(data, options);
    } catch (error) {
      // Add to retry queue on failure
      this._retryQueue.add({
        fn: async (d) => await this._blobClient.storeBlob(d, options),
        data
      });
      throw error;
    }
  }

  /**
   * Retrieve blob from Walrus
   * @param {string} blobId - Blob ID
   * @param {string|Object} expectedHashOrOptions - Expected hash string (legacy) or options object
   * @returns {Promise<{success: boolean, data: Object, blobId: string, metadata: Object}>}
   */
  async retrieveBlob(blobId, expectedHashOrOptions = {}) {
    await this._ensureInitialized();

    // Handle legacy signature: retrieveBlob(blobId, expectedHash)
    let options = {};
    if (typeof expectedHashOrOptions === 'string') {
      // Legacy: second arg is expectedHash string
      options = {
        expectedHash: expectedHashOrOptions,
        verifyHash: true
      };
    } else if (expectedHashOrOptions) {
      // New: second arg is options object
      options = expectedHashOrOptions;
    }

    const decoded = await this._blobClient.retrieveBlob(blobId, options);

    // Return backward-compatible format: {success, data, metadata}
    return {
      success: true,
      data: decoded,
      blobId,
      metadata: {
        retrievedAt: Date.now(),
        format: 'walsheetz-v1'
      }
    };
  }

  /**
   * Check Walrus health
   * @returns {Promise<Object>} Health status
   */
  async checkWalrusHealth() {
    await this._ensureInitialized();
    return await this._healthMonitor.check();
  }

  /**
   * Get retry queue
   * @returns {Array} Retry queue items
   */
  getRetryQueue() {
    return { size: this._retryQueue.size() };
  }

  /**
   * Process retry queue manually
   * @returns {Promise<Object>} Processing results
   */
  async processRetryQueue() {
    return await this._retryQueue.process();
  }

  /**
   * Get health status
   * @returns {Object} Health status
   */
  getHealthStatus() {
    return this._healthMonitor ? this._healthMonitor.getStatus() : { isHealthy: false };
  }

  /**
   * Get connection state
   * @returns {Object} Connection state
   */
  getConnectionState() {
    return this._connectionManager.getState();
  }

  /**
   * Test connectivity (alias for checkWalrusHealth)
   * @returns {Promise<boolean>} True if connected
   */
  async connect() {
    const status = await this.checkWalrusHealth();
    return status.isHealthy;
  }

  /**
   * Check health (alias for checkWalrusHealth for backward compatibility)
   * @returns {Promise<Object>} Health status
   */
  async checkHealth() {
    return await this.checkWalrusHealth();
  }

  /**
   * Get PoA certificate for a blob
   * @param {string} blobId - Blob ID
   * @returns {Promise<{success: boolean, blobId: string, poaStatus: string, certificate: Object}>}
   */
  async getPoACertificate(blobId) {
    await this._ensureInitialized();
    const aggregatorUrl = this._endpoints.aggregator.proxy;
    return await getPoaCertificate(aggregatorUrl, blobId, this._transport);
  }

  /**
   * Read a range of bytes from a blob
   * @param {string} blobId - Blob ID
   * @param {number} offset - Starting byte offset
   * @param {number} length - Number of bytes to read
   * @returns {Promise<{success: boolean, blobId: string, offset: number, length: number, data: ArrayBuffer, totalSize: number}>}
   */
  async readBlobRange(blobId, offset, length) {
    await this._ensureInitialized();
    const aggregatorUrl = this._endpoints.aggregator.proxy;
    return await readRange(aggregatorUrl, blobId, offset, length);
  }

  /**
   * Stream blob data as grid (2D array)
   * @param {string} blobId - Blob ID
   * @param {number} startRow - Starting row index
   * @param {number} startCol - Starting column index
   * @param {Object} options - Options {format, delimiter, maxRows, maxCols}
   * @returns {Promise<{success: boolean, data: Array<Array>, metadata: {rows: number, cols: number, format: string}}>}
   */
  async streamBlobToGrid(blobId, startRow, startCol, options = {}) {
    await this._ensureInitialized();
    return await streamToGrid(blobId, startRow, startCol, options, this._blobClient);
  }

  /**
   * Perform health check (backward compatibility)
   * @param {boolean} includeAggregator - Whether to check aggregator
   * @returns {Promise<Object>} Health status
   */
  async performHealthCheck(includeAggregator = true) {
    return await this.checkWalrusHealth();
  }

  /**
   * Check publisher health (backward compatibility)
   * @param {string} requestId - Optional request ID for logging
   * @returns {Promise<{healthy: boolean, available: boolean, degraded: boolean, corsBlocked: boolean, reason: string|null}>}
   */
  async checkPublisherHealth(requestId = '') {
    await this._ensureInitialized();

    const publisherUrl = this._endpoints.publisher.proxy;

    try {
      const response = await fetch(`${publisherUrl}/v1/api`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      const healthy = response.ok;

      if (healthy) {
        this._connectionManager.recordSuccess();
      }

      const degraded = this._connectionManager.isDegraded;
      const corsBlocked = degraded;

      return {
        healthy,
        available: healthy,
        degraded,
        corsBlocked,
        reason: degraded ? 'cors_blocked' : null
      };
    } catch (error) {
      this._connectionManager.recordFailure(error);

      const isCors = this.isCorsError(error);
      const degraded = this._connectionManager.isDegraded;

      return {
        healthy: false,
        available: false,
        degraded,
        corsBlocked: isCors,
        reason: isCors ? 'cors_blocked' : 'network_error'
      };
    }
  }

  /**
   * Check aggregator health (backward compatibility)
   * @param {string} requestId - Optional request ID for logging
   * @returns {Promise<{healthy: boolean, available: boolean, degraded: boolean, corsBlocked: boolean, reason: string|null}>}
   */
  async checkAggregatorHealth(requestId = '') {
    await this._ensureInitialized();

    const aggregatorUrl = this._endpoints.aggregator.proxy;

    try {
      const response = await fetch(`${aggregatorUrl}/v1/api`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      const healthy = response.ok;

      if (healthy) {
        this._connectionManager.recordSuccess();
      }

      const degraded = this._connectionManager.isDegraded;
      const corsBlocked = degraded;

      return {
        healthy,
        available: healthy,
        degraded,
        corsBlocked,
        reason: degraded ? 'cors_blocked' : null
      };
    } catch (error) {
      this._connectionManager.recordFailure(error);

      const isCors = this.isCorsError(error);
      const degraded = this._connectionManager.isDegraded;

      return {
        healthy: false,
        available: false,
        degraded,
        corsBlocked: isCors,
        reason: isCors ? 'cors_blocked' : 'network_error'
      };
    }
  }

  /**
   * Check if error is CORS-related
   * @param {Error} error - Error to check
   * @returns {boolean} True if CORS error
   */
  isCorsError(error) {
    const message = error.message || '';
    return (
      message.includes('Failed to fetch') ||
      message.includes('ERR_NAME_NOT_RESOLVED') ||
      message.includes('CORS') ||
      message.includes('NetworkError'));

  }

  // ============================================================================
  // MISSING METHODS - Added for backward compatibility
  // ============================================================================

  /**
   * Get blob metadata from Sui blockchain (delegation to suiGraphQLService)
   * @param {string} blobId - Blob ID
   * @returns {Promise<Object>} Blob metadata
   */
  async getBlobMetadata(blobId) {
    // Stub: This functionality requires Sui GraphQL service from walrus-sui-core
    console.warn('@dreamlit/walrus: getBlobMetadata requires @dreamlit/walrus-sui-core package');
    return null;
  }

  /**
   * Get detailed retry queue status (enhanced version of getRetryQueue)
   * @returns {Object} Detailed retry queue status
   */
  getRetryQueueStatus() {
    const queue = this._retryQueue;
    return {
      queueSize: queue.size(),
      readyForRetry: queue.size(), // All items are ready (simple queue)
      processingInProgress: false, // Not tracked in simple queue
      nextRetryIn: null // Not tracked in simple queue
    };
  }

  /**
   * Store spreadsheet with delta compression (STUB - fallback to storeBlob)
   * TODO: Implement delta compression logic
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {Object} newData - New spreadsheet data
   * @param {string} previousBlobId - Previous blob ID for delta calculation
   * @param {Object} options - Storage options
   * @returns {Promise<Object>} Storage result
   */
  async storeDeltaVersion(spreadsheetId, newData, previousBlobId = null, options = {}) {
    console.warn('[BrowserWalrusService] storeDeltaVersion is not yet implemented, falling back to storeBlob');
    // TODO: Implement delta compression:
    // 1. Retrieve previous version from previousBlobId
    // 2. Calculate cell-level delta (changed/added/removed cells)
    // 3. If delta is < 30% of full size, store delta
    // 4. Otherwise fallback to full storage
    // For now: just store full version
    const result = await this.storeBlob(newData, options);
    return {
      ...result,
      compressionInfo: {
        method: 'none',
        originalSize: JSON.stringify(newData).length,
        compressedSize: JSON.stringify(newData).length,
        compressionRatio: 1.0,
        deltaSize: 0
      }
    };
  }

  /**
   * Store blob with redundancy (STUB - fallback to storeBlob)
   * TODO: Implement multi-copy storage across Walrus
   * @param {Object} data - Data to store
   * @param {number} redundancyLevel - Number of copies (default 3)
   * @param {Object} metadata - Metadata
   * @returns {Promise<Object>} Storage result with redundancy info
   */
  async storeWithRedundancy(data, redundancyLevel = 3, metadata = {}) {
    console.warn('[BrowserWalrusService] storeWithRedundancy is not yet implemented, falling back to storeBlob');
    // TODO: Implement redundant storage:
    // 1. Store N copies in parallel using Promise.allSettled
    // 2. Require at least 50% success rate
    // 3. Return primary blob ID and list of redundant blob IDs
    // For now: just store single copy
    const result = await this.storeBlob(data, metadata);
    return {
      ...result,
      redundancyInfo: {
        primaryBlobId: result.blobId,
        redundantBlobIds: [], // No redundant copies yet
        successCount: 1,
        failureCount: 0,
        errors: []
      }
    };
  }

  /**
   * Extend blob storage duration (NOT IMPLEMENTED)
   * TODO: Implement Sui blockchain interaction to extend blob epochs
   * @param {string} blobId - Blob ID
   * @param {number} additionalEpochs - Additional epochs to purchase
   * @returns {Promise<Object>} Extension result
   */
  async extendBlobStorage(blobId, additionalEpochs = 10) {
    throw new Error(`[BrowserWalrusService] extendBlobStorage is not yet implemented.
      This feature requires Sui blockchain interaction to purchase additional storage epochs.
      Blob ID: ${blobId}, Requested epochs: ${additionalEpochs}`);
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    // Clear any pending request cache if it exists
    if (this._blobClient) {
      // Future: add cache clearing to blob client
    }
  }

  /**
   * Clear all data (for tests and degraded mode recovery)
   */
  clearAllData() {
    this._connectionManager.reset();
    this._retryQueue.clear();
  }

  // Backward compatibility property getters
  get isConnected() {
    return this._connectionManager.getState().isConnected;
  }

  get isDegraded() {
    return this._connectionManager.isDegraded;
  }

  set isDegraded(value) {
    // Allow tests to set degraded mode directly
    this._connectionManager.isDegraded = value;
  }

  get pendingSaves() {
    return this._connectionManager.pendingSaves;
  }

  set pendingSaves(value) {
    // Allow tests to set pending saves directly
    this._connectionManager.pendingSaves = value;
  }

  get healthStatus() {
    return this.getHealthStatus();
  }
}

// Export singleton instance
export { BrowserWalrusService };
export const browserWalrusService = new BrowserWalrusService();
export default browserWalrusService;

// Global exposure for legacy code
if (typeof window !== 'undefined') {
  window.browserWalrusService = browserWalrusService;
}