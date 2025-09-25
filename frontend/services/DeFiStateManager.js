// DeFi State Manager for async result caching and state management in WalSheetz
import { EventBus } from '../utils/EventBus.js';

class DeFiStateManager {
  constructor() {
    this.cache = new Map();
    this.subscriptions = new Map();
    this.loadingStates = new Map();
    this.errorStates = new Map();
    this.config = {
      defaultTimeout: 30000, // 30 seconds
      maxCacheSize: 1000,
      cleanupInterval: 60000 // 1 minute
    };

    // Set up periodic cache cleanup
    this.cleanupTimer = setInterval(() => this.cleanupExpiredCache(), this.config.cleanupInterval);

    console.log('[DeFiStateManager] Initialized with cache cleanup every', this.config.cleanupInterval / 1000, 'seconds');
  }

  generateCacheKey(cellRef, adapterId, method, args) {
    const argsKey = JSON.stringify(args);
    return `${cellRef}:${adapterId}:${method}:${argsKey}`;
  }

  getCachedResult(cellRef, adapterId, method, args) {
    const key = this.generateCacheKey(cellRef, adapterId, method, args);
    const cached = this.cache.get(key);

    if (!cached) return null;

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached;
  }

  setCachedResult(cellRef, adapterId, method, args, result, timeout = this.config.defaultTimeout) {
    const key = this.generateCacheKey(cellRef, adapterId, method, args);

    // Enforce cache size limit
    if (this.cache.size >= this.config.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }

    const cacheEntry = {
      key,
      cellRef,
      adapterId,
      method,
      args,
      result,
      timestamp: Date.now(),
      expiresAt: Date.now() + timeout,
      accessCount: 1,
      lastAccessed: Date.now()
    };

    this.cache.set(key, cacheEntry);

    // Notify cell that data is available
    EventBus.emit('defi:cell:updated', {
      cellRef,
      adapterId,
      method,
      result,
      status: 'success'
    });

    return cacheEntry;
  }

