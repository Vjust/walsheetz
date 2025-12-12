// Platform-agnostic batch management

import type { IBatchPersistence, Batch } from './interfaces.js';

export interface BatchManagerOptions {
  uploadThreshold?: number; // Number of changes before auto-upload
  timeoutMs?: number; // Time before auto-upload
  maxBatchSize?: number; // Max changes per batch
}

export class BatchManager {
  private persistence: IBatchPersistence;
  private options: Required<BatchManagerOptions>;
  private timers: Map<string, NodeJS.Timeout>;
  private uploadCallback: ((spreadsheetId: string) => Promise<any>) | null;

  constructor(persistence: IBatchPersistence, options: BatchManagerOptions = {}) {
    this.persistence = persistence;
    this.options = {
      uploadThreshold: options.uploadThreshold ?? 100,
      timeoutMs: options.timeoutMs ?? 30000,
      maxBatchSize: options.maxBatchSize ?? 1000
    };
    this.timers = new Map();
    this.uploadCallback = null;
  }

  /**
   * Set callback for batch upload
   */
  setUploadCallback(callback: (spreadsheetId: string) => Promise<any>): void {
    this.uploadCallback = callback;
  }

  /**
   * Add changes to batch
   */
  async addChanges(
    spreadsheetId: string,
    changes: any[],
    options: { force?: boolean; tags?: string[] } = {}
  ): Promise<{ batched: boolean; uploaded?: boolean; batchSize: number }> {
    // Get or create batch
    let batch = await this.persistence.getBatch(spreadsheetId);

    if (!batch) {
      batch = {
        spreadsheetId,
        changes: [],
        metadata: {
          spreadsheetId,
          batchStarted: Date.now(),
          tags: options.tags || ['walsheetz', 'spreadsheet', `id:${spreadsheetId}`]
        }
      };
    }

    // Add changes
    batch.changes.push(...changes);
    batch.metadata.lastUpdated = Date.now();
    batch.metadata.totalChanges = batch.changes.length;

    // Add custom tags if provided
    if (options.tags) {
      batch.metadata.tags = [...new Set([...batch.metadata.tags, ...options.tags])];
    }

    // Save batch
    await this.persistence.setBatch(spreadsheetId, batch);

    // Reset timer
    this.resetTimer(spreadsheetId);

    // Check if should upload
    const shouldUpload =
      options.force ||
      batch.changes.length >= this.options.uploadThreshold ||
      batch.changes.length >= this.options.maxBatchSize;

    if (shouldUpload && this.uploadCallback) {
      await this.upload(spreadsheetId);
      return { batched: false, uploaded: true, batchSize: 0 };
    }

    // Start timeout timer
    this.startTimer(spreadsheetId);

    return { batched: true, batchSize: batch.changes.length };
  }

  /**
   * Get current batch
   */
  async getBatch(spreadsheetId: string): Promise<Batch | null> {
    return this.persistence.getBatch(spreadsheetId);
  }

  /**
   * Get batch size
   */
  async getBatchSize(spreadsheetId: string): Promise<number> {
    const batch = await this.persistence.getBatch(spreadsheetId);
    return batch?.changes.length ?? 0;
  }

  /**
   * Clear batch
   */
  async clearBatch(spreadsheetId: string): Promise<void> {
    this.resetTimer(spreadsheetId);
    await this.persistence.deleteBatch(spreadsheetId);
  }

  /**
   * Upload batch
   */
  private async upload(spreadsheetId: string): Promise<void> {
    if (!this.uploadCallback) return;

    try {
      await this.uploadCallback(spreadsheetId);
      await this.clearBatch(spreadsheetId);
    } catch (error) {
      console.error(`[BatchManager] Failed to upload batch for ${spreadsheetId}:`, error);
      throw error;
    }
  }

  /**
   * Start timeout timer for batch
   */
  private startTimer(spreadsheetId: string): void {
    // Clear existing timer
    this.resetTimer(spreadsheetId);

    // Set new timer
    const timer = setTimeout(async () => {
      if (this.uploadCallback) {
        try {
          await this.upload(spreadsheetId);
        } catch (error) {
          console.error(`[BatchManager] Timeout upload failed for ${spreadsheetId}:`, error);
        }
      }
    }, this.options.timeoutMs);

    this.timers.set(spreadsheetId, timer);
  }

  /**
   * Reset timer for batch
   */
  private resetTimer(spreadsheetId: string): void {
    const timer = this.timers.get(spreadsheetId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(spreadsheetId);
    }
  }

  /**
   * Clear all timers (for cleanup)
   */
  async cleanup(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
