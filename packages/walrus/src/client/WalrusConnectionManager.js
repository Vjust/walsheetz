// Connection state management for Walrus service
// Tracks connectivity, transient failures, and last check timestamps

import { emitConnectionChange } from "@/walrus/utils/WalrusEventEmitter.js";

export class WalrusConnectionManager {
  constructor() {
    this.isConnected = false;
    this.transientFailures = 0;
    this.lastCheck = null;
    this.lastSuccessfulOperation = null;
    this.isDegraded = false;
    this.pendingSaves = [];
  }

  /**
   * Record successful operation
   */
  recordSuccess() {
    this.isConnected = true;
    this.transientFailures = 0;
    this.isDegraded = false;
    this.lastSuccessfulOperation = Date.now();
    emitConnectionChange(true);
  }

  /**
   * Record failed operation
   * @param {Error} error - Optional error object to check for CORS
   */
  recordFailure(error = null) {
    this.transientFailures++;

    // Check if error is CORS-related
    if (error && this.isCorsError(error)) {
      this.isDegraded = true;

      // Log pending saves count for monitoring
      if (this.pendingSaves.length > 0) {
        console.warn(`[WalrusConnectionManager] Save queue preserved (${this.pendingSaves.length} pending saves)`);
      }

      console.warn('[WalrusConnectionManager] CORS error detected, entering degraded mode');
    }

    if (this.transientFailures >= 3) {
      this.isConnected = false;
      emitConnectionChange(false);
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

  /**
   * Add save to pending queue (for degraded mode)
   * @param {Object} saveData - Save data to queue
   */
  addPendingSave(saveData) {
    this.pendingSaves.push(saveData);
  }

  /**
   * Clear pending saves
   */
  clearPendingSaves() {
    this.pendingSaves = [];
  }

  /**
   * Reset connection state
   */
  reset() {
    this.isConnected = false;
    this.transientFailures = 0;
    this.lastCheck = null;
    this.lastSuccessfulOperation = null;
    this.isDegraded = false;
    this.pendingSaves = [];
  }

  /**
   * Get current connection state
   * @returns {{isConnected: boolean, transientFailures: number, lastCheck: number|null, lastSuccessfulOperation: number|null}}
   */
  getState() {
    return {
      isConnected: this.isConnected,
      transientFailures: this.transientFailures,
      lastCheck: this.lastCheck,
      lastSuccessfulOperation: this.lastSuccessfulOperation
    };
  }
}