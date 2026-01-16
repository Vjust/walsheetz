// Node.js-compatible Walrus service facade

import { BatchManager } from '../batch/BatchManager.js';
import { DeduplicationManager } from '../deduplication/DeduplicationManager.js';
import { NodeBatchPersistence } from '../batch/adapters/NodeBatchPersistence.js';
import { NodeDeduplicationRegistry } from '../deduplication/adapters/NodeDeduplicationRegistry.js';
import { WalrusBlobClient } from '../client/WalrusBlobClient.js';
import { WalrusConnectionManager } from '../client/WalrusConnectionManager.js';
import { DirectTransport } from '../transports/DirectTransport.js';
import { resolveWalrusEndpoints } from '../config/WalrusConfigResolver.js';
import { configLoader } from '../shared/index.js';
import type { SpreadsheetData } from '../utils/DataEncoder.js';
import type { Batch } from '../batch/interfaces.js';

export class NodeWalrusService {
  private batchManager: BatchManager;
  private deduplicationManager: DeduplicationManager;
  private uploadCallback: ((spreadsheetId: string) => Promise<any>) | null;
  private _blobClient: WalrusBlobClient | null = null;
  private _connectionManager: WalrusConnectionManager;
  private _endpoints: any = null;

  constructor() {
    const batchPersistence = new NodeBatchPersistence();
    const deduplicationRegistry = new NodeDeduplicationRegistry();

    this.batchManager = new BatchManager(batchPersistence, {
      uploadThreshold: 100,
      timeoutMs: 30000,
      maxBatchSize: 1000
    });

    this.deduplicationManager = new DeduplicationManager(deduplicationRegistry);
    this.uploadCallback = null;
    this._connectionManager = new WalrusConnectionManager();

    console.log('[NodeWalrusService] Initialized with Node.js adapters');
  }

  private async _ensureInitialized(): Promise<void> {
    if (this._blobClient) return;

    const config = await configLoader.getConfig();
    this._endpoints = resolveWalrusEndpoints(config);
    const transport = new DirectTransport();
    this._blobClient = new WalrusBlobClient(this._endpoints, transport, this._connectionManager);
  }

  /**
   * Create payload from batch that preserves changes data
   */
  private _createBatchPayload(batch: Batch): SpreadsheetData {
    return {
      version: 1,
      spreadsheetId: batch.spreadsheetId,
      timestamp: batch.metadata.lastUpdated || Date.now(),
      metadata: {
        title: `Batch ${batch.spreadsheetId}`,
        format: 'walsheetz-batch-v1',
        createdAt: Date.now(),
        lastModified: Date.now(),
      },
      cells: {
        '__batch_changes': { v: JSON.stringify(batch.changes), t: 's' },
        '__batch_metadata': { v: JSON.stringify(batch.metadata), t: 's' }
      }
    };
  }

  /**
   * Set callback for batch upload
   */
  setUploadCallback(callback: (spreadsheetId: string) => Promise<any>): void {
    this.uploadCallback = callback;
    this.batchManager.setUploadCallback(callback);
  }

  /**
   * Add changes to batch
   */
  async batchChanges(
    spreadsheetId: string,
    changes: any[],
    options: { force?: boolean; tags?: string[] } = {}
  ): Promise<{ batched: boolean; uploaded?: boolean; batchSize: number }> {
    return this.batchManager.addChanges(spreadsheetId, changes, options);
  }

  /**
   * Get current batch
   */
  async getBatch(spreadsheetId: string) {
    return this.batchManager.getBatch(spreadsheetId);
  }

  /**
   * Get batch size
   */
  async getBatchSize(spreadsheetId: string): Promise<number> {
    return this.batchManager.getBatchSize(spreadsheetId);
  }

  /**
   * Clear batch
   */
  async clearBatch(spreadsheetId: string): Promise<void> {
    return this.batchManager.clearBatch(spreadsheetId);
  }

  /**
   * Check content deduplication
   */
  async checkContentDeduplication(
    contentHash: string,
    blobId: string,
    metadata?: Record<string, any>
  ): Promise<{ isDuplicate: boolean; existingBlobId?: string }> {
    return this.deduplicationManager.checkAndRegister(contentHash, blobId, metadata);
  }

  /**
   * Get blob ID from content hash
   */
  async getBlobIdFromHash(contentHash: string): Promise<string | null> {
    return this.deduplicationManager.getBlobId(contentHash);
  }

  /**
   * Register content hash
   */
  async registerContentHash(
    contentHash: string,
    blobId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    return this.deduplicationManager.register(contentHash, blobId, metadata);
  }

  /**
   * Get all deduplicated entries
   */
  async getAllDeduplicationEntries() {
    return this.deduplicationManager.getAll();
  }

  /**
   * Clear deduplication registry
   */
  async clearDeduplicationRegistry(): Promise<void> {
    return this.deduplicationManager.clearAll();
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.batchManager.cleanup();
  }

  /**
   * Store batch - delegates to batch manager and uploads
   */
  async storeBatch(
    spreadsheetId: string,
    changes: any[],
    options: { tags?: string[]; force?: boolean } = {}
  ): Promise<{ success: boolean; blobId?: string; batchSize?: number; error?: string }> {
    try {
      await this._ensureInitialized();

      // Per-call blobId tracking via closure (avoids race conditions)
      let uploadedBlobId: string | undefined;

      // Create per-call callback that captures blobId in closure
      const uploadCallback = async (id: string) => {
        const batch = await this.batchManager.getBatch(id);
        if (batch && this._blobClient) {
          const payload = this._createBatchPayload(batch);
          const result = await this._blobClient.storeBlob(payload, {});
          uploadedBlobId = result.blobId;
        }
      };

      // Set callback for this operation
      this.batchManager.setUploadCallback(uploadCallback);

      const result = await this.batchManager.addChanges(spreadsheetId, changes, options);

      if (result.uploaded && uploadedBlobId) {
        return { success: true, blobId: uploadedBlobId };
      }

      return { success: true, batchSize: result.batchSize };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Retrieve blob from Walrus
   */
  async retrieveBlob(
    blobId: string,
    options: { expectedHash?: string; verifyHash?: boolean } = {}
  ): Promise<{ success: boolean; data?: any; blobId: string; metadata?: any; error?: string }> {
    try {
      await this._ensureInitialized();
      const data = await this._blobClient!.retrieveBlob(blobId, options);
      return {
        success: true,
        data,
        blobId,
        metadata: {
          retrievedAt: Date.now(),
          format: 'walsheetz-v1'
        }
      };
    } catch (error) {
      return {
        success: false,
        blobId,
        error: (error as Error).message
      };
    }
  }

  /**
   * Store blob directly (without batching)
   */
  async storeBlob(
    data: SpreadsheetData,
    options: Record<string, any> = {}
  ): Promise<{ success: boolean; blobId?: string; contentHash?: string; error?: string }> {
    try {
      await this._ensureInitialized();
      const result = await this._blobClient!.storeBlob(data, options);
      return {
        success: true,
        blobId: result.blobId,
        contentHash: result.contentHash
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

// Export singleton instance
export const nodeWalrusService = new NodeWalrusService();
export default nodeWalrusService;
