// Core blob client for Walrus storage operations
// Orchestrates store/retrieve with encoding, validation, and transport abstraction

import { encodeSpreadsheetData, decodeSpreadsheetData, calculateContentHash } from "../utils/DataEncoder.js";
import { validateDataForWalrus } from "../utils/DataValidator.js";
import { emitOperationEvent } from "../utils/WalrusEventEmitter.js";
import { withWalrusEndpoint } from "../config/endpointHelper.js";

export class WalrusBlobClient {
  constructor(endpoints, transport, connectionManager) {
    this.endpoints = endpoints;
    this.transport = transport;
    this.connectionManager = connectionManager;
  }

  /**
   * Store blob to Walrus
   * @param {Object} data - Spreadsheet data to store
   * @param {Object} options - Storage options (epochs, compressionThreshold, etc.)
   * @returns {Promise<{blobId: string, contentHash: string, size: number}>}
   */
  async storeBlob(data, options = {}) {
    const startTime = Date.now();
    const epochs = options.epochs || 1;

    try {
      // Validate data
      const validation = validateDataForWalrus(data);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.error}`);
      }

      // Encode with optional compression
      const { data: encodedData, isCompressed, originalSize, compressedSize } = await encodeSpreadsheetData(data, options);

      // Calculate content hash for integrity
      const contentHash = await calculateContentHash(encodedData);

      // Store via transport with fallback logic
      const { blobId } = await withWalrusEndpoint('publisher', this.endpoints, async (url) => {
        return await this.transport.putBlob(url, encodedData, epochs);
      });

      // Record success
      this.connectionManager.recordSuccess();

      const duration = Date.now() - startTime;
      const requestId = `store-${startTime}`;
      emitOperationEvent('store-success', { blobId, contentHash, duration, isCompressed, size: encodedData.length });

      // Return backward-compatible format
      return {
        success: true,
        blobId,
        contentHash,
        size: encodedData.length,
        metadata: {
          originalSize,
          compressedSize: isCompressed ? compressedSize : undefined,
          compression: 'binary-json',
          uploadedAt: Date.now(),
          contentHash,
          hashAlgorithm: 'SHA-256'
        },
        timestamp: Date.now(),
        requestId
      };
    } catch (error) {
      this.connectionManager.recordFailure();

      const duration = Date.now() - startTime;
      emitOperationEvent('store-failure', { error: error.message, duration });

      throw error;
    }
  }

  /**
   * Retrieve blob from Walrus
   * @param {string} blobId - Blob ID to retrieve
   * @param {Object} options - Retrieval options (verifyHash, etc.)
   * @returns {Promise<Object>} Decoded spreadsheet data
   */
  async retrieveBlob(blobId, options = {}) {
    const startTime = Date.now();

    try {
      // Check if blob exists (optional HEAD precheck)
      if (options && options.precheck) {
        const { exists } = await withWalrusEndpoint('aggregator', this.endpoints, async (url) => {
          return await this.transport.headBlob(url, blobId);
        });

        if (!exists) {
          throw new Error(`Blob ${blobId} not found`);
        }
      }

      // Retrieve via transport with fallback logic
      const { data } = await withWalrusEndpoint('aggregator', this.endpoints, async (url) => {
        return await this.transport.getBlob(url, blobId);
      });

      // Decode (handles decompression and parsing)
      const decoded = await decodeSpreadsheetData(data);

      // Verify content hash if requested
      if (options && options.verifyHash && options.expectedHash) {
        const actualHash = await calculateContentHash(data);
        if (actualHash !== options.expectedHash) {
          throw new Error(`Content hash mismatch: expected ${options.expectedHash}, got ${actualHash}`);
        }
      }

      // Record success
      this.connectionManager.recordSuccess();

      const duration = Date.now() - startTime;
      emitOperationEvent('retrieve-success', { blobId, duration, size: data.length });

      return decoded;
    } catch (error) {
      this.connectionManager.recordFailure();

      const duration = Date.now() - startTime;
      emitOperationEvent('retrieve-failure', { blobId, error: error.message, duration });

      throw error;
    }
  }
}