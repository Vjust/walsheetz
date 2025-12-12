// Platform-agnostic deduplication management

import type { IDeduplicationRegistry, DeduplicationEntry } from './interfaces.js';

export class DeduplicationManager {
  private registry: IDeduplicationRegistry;

  constructor(registry: IDeduplicationRegistry) {
    this.registry = registry;
  }

  /**
   * Check if content is deduplicated and get blob ID if exists
   */
  async checkAndRegister(
    contentHash: string,
    blobId: string,
    metadata?: Record<string, any>
  ): Promise<{ isDuplicate: boolean; existingBlobId?: string }> {
    const existing = await this.registry.get(contentHash);

    if (existing) {
      return {
        isDuplicate: true,
        existingBlobId: existing.blobId
      };
    }

    // Register new entry
    await this.registry.register(contentHash, blobId, metadata);

    return {
      isDuplicate: false
    };
  }

  /**
   * Get blob ID from content hash
   */
  async getBlobId(contentHash: string): Promise<string | null> {
    const entry = await this.registry.get(contentHash);
    return entry?.blobId ?? null;
  }

  /**
   * Register content hash to blob ID mapping
   */
  async register(
    contentHash: string,
    blobId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.registry.register(contentHash, blobId, metadata);
  }

  /**
   * Check if content hash exists
   */
  async has(contentHash: string): Promise<boolean> {
    return this.registry.has(contentHash);
  }

  /**
   * Get all deduplicated entries
   */
  async getAll(): Promise<DeduplicationEntry[]> {
    return this.registry.getAll();
  }

  /**
   * Clear all entries
   */
  async clearAll(): Promise<void> {
    await this.registry.clearAll();
  }
}
