// @ts-nocheck - TODO: Add TypeScript types to this file
/**
 * NetworkLock Utility
 * Simple synchronization mechanism to prevent race conditions when multiple
 * components access the network preference in localStorage.
 *
 * Used by: NetworkProvider and ConfigLoader
 */

class NetworkLock {
  constructor() {
    // Flag indicating if lock is currently held
    this._locked = false;

    // Queue of callbacks waiting for lock
    this._queue = [];
  }

  /**
   * Acquire lock (block if already locked)
   * @returns {Promise<void>}
   */
  async acquireLock() {
    // If not locked, acquire immediately
    if (!this._locked) {
      this._locked = true;
      return;
    }

    // Otherwise, wait in queue
    return new Promise(resolve => {
      this._queue.push(resolve);
    });
  }

  /**
   * Release lock and wake up next waiter in queue
   */
  releaseLock() {
    if (this._queue.length > 0) {
      // Wake up next waiter
      const resolve = this._queue.shift();
      resolve();
    } else {
      // No waiters, release lock
      this._locked = false;
    }
  }

  /**
   * Execute callback within lock
   * @param {Function} callback - Async or sync function to execute
   * @returns {Promise<any>} Result of callback
   */
  async withLock(callback) {
    await this.acquireLock();
    try {
      const result = await Promise.resolve(callback());
      return result;
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Check if lock is currently held
   * @returns {boolean}
   */
  isLocked() {
    return this._locked;
  }

  /**
   * Get current queue size (for debugging)
   * @returns {number}
   */
  getQueueSize() {
    return this._queue.length;
  }

  /**
   * Reset lock (for testing)
   */
  reset() {
    this._locked = false;
    this._queue = [];
  }
}

// Export singleton instance
export const networkLock = new NetworkLock();

export default networkLock;
