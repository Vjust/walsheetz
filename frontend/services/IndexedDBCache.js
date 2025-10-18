// In-Memory Cache Layer for WalSheetz (RAM-only)
//
// DEPRECATED: Previously used IndexedDB for browser persistence.
// Now uses in-memory cache only - no browser persistence.
// All data must be saved to Walrus + Sui blockchain for persistence.

class IndexedDBCache {
  constructor() {
    // In-memory storage maps
    this.spreadsheets = new Map();
    this.versions = new Map();
    this.metadata = new Map();

    // Cache policies (maintained for backward compatibility)
    this.policies = {
      maxCacheSize: 50 * 1024 * 1024,
      maxVersionAge: 7 * 24 * 60 * 60 * 1000,
      maxSpreadsheetAge: 24 * 60 * 60 * 1000,
      compressionThreshold: 10 * 1024,
      priorityLevels: {
        recent: 1.0,
        frequent: 0.8,
        large: 0.6,
        old: 0.2
      }
    };

    console.log('📦 In-Memory Cache initialized (RAM-only, no browser persistence)');
  }

  async ensureDB() {
    return true;
  }

  // SPREADSHEET CACHING
  async cacheSpreadsheet(spreadsheetId, data, metadata = {}) {
    try {
      const now = Date.now();
      const serializedData = JSON.stringify(data);
      const size = serializedData.length;

      const cacheEntry = {
        spreadsheetId,
        data: serializedData,
        compressed: false,
        size,
        compressedSize: size,
        lastAccessed: now,
        cachedAt: now,
        accessCount: 1,
        priority: this.calculatePriority(metadata),
        metadata: {
          title: metadata.title || 'Untitled',
          cellCount: metadata.cellCount || 0,
          version: metadata.version || 0,
          ...metadata
        }
      };

      this.spreadsheets.set(spreadsheetId, cacheEntry);
      console.log(`📦 Cached spreadsheet ${spreadsheetId.substring(0, 8)}... in RAM (${size} bytes)`);
      return true;
    } catch (error) {
      console.error('Failed to cache spreadsheet:', error);
      return false;
    }
  }

  async getCachedSpreadsheet(spreadsheetId) {
    try {
      const cacheEntry = this.spreadsheets.get(spreadsheetId);
      if (!cacheEntry) return null;

      const age = Date.now() - cacheEntry.cachedAt;
      if (age > this.policies.maxSpreadsheetAge) {
        this.spreadsheets.delete(spreadsheetId);
        return null;
      }

      cacheEntry.lastAccessed = Date.now();
      cacheEntry.accessCount++;

      return {
        data: JSON.parse(cacheEntry.data),
        metadata: cacheEntry.metadata,
        cacheInfo: {
          cachedAt: cacheEntry.cachedAt,
          lastAccessed: cacheEntry.lastAccessed,
          accessCount: cacheEntry.accessCount,
          priority: cacheEntry.priority
        }
      };
    } catch (error) {
      console.error('Failed to retrieve cached spreadsheet:', error);
      return null;
    }
  }

  // VERSION/BLOB CACHING
  async cacheVersion(blobId, data, metadata = {}) {
    try {
      const now = Date.now();
      const serializedData = JSON.stringify(data);
      const size = serializedData.length;

      const cacheEntry = {
        blobId,
        spreadsheetId: metadata.spreadsheetId || 'unknown',
        data: serializedData,
        compressed: false,
        size,
        compressedSize: size,
        lastAccessed: now,
        cachedAt: now,
        accessCount: 1,
        priority: this.calculatePriority(metadata),
        metadata: {
          contentHash: metadata.contentHash || '',
          versionNumber: metadata.versionNumber || 0,
          storageType: metadata.storageType || 'full',
          operations: metadata.operations || 0,
          ...metadata
        }
      };

      this.versions.set(blobId, cacheEntry);
      console.log(`📦 Cached version ${blobId.substring(0, 8)}... in RAM (${size} bytes)`);
      return true;
    } catch (error) {
      console.error('Failed to cache version:', error);
      return false;
    }
  }

  async getCachedVersion(blobId) {
    try {
      const cacheEntry = this.versions.get(blobId);
      if (!cacheEntry) return null;

      const age = Date.now() - cacheEntry.cachedAt;
      if (age > this.policies.maxVersionAge) {
        this.versions.delete(blobId);
        return null;
      }

      cacheEntry.lastAccessed = Date.now();
      cacheEntry.accessCount++;

      return {
        data: JSON.parse(cacheEntry.data),
        metadata: cacheEntry.metadata,
        cacheInfo: {
          cachedAt: cacheEntry.cachedAt,
          lastAccessed: cacheEntry.lastAccessed,
          accessCount: cacheEntry.accessCount,
          priority: cacheEntry.priority
        }
      };
    } catch (error) {
      console.error('Failed to retrieve cached version:', error);
      return null;
    }
  }

  // CACHE MANAGEMENT
  async getCacheStats() {
    try {
      const stats = {
        spreadsheets: { count: 0, totalSize: 0, compressedSize: 0 },
        versions: { count: 0, totalSize: 0, compressedSize: 0 },
        total: { count: 0, totalSize: 0, compressedSize: 0 }
      };

      // Calculate spreadsheet stats
      for (const [, entry] of this.spreadsheets) {
        stats.spreadsheets.count++;
        stats.spreadsheets.totalSize += entry.size;
        stats.spreadsheets.compressedSize += entry.compressedSize;
      }

      // Calculate version stats
      for (const [, entry] of this.versions) {
        stats.versions.count++;
        stats.versions.totalSize += entry.size;
        stats.versions.compressedSize += entry.compressedSize;
      }

      stats.total.count = stats.spreadsheets.count + stats.versions.count;
      stats.total.totalSize = stats.spreadsheets.totalSize + stats.versions.totalSize;
      stats.total.compressedSize = stats.spreadsheets.compressedSize + stats.versions.compressedSize;
      stats.compressionRatio = stats.total.totalSize > 0 ?
        stats.total.totalSize / stats.total.compressedSize : 1;

      return stats;
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return null;
    }
  }

  async clearCache() {
    try {
      this.spreadsheets.clear();
      this.versions.clear();
      this.metadata.clear();
      console.log('📦 Cache cleared successfully');
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  // UTILITY FUNCTIONS
  calculatePriority(metadata) {
    let priority = this.policies.priorityLevels.old;
    if (metadata.recentlyAccessed) {
      priority = Math.max(priority, this.policies.priorityLevels.recent);
    }
    if (metadata.accessCount > 5) {
      priority = Math.max(priority, this.policies.priorityLevels.frequent);
    }
    if (metadata.cellCount > 1000) {
      priority = Math.max(priority, this.policies.priorityLevels.large);
    }
    return priority;
  }
}

// Create and export singleton instance
export const indexedDBCache = new IndexedDBCache();
export { IndexedDBCache };
