/**
 * Node.js-compatible Walrus service for CLI/server usage
 *
 * Differences from BrowserWalrusService:
 * - Uses undici for fetch polyfill (optional dependency)
 * - No window/localStorage dependencies
 * - File system-based persistence instead of localStorage
 * - Direct transport (no CORS proxy needed)
 * - CLI-friendly logging
 */

import {
  configLoader,
  RateLimiter,
  resolveWalrusEndpoints,
  DirectTransport,
  WalrusBlobClient,
  WalrusConnectionManager,
  HealthMonitor,
  RetryQueue
} from '@dreamlit/walrus';

// Import getCurrentConfig from our own blockchain module
import { getCurrentConfig } from '../blockchain/config.js';

// Polyfill fetch for Node.js if needed
let fetchImpl: any = globalThis.fetch;
if (!fetchImpl || typeof fetchImpl !== 'function') {
  try {
    // Try to load undici (optional dependency)
    const undici = await import('undici');
    fetchImpl = (undici as any).fetch;
    (globalThis as any).fetch = fetchImpl;
  } catch (error) {
    const err = error as Error;
    console.warn('[NodeWalrusService] undici not found. Install with: npm install undici');
    console.warn('[NodeWalrusService] Some features may not work without fetch polyfill');
  }
}

class NodeWalrusService {
  private configLoader: typeof configLoader;
  private options: Record<string, unknown>;
  private rateLimiterEnabled: boolean;
  private limiters: Record<string, RateLimiter>;
  private _endpoints: ReturnType<typeof resolveWalrusEndpoints> | null;
  private _transport: DirectTransport | null;
  private _blobClient: WalrusBlobClient | null;
  private _connectionManager: WalrusConnectionManager;
  private _healthMonitor: HealthMonitor | null;
  private _retryQueue: RetryQueue;

  constructor(options: Record<string, unknown> = {}) {
    const config = getCurrentConfig();
    this.configLoader = configLoader;
    this.options = options;

    // Initialize rate limiters (always enabled in Node, no test mode check needed)
    this.rateLimiterEnabled = options.rateLimiterEnabled !== false;
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

    // Auto-initialize unless disabled
    if (options.autoInit !== false) {
      this._initServices();
    }

    if (options.verbose) {
      console.log('[NodeWalrusService] Initialized for Node.js/CLI');
    }
  }

  async _initServices(): Promise<void> {
    await this._ensureInitialized();

    // Start health monitoring
    if (this._healthMonitor) {
      this._healthMonitor.start();
    }

    // Start retry queue processing
    this._retryQueue.start();
  }

  async _ensureInitialized(): Promise<void> {
    if (this._blobClient) return;

    // Resolve endpoints from config
    const config = await this.configLoader.getConfig();
    this._endpoints = resolveWalrusEndpoints(config);

    // Use DirectTransport for Node (no CORS proxy needed)
    this._transport = new DirectTransport(this.limiters);

    // Create blob client
    this._blobClient = new WalrusBlobClient(this._endpoints, this._transport, this._connectionManager);

    // Create health monitor
    this._healthMonitor = new HealthMonitor(this._endpoints, this._transport, this._connectionManager);
  }

  /**
   * Store blob to Walrus
   * @param {Object} data - Data to store
   * @param {Object} options - Storage options
   * @returns {Promise<{blobId: string, contentHash: string}>}
   */
  async storeBlob(data: any, options: Record<string, any> = {}): Promise<any> {
    await this._ensureInitialized();

    try {
      return await this._blobClient.storeBlob(data, options);
    } catch (error) {
      const err = error as Error;
      // Add to retry queue on failure
      this._retryQueue.add({
        fn: async (d: any) => await this._blobClient.storeBlob(d, options),
        data
      });
      throw err;
    }
  }

  /**
   * Retrieve blob from Walrus
   * @param {string} blobId - Blob ID
   * @param {Object} options - Retrieval options
   * @returns {Promise<{success: boolean, data: Object, blobId: string, metadata: Object}>}
   */
  async retrieveBlob(blobId: string, options: Record<string, any> = {}): Promise<any> {
    await this._ensureInitialized();

    const decoded = await this._blobClient.retrieveBlob(blobId, options);

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
  async checkWalrusHealth(): Promise<any> {
    await this._ensureInitialized();
    return await this._healthMonitor.check();
  }

  /**
   * Get retry queue status
   * @returns {Object} Queue status
   */
  getRetryQueue(): any {
    return { size: this._retryQueue.size() };
  }

  /**
   * Process retry queue manually
   * @returns {Promise<Object>} Processing results
   */
  async processRetryQueue(): Promise<any> {
    return await this._retryQueue.process();
  }

  /**
   * Get health status
   * @returns {Object} Health status
   */
  getHealthStatus(): any {
    return this._healthMonitor ? this._healthMonitor.getStatus() : { isHealthy: false };
  }

  /**
   * Get connection state
   * @returns {Object} Connection state
   */
  getConnectionState(): any {
    return this._connectionManager.getState();
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown(): Promise<void> {
    if (this._healthMonitor) {
      this._healthMonitor.stop();
    }
    this._retryQueue.clear();
    if (this.options.verbose) {
      console.log('[NodeWalrusService] Shutdown complete');
    }
  }

  // Backward compatibility aliases
  async connect(): Promise<boolean> {
    const status = await this.checkWalrusHealth();
    return status.isHealthy;
  }

  async checkHealth(): Promise<any> {
    return await this.checkWalrusHealth();
  }

  get isConnected() {
    return this._connectionManager.getState().isConnected;
  }

  get isDegraded() {
    return this._connectionManager.isDegraded;
  }

  get healthStatus() {
    return this.getHealthStatus();
  }
}

// Export class and singleton
export { NodeWalrusService };
export const nodeWalrusService = new NodeWalrusService({ autoInit: false, verbose: false });
export default NodeWalrusService;
