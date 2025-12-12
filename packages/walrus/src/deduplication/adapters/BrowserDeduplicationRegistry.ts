// Browser localStorage deduplication registry adapter

import type { IDeduplicationRegistry, DeduplicationEntry } from '../interfaces.js';

const REGISTRY_KEY = 'walsheetz_content_registry';

export class BrowserDeduplicationRegistry implements IDeduplicationRegistry {
  private getRegistry(): Record<string, DeduplicationEntry> {
    try {
      const data = localStorage.getItem(REGISTRY_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('[BrowserDeduplicationRegistry] Failed to read registry:', error);
      return {};
    }
  }

  private saveRegistry(registry: Record<string, DeduplicationEntry>): void {
    try {
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
    } catch (error) {
      console.error('[BrowserDeduplicationRegistry] Failed to save registry:', error);
      throw error;
    }
  }

  async register(contentHash: string, blobId: string, metadata?: Record<string, any>): Promise<void> {
    const registry = this.getRegistry();
    registry[contentHash] = {
      contentHash,
      blobId,
      timestamp: Date.now(),
      metadata
    };
    this.saveRegistry(registry);
  }

  async has(contentHash: string): Promise<boolean> {
    const registry = this.getRegistry();
    return contentHash in registry;
  }

  async get(contentHash: string): Promise<DeduplicationEntry | null> {
    const registry = this.getRegistry();
    return registry[contentHash] ?? null;
  }

  async delete(contentHash: string): Promise<void> {
    const registry = this.getRegistry();
    delete registry[contentHash];
    this.saveRegistry(registry);
  }

  async getAll(): Promise<DeduplicationEntry[]> {
    const registry = this.getRegistry();
    return Object.values(registry);
  }

  async clearAll(): Promise<void> {
    localStorage.removeItem(REGISTRY_KEY);
  }
}
