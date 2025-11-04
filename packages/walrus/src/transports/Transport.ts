// Transport interface for Walrus storage operations
// Defines the contract for all transport implementations

/**
 * Base transport interface for Walrus blob operations
 * Implementations: ProxyTransport (via /api/walrus-*), DirectTransport (direct Walrus URLs)
 */
export class Transport {
  /**
   * Store a blob
   * @param {string} url - Publisher URL
   * @param {Uint8Array} payload - Binary blob data
   * @param {number} epochs - Storage duration in epochs
   * @returns {Promise<{blobId: string, response: Response}>}
   */
  async putBlob(url, payload, epochs) {
    throw new Error('putBlob() must be implemented by subclass');
  }

  /**
   * Retrieve a blob
   * @param {string} url - Aggregator URL
   * @param {string} blobId - Blob ID to retrieve
   * @returns {Promise<{data: Uint8Array, response: Response}>}
   */
  async getBlob(url, blobId) {
    throw new Error('getBlob() must be implemented by subclass');
  }

  /**
   * Check if a blob exists (HEAD request)
   * @param {string} url - Aggregator URL
   * @param {string} blobId - Blob ID to check
   * @returns {Promise<{exists: boolean, response: Response}>}
   */
  async headBlob(url, blobId) {
    throw new Error('headBlob() must be implemented by subclass');
  }
}
