// IndexedDB Caching Layer for WalSheetz
// Provides efficient local caching for Walrus blob data and spreadsheet versions

class IndexedDBCache {
  constructor() {
    this.dbName = 'WalSheetzCache';
    this.dbVersion = 1;
    this.db = null;

    // Store configurations
    this.stores = {
      spreadsheets: {
        name: 'spreadsheets',
        keyPath: 'spreadsheetId'
      },
      versions: {
        name: 'versions',
        keyPath: 'blobId'
      },
      metadata: {
        name: 'metadata',
        keyPath: 'key'
      }
    };

    // Cache policies
    this.policies = {
      maxCacheSize: 50 * 1024 * 1024, // 50MB total cache limit
      maxVersionAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      maxSpreadsheetAge: 24 * 60 * 60 * 1000, // 24 hours
      compressionThreshold: 10 * 1024, // 10KB - compress cached data above this
      priorityLevels: {
        recent: 1.0,
        frequent: 0.8,
        large: 0.6,
        old: 0.2
      }
    };

    this.initializationPromise = this.initializeDB();
  }

  // Initialize IndexedDB database
  async initializeDB() {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        console.warn('IndexedDB not available, caching disabled');
        resolve(null);
        return;
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('IndexedDB initialization failed:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('📦 IndexedDB cache initialized successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create spreadsheets store
        if (!db.objectStoreNames.contains(this.stores.spreadsheets.name)) {
          const spreadsheetStore = db.createObjectStore(
            this.stores.spreadsheets.name,
            { keyPath: this.stores.spreadsheets.keyPath }
          );
          spreadsheetStore.createIndex('lastAccessed', 'lastAccessed');
          spreadsheetStore.createIndex('size', 'size');
        }

        // Create versions store
        if (!db.objectStoreNames.contains(this.stores.versions.name)) {
          const versionStore = db.createObjectStore(
            this.stores.versions.name,
            { keyPath: this.stores.versions.keyPath }
          );
          versionStore.createIndex('spreadsheetId', 'spreadsheetId');
          versionStore.createIndex('lastAccessed', 'lastAccessed');
          versionStore.createIndex('size', 'size');
          versionStore.createIndex('priority', 'priority');
        }

        // Create metadata store
        if (!db.objectStoreNames.contains(this.stores.metadata.name)) {
          db.createObjectStore(
            this.stores.metadata.name,
            { keyPath: this.stores.metadata.keyPath }
          );
        }

        console.log('📦 IndexedDB stores created successfully');
      };
    });
  }

  // Ensure DB is ready before operations
  async ensureDB() {
    if (!this.db) {
      await this.initializationPromise;
    }
    return this.db;
  }

  // SPREADSHEET CACHING

  // Cache spreadsheet data with intelligent compression
  async cacheSpreadsheet(spreadsheetId, data, metadata = {}) {
    try {
      const db = await this.ensureDB();
      if (!db) return false;

      const now = Date.now();
      const serializedData = JSON.stringify(data);
      const size = serializedData.length;

      // Compress data if above threshold
      let processedData = serializedData;
      let compressed = false;

      if (size > this.policies.compressionThreshold && 'CompressionStream' in window) {
        try {
          const compressedData = await this.compressData(serializedData);
          if (compressedData.length < size * 0.8) { // Only use if saves >20%
            processedData = compressedData;
            compressed = true;
          }
        } catch (compressError) {
          console.warn('Compression failed, storing uncompressed:', compressError);
        }
      }

      const cacheEntry = {
        spreadsheetId,
        data: processedData,
        compressed,
        size: size,
        compressedSize: compressed ? processedData.length : size,
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

      // Store in IndexedDB
      const transaction = db.transaction([this.stores.spreadsheets.name], 'readwrite');
      const store = transaction.objectStore(this.stores.spreadsheets.name);

      await new Promise((resolve, reject) => {
        const request = store.put(cacheEntry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log(`📦 Cached spreadsheet ${spreadsheetId.substring(0, 8)}... (${size} bytes → ${cacheEntry.compressedSize} bytes)`);

      // Schedule cleanup if needed
      this.scheduleCleanup();

      return true;
    } catch (error) {
      console.error('Failed to cache spreadsheet:', error);
      return false;
    }
  }

  // Retrieve cached spreadsheet data
  async getCachedSpreadsheet(spreadsheetId) {
    try {
      const db = await this.ensureDB();
      if (!db) return null;

      const transaction = db.transaction([this.stores.spreadsheets.name], 'readwrite');
      const store = transaction.objectStore(this.stores.spreadsheets.name);

      const cacheEntry = await new Promise((resolve, reject) => {
        const request = store.get(spreadsheetId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (!cacheEntry) return null;

      // Check if entry is still valid
      const age = Date.now() - cacheEntry.cachedAt;
      if (age > this.policies.maxSpreadsheetAge) {
        // Entry expired, remove it
        store.delete(spreadsheetId);
        console.log(`📦 Cache entry expired for spreadsheet ${spreadsheetId.substring(0, 8)}...`);
        return null;
      }

      // Update access statistics
      cacheEntry.lastAccessed = Date.now();
      cacheEntry.accessCount++;
      store.put(cacheEntry);

      // Decompress data if needed
      let data = cacheEntry.data;
      if (cacheEntry.compressed) {
        try {
          data = await this.decompressData(data);
        } catch (decompressError) {
          console.error('Failed to decompress cached data:', decompressError);
          return null;
        }
      }

      console.log(`📦 Cache hit for spreadsheet ${spreadsheetId.substring(0, 8)}... (access count: ${cacheEntry.accessCount})`);

      return {
        data: JSON.parse(data),
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

  // Cache Walrus blob data
  async cacheVersion(blobId, data, metadata = {}) {
    try {
      const db = await this.ensureDB();
      if (!db) return false;

      const now = Date.now();
      const serializedData = JSON.stringify(data);
      const size = serializedData.length;

      // Compress data if above threshold
      let processedData = serializedData;
      let compressed = false;

      if (size > this.policies.compressionThreshold && 'CompressionStream' in window) {
        try {
          const compressedData = await this.compressData(serializedData);
          if (compressedData.length < size * 0.8) {
            processedData = compressedData;
            compressed = true;
          }
        } catch (compressError) {
          console.warn('Compression failed for version cache:', compressError);
        }
      }

      const cacheEntry = {
        blobId,
        spreadsheetId: metadata.spreadsheetId || 'unknown',
        data: processedData,
        compressed,
        size: size,
        compressedSize: compressed ? processedData.length : size,
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

      const transaction = db.transaction([this.stores.versions.name], 'readwrite');
      const store = transaction.objectStore(this.stores.versions.name);

      await new Promise((resolve, reject) => {
        const request = store.put(cacheEntry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log(`📦 Cached version ${blobId.substring(0, 8)}... (${size} bytes → ${cacheEntry.compressedSize} bytes)`);

      return true;
    } catch (error) {
      console.error('Failed to cache version:', error);
      return false;
    }
  }

  // Retrieve cached version data
  async getCachedVersion(blobId) {
    try {
      const db = await this.ensureDB();
      if (!db) return null;

      const transaction = db.transaction([this.stores.versions.name], 'readwrite');
      const store = transaction.objectStore(this.stores.versions.name);

      const cacheEntry = await new Promise((resolve, reject) => {
        const request = store.get(blobId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (!cacheEntry) return null;

      // Check if entry is still valid
      const age = Date.now() - cacheEntry.cachedAt;
      if (age > this.policies.maxVersionAge) {
        store.delete(blobId);
        console.log(`📦 Cache entry expired for version ${blobId.substring(0, 8)}...`);
        return null;
      }

      // Update access statistics
      cacheEntry.lastAccessed = Date.now();
      cacheEntry.accessCount++;
      store.put(cacheEntry);

      // Decompress if needed
      let data = cacheEntry.data;
      if (cacheEntry.compressed) {
        try {
          data = await this.decompressData(data);
        } catch (decompressError) {
          console.error('Failed to decompress cached version:', decompressError);
          return null;
        }
      }

      console.log(`📦 Cache hit for version ${blobId.substring(0, 8)}... (access count: ${cacheEntry.accessCount})`);

      return {
        data: JSON.parse(data),
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

  // UTILITY FUNCTIONS

  // Calculate priority for cache entry
  calculatePriority(metadata) {
    let priority = this.policies.priorityLevels.old; // Base priority

    // Boost priority for recent items
    if (metadata.recentlyAccessed) {
      priority = Math.max(priority, this.policies.priorityLevels.recent);
    }

    // Boost priority for frequently accessed items
    if (metadata.accessCount > 5) {
      priority = Math.max(priority, this.policies.priorityLevels.frequent);
    }

    // Boost priority for large spreadsheets (more expensive to recreate)
    if (metadata.cellCount > 1000) {
      priority = Math.max(priority, this.policies.priorityLevels.large);
    }

    return priority;
  }

  // Compress data using browser APIs
  async compressData(data) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(data));
        controller.close();
      }
    });

    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const chunks = [];
    const reader = compressedStream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    return new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
  }

  // Decompress data
  async decompressData(compressedData) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(compressedData);
        controller.close();
      }
    });

    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const chunks = [];
    const reader = decompressedStream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const result = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
    return new TextDecoder().decode(result);
  }

  // CACHE MANAGEMENT

  // Get cache statistics
  async getCacheStats() {
    try {
      const db = await this.ensureDB();
      if (!db) return null;

      const stats = {
        spreadsheets: { count: 0, totalSize: 0, compressedSize: 0 },
        versions: { count: 0, totalSize: 0, compressedSize: 0 },
        total: { count: 0, totalSize: 0, compressedSize: 0 }
      };

      // Get spreadsheet stats
      const spreadsheetTransaction = db.transaction([this.stores.spreadsheets.name], 'readonly');
      const spreadsheetStore = spreadsheetTransaction.objectStore(this.stores.spreadsheets.name);

      await new Promise((resolve, reject) => {
        const request = spreadsheetStore.openCursor();
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const entry = cursor.value;
            stats.spreadsheets.count++;
            stats.spreadsheets.totalSize += entry.size;
            stats.spreadsheets.compressedSize += entry.compressedSize;
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });

      // Get version stats
      const versionTransaction = db.transaction([this.stores.versions.name], 'readonly');
      const versionStore = versionTransaction.objectStore(this.stores.versions.name);

      await new Promise((resolve, reject) => {
        const request = versionStore.openCursor();
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const entry = cursor.value;
            stats.versions.count++;
            stats.versions.totalSize += entry.size;
            stats.versions.compressedSize += entry.compressedSize;
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });

      // Calculate totals
      stats.total.count = stats.spreadsheets.count + stats.versions.count;
      stats.total.totalSize = stats.spreadsheets.totalSize + stats.versions.totalSize;
      stats.total.compressedSize = stats.spreadsheets.compressedSize + stats.versions.compressedSize;

      // Add compression efficiency
      stats.compressionRatio = stats.total.totalSize > 0 ?
        stats.total.totalSize / stats.total.compressedSize : 1;

      return stats;
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return null;
    }
  }

  // Schedule cache cleanup (smart eviction)
  scheduleCleanup() {
    // Debounce cleanup calls
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
    }

    this.cleanupTimeout = setTimeout(() => {
      this.performCleanup();
    }, 5000); // 5 second delay
  }

  // Perform intelligent cache cleanup
  async performCleanup() {
    try {
      const stats = await this.getCacheStats();
      if (!stats || stats.total.compressedSize < this.policies.maxCacheSize) {
        return; // No cleanup needed
      }

      console.log('📦 Cache size limit exceeded, performing cleanup...');

      const db = await this.ensureDB();
      if (!db) return;

      // Get all entries sorted by priority (lowest first)
      const entriesToRemove = [];

      // Collect low-priority spreadsheet entries
      const spreadsheetTransaction = db.transaction([this.stores.spreadsheets.name], 'readonly');
      const spreadsheetStore = spreadsheetTransaction.objectStore(this.stores.spreadsheets.name);

      await new Promise((resolve, reject) => {
        const request = spreadsheetStore.openCursor();
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const entry = cursor.value;
            const age = Date.now() - entry.lastAccessed;
            const adjustedPriority = entry.priority * (1 - age / this.policies.maxSpreadsheetAge);

            if (adjustedPriority < 0.3) { // Low priority threshold
              entriesToRemove.push({
                type: 'spreadsheet',
                key: entry.spreadsheetId,
                priority: adjustedPriority,
                size: entry.compressedSize
              });
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });

      // Collect low-priority version entries
      const versionTransaction = db.transaction([this.stores.versions.name], 'readonly');
      const versionStore = versionTransaction.objectStore(this.stores.versions.name);

      await new Promise((resolve, reject) => {
        const request = versionStore.openCursor();
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const entry = cursor.value;
            const age = Date.now() - entry.lastAccessed;
            const adjustedPriority = entry.priority * (1 - age / this.policies.maxVersionAge);

            if (adjustedPriority < 0.3) {
              entriesToRemove.push({
                type: 'version',
                key: entry.blobId,
                priority: adjustedPriority,
                size: entry.compressedSize
              });
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });

      // Sort by priority (lowest first) and remove until under limit
      entriesToRemove.sort((a, b) => a.priority - b.priority);

      let removedSize = 0;
      const targetReduction = stats.total.compressedSize - (this.policies.maxCacheSize * 0.8); // Remove down to 80%

      const deleteTransaction = db.transaction([this.stores.spreadsheets.name, this.stores.versions.name], 'readwrite');

      for (const entry of entriesToRemove) {
        if (removedSize >= targetReduction) break;

        const store = entry.type === 'spreadsheet' ?
          deleteTransaction.objectStore(this.stores.spreadsheets.name) :
          deleteTransaction.objectStore(this.stores.versions.name);

        store.delete(entry.key);
        removedSize += entry.size;
      }

      console.log(`📦 Cache cleanup completed: removed ${entriesToRemove.length} entries (${(removedSize / 1024).toFixed(1)}KB)`);

    } catch (error) {
      console.error('Cache cleanup failed:', error);
    }
  }

  // Clear all cache data
  async clearCache() {
    try {
      const db = await this.ensureDB();
      if (!db) return;

      const transaction = db.transaction([
        this.stores.spreadsheets.name,
        this.stores.versions.name,
        this.stores.metadata.name
      ], 'readwrite');

      await Promise.all([
        new Promise((resolve, reject) => {
          const request = transaction.objectStore(this.stores.spreadsheets.name).clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        }),
        new Promise((resolve, reject) => {
          const request = transaction.objectStore(this.stores.versions.name).clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        }),
        new Promise((resolve, reject) => {
          const request = transaction.objectStore(this.stores.metadata.name).clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
      ]);

      console.log('📦 Cache cleared successfully');
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }
}

// Create and export singleton instance
export const indexedDBCache = new IndexedDBCache();

// Export the class for testing
export { IndexedDBCache };