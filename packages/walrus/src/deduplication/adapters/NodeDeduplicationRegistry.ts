// Node.js in-memory deduplication registry adapter

import type { IDeduplicationRegistry, DeduplicationEntry } from '../interfaces.js';

export class NodeDeduplicationRegistry implements IDeduplicationRegistry {
  private registry: Map<string, DeduplicationEntry>;

  constructor() {
    this.registry = new Map();
  }

  async register(contentHash: string, blobId: string, metadata?: Record<string, any>): Promise<void> {
    this.registry.set(contentHash, {
      contentHash,
      blobId,
      timestamp: Date.now(),
      metadata
    });
  }

  async has(contentHash: string): Promise<boolean> {
    return this.registry.has(contentHash);
  }

  async get(contentHash: string): Promise<DeduplicationEntry | null> {
    const entry = this.registry.get(contentHash);
    return entry ? JSON.parse(JSON.stringify(entry)) : null;
  }

  async delete(contentHash: string): Promise<void> {
    this.registry.delete(contentHash);
  }

  async getAll(): Promise<DeduplicationEntry[]> {
    return Array.from(this.registry.values()).map(entry => JSON.parse(JSON.stringify(entry)));
  }

  async clearAll(): Promise<void> {
    this.registry.clear();
  }
}