  evictLeastRecentlyUsed() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log('[DeFiStateManager] Evicted LRU cache entry:', oldestKey);
    }
  }

  cleanupExpiredCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[DeFiStateManager] Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  setLoading(cellRef, adapterId, method, args) {
    const key = this.generateCacheKey(cellRef, adapterId, method, args);
    this.loadingStates.set(key, {
      cellRef,
      adapterId,
      method,
      args,
      startTime: Date.now()
    });

    // Clear any existing error for this cell
    this.errorStates.delete(key);

    // Notify UI of loading state
    EventBus.emit('defi:cell:loading', {
      cellRef,
      adapterId,
      method,
      status: 'loading'
    });
  }

  clearLoading(cellRef, adapterId, method, args) {
    const key = this.generateCacheKey(cellRef, adapterId, method, args);
    this.loadingStates.delete(key);
  }

  isLoading(cellRef, adapterId, method, args) {
    const key = this.generateCacheKey(cellRef, adapterId, method, args);
    return this.loadingStates.has(key);
  }

  setError(cellRef, adapterId, method, args, error) {
    const key = this.generateCacheKey(cellRef, adapterId, method, args);
    this.errorStates.set(key, {
      cellRef,
      adapterId,
      method,
      args,
      error,
      timestamp: Date.now()
    });

    this.clearLoading(cellRef, adapterId, method, args);

    // Notify UI of error state
    EventBus.emit('defi:cell:error', {
      cellRef,
      adapterId,
      method,
      error: error.message,
      status: 'error'
    });
  }

  getError(cellRef, adapterId, method, args) {
    const key = this.generateCacheKey(cellRef, adapterId, method, args);
    return this.errorStates.get(key);
  }

  clearError(cellRef, adapterId, method, args) {
    const key = this.generateCacheKey(cellRef, adapterId, method, args);
    this.errorStates.delete(key);
  }

  async cacheAsyncCall(cellRef, adapterId, method, args, asyncFunction, timeout = this.config.defaultTimeout) {
    // Check if we already have a cached result
    const cached = this.getCachedResult(cellRef, adapterId, method, args);
    if (cached) {
      console.log(`[DeFiStateManager] Cache hit for ${cellRef}:${adapterId}:${method}`);
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      return cached.result;
    }

    // Check if we're already loading this
    if (this.isLoading(cellRef, adapterId, method, args)) {
      console.log(`[DeFiStateManager] Already loading ${cellRef}:${adapterId}:${method}, returning placeholder`);
      return { status: 'loading', message: 'Loading...' };
    }

    // Set loading state
    this.setLoading(cellRef, adapterId, method, args);

    try {
      console.log(`[DeFiStateManager] Executing async call for ${cellRef}:${adapterId}:${method}`);
      const result = await asyncFunction();

      // Cache the result
      this.setCachedResult(cellRef, adapterId, method, args, result, timeout);
      this.clearLoading(cellRef, adapterId, method, args);

      return result;
    } catch (error) {
      console.error(`[DeFiStateManager] Async call failed for ${cellRef}:${adapterId}:${method}:`, error);
      this.setError(cellRef, adapterId, method, args, error);

      // Return error result for display in cell
      return {
        status: 'error',
        message: error.message,
        code: error.code || 'UNKNOWN_ERROR'
      };
    }
  }

  subscribeToUpdates(protocol, address, callback) {
    const subscriptionKey = `${protocol}:${address}`;

    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, []);
    }

    this.subscriptions.get(subscriptionKey).push(callback);

    console.log(`[DeFiStateManager] Subscribed to updates for ${subscriptionKey}`);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscriptions.get(subscriptionKey);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }

        // Clean up empty subscription arrays
        if (callbacks.length === 0) {
          this.subscriptions.delete(subscriptionKey);
        }
      }
    };
  }

  notifySubscribers(protocol, address, data) {
    const subscriptionKey = `${protocol}:${address}`;
    const callbacks = this.subscriptions.get(subscriptionKey);

    if (callbacks && callbacks.length > 0) {
      console.log(`[DeFiStateManager] Notifying ${callbacks.length} subscribers for ${subscriptionKey}`);
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('[DeFiStateManager] Error in subscription callback:', error);
        }
      });
    }
  }

  invalidateCache(cellRef = null, adapterId = null) {
    let invalidatedCount = 0;

    for (const [key, entry] of this.cache) {
      const shouldInvalidate = (
        (!cellRef || entry.cellRef === cellRef) &&
        (!adapterId || entry.adapterId === adapterId)
      );

      if (shouldInvalidate) {
        this.cache.delete(key);
        invalidatedCount++;

        // Notify that cell needs refresh
        EventBus.emit('defi:cell:invalidated', {
          cellRef: entry.cellRef,
          adapterId: entry.adapterId,
          method: entry.method
        });
      }
    }

    if (invalidatedCount > 0) {
      console.log(`[DeFiStateManager] Invalidated ${invalidatedCount} cache entries`);
    }
  }

  getCacheStats() {
    const now = Date.now();
    const stats = {
      totalEntries: this.cache.size,
      loadingStates: this.loadingStates.size,
      errorStates: this.errorStates.size,
      subscriptions: this.subscriptions.size,
      entries: []
    };

    for (const [key, entry] of this.cache) {
      stats.entries.push({
        key,
        cellRef: entry.cellRef,
        adapterId: entry.adapterId,
        method: entry.method,
        age: now - entry.timestamp,
        timeToExpiry: entry.expiresAt - now,
        accessCount: entry.accessCount,
        timeSinceAccess: now - entry.lastAccessed,
        expired: now > entry.expiresAt
      });
    }

    return stats;
  }

  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    this.loadingStates.clear();
    this.errorStates.clear();

    EventBus.emit('defi:cache:cleared', { entriesCleared: size });
    console.log(`[DeFiStateManager] Cleared all cache (${size} entries)`);
  }

  destroy() {
    console.log('[DeFiStateManager] Destroying state manager...');

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.clearCache();
    this.subscriptions.clear();
  }
}

// Create singleton instance
export const defiStateManager = new DeFiStateManager();
export default defiStateManager;