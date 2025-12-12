// Node.js-compatible Walrus service facade

import { BatchManager } from '../batch/BatchManager.js';
import { DeduplicationManager } from '../deduplication/DeduplicationManager.js';
import { NodeBatchPersistence } from '../batch/adapters/NodeBatchPersistence.js';
import { NodeDeduplicationRegistry } from '../deduplication/adapters/NodeDeduplicationRegistry.js';

export class NodeWalrusService {
  private batchManager: BatchManager;
  private deduplicationManager: DeduplicationManager;
  private uploadCallback: ((spreadsheetId: string) => Promise<any>) | null;

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

    console.log('[NodeWalrusService] Initialized with Node.js adapters');
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
}

// Export singleton instance
export const nodeWalrusService = new NodeWalrusService();
export default nodeWalrusService;
