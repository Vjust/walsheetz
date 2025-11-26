// Health monitoring for Walrus endpoints
// Performs periodic health checks and CORS detection

import { emitHealthStatusChange } from "../utils/WalrusEventEmitter.js";

export interface HealthStatus {
  lastCheck: number | null;
  isHealthy: boolean;
  publisherAvailable: boolean;
  aggregatorAvailable: boolean;
  lastError: string | null;
  consecutiveFailures: number;
  degraded?: boolean;
  reason?: string | null;
}

interface WalrusEndpoints {
  publisher: { proxy: string };
  aggregator: { proxy: string };
}

interface ConnectionManager {
  recordSuccess(): void;
  recordFailure(error?: Error): void;
  isDegraded: boolean;
}

export class HealthMonitor {
  endpoints: WalrusEndpoints;
  transport: unknown;
  connectionManager: ConnectionManager | null;
  healthStatus: HealthStatus;
  interval: ReturnType<typeof setInterval> | null;

  constructor(endpoints: WalrusEndpoints, transport: unknown, connectionManager: ConnectionManager | null = null) {
    this.endpoints = endpoints;
    this.transport = transport;
    this.connectionManager = connectionManager;
    this.healthStatus = {
      lastCheck: null,
      isHealthy: false,
      publisherAvailable: false,
      aggregatorAvailable: false,
      lastError: null,
      consecutiveFailures: 0
    };
    this.interval = null;
  }

  /**
   * Start periodic health checks
   * @param {number} intervalMs - Check interval in milliseconds (default: 5 minutes)
   */
  start(intervalMs = 300000) {
    if (this.interval) return;

    // Initial check after 5 seconds
    setTimeout(() => this.check(), 5000);

    // Periodic checks
    this.interval = setInterval(() => this.check(), intervalMs);
  }

  /**
   * Stop periodic health checks
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Perform health check on both publisher and aggregator
   * @returns {Promise<{isHealthy: boolean, publisherAvailable: boolean, aggregatorAvailable: boolean}>}
   */
  async check() {
    const startTime = Date.now();

    try {
      // Check publisher
      const publisherUrl = this.endpoints.publisher.proxy;
      const publisherOk = await this._checkEndpoint(publisherUrl);

      // Check aggregator
      const aggregatorUrl = this.endpoints.aggregator.proxy;
      const aggregatorOk = await this._checkEndpoint(aggregatorUrl);

      // Update status
      const isHealthy = publisherOk && aggregatorOk;

      // Record success/failure in connection manager
      if (this.connectionManager) {
        if (isHealthy) {
          this.connectionManager.recordSuccess();
        } else {
          this.connectionManager.recordFailure();
        }
      }

      const degraded = this.connectionManager ? this.connectionManager.isDegraded : false;
      this.healthStatus = {
        lastCheck: Date.now(),
        isHealthy,
        publisherAvailable: publisherOk,
        aggregatorAvailable: aggregatorOk,
        lastError: null,
        consecutiveFailures: isHealthy ? 0 : this.healthStatus.consecutiveFailures + 1,
        degraded,
        reason: degraded ? 'cors_blocked' : null
      };

      emitHealthStatusChange(this.healthStatus);
      return this.healthStatus;
    } catch (error) {
      this.healthStatus = {
        ...this.healthStatus,
        lastCheck: Date.now(),
        isHealthy: false,
        lastError: (error as Error).message,
        consecutiveFailures: this.healthStatus.consecutiveFailures + 1
      };

      emitHealthStatusChange(this.healthStatus);
      return this.healthStatus;
    }
  }

  /**
   * Check single endpoint health
   * @private
   */
  async _checkEndpoint(url: string) {
    try {
      const response = await fetch(`${url}/v1/api`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
      return response.ok;
    } catch (error) {
      const err = error as Error;
      // Detect CORS errors and notify connection manager
      if (err.message?.includes('Failed to fetch') || err.message?.includes('ERR_NAME_NOT_RESOLVED')) {
        console.warn('[HealthMonitor] CORS or DNS error detected:', err.message);

        // Notify connection manager of CORS error (enters degraded mode)
        if (this.connectionManager) {
          this.connectionManager.recordFailure(err);
        }
      }
      return false;
    }
  }

  /**
   * Get current health status
   * @returns {Object} Health status object
   */
  getStatus() {
    return { ...this.healthStatus };
  }
}