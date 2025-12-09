/**
 * Blob Lineage Tracker Service
 * Tracks blob version history and relationships for Walrus spreadsheets
 */

import { eventBus, logger, LogComponent } from "@dreamlit/walrus";

class BlobLineageTracker {
  private lineages: Map<string, any>;
  private blobToObject: Map<string, string>;
  private storageKey: string;
  private storageVersion: string;
  private storage: any;

  constructor() {
    // Map of objectId -> lineage data
    this.lineages = new Map();

    // Map of blobId -> objectId for quick lookup
    this.blobToObject = new Map();

    // Storage key
    this.storageKey = 'blob_lineage_data';
    this.storageVersion = '1.0.0';

    this.storage = this.createStorageAdapter();

    // Load from localStorage
    this.loadFromStorage();

    logger.info(LogComponent.STORAGE, 'lineage_tracker_init', 'BlobLineageTracker initialized', {
      lineageCount: this.lineages.size,
      blobCount: this.blobToObject.size
    });
  }

  /**
   * Track a new blob version
   * @param {Object} versionData - Version data
   * @returns {Object} Updated lineage
   */
  trackVersion(versionData) {
    try {
      const {
        blobId,
        objectId,
        parentBlobId = null,
        transactionDigest = null,
        size = null,
        contentHash = null,
        createdBy = null,
        description = null,
        poaStatus = 'unknown',
        expiryTimestamp = null
      } = versionData;

      if (!blobId || !objectId) {
        throw new Error('blobId and objectId are required');
      }

      logger.debug(LogComponent.STORAGE, 'lineage_track_version', 'Tracking new blob version', {
        blobId,
        objectId,
        parentBlobId
      });

      // Get or create lineage for this object
      let lineage = this.lineages.get(objectId);

      if (!lineage) {
        // New lineage - this is the first version
        lineage = {
          currentBlobId: blobId,
          objectId,
          versions: [],
          totalVersions: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          rootBlobId: blobId
        };
      }

      // Create version entry
      const version = {
        blobId,
        objectId,
        version: lineage.totalVersions + 1,
        timestamp: Date.now(),
        transactionDigest,
        parentBlobId: parentBlobId || (lineage.versions.length > 0 ? lineage.currentBlobId : undefined),
        size,
        contentHash,
        createdBy,
        description,
        poaStatus,
        expiryTimestamp
      };

      // Add version to lineage
      lineage.versions.push(version);
      lineage.totalVersions++;
      lineage.currentBlobId = blobId;
      lineage.updatedAt = Date.now();

      // Update maps
      this.lineages.set(objectId, lineage);
      this.blobToObject.set(blobId, objectId);

      // Save to storage
      this.saveToStorage();

      // Emit event
      eventBus.emit('blob:lineage:version_created', {
        type: 'version_created',
        blobId,
        objectId,
        version: version.version,
        timestamp: Date.now(),
        data: version
      });

      logger.info(LogComponent.STORAGE, 'lineage_version_tracked', 'Blob version tracked', {
        blobId,
        objectId,
        version: version.version,
        totalVersions: lineage.totalVersions
      });

      return {
        success: true,
        lineage,
        version
      };

    } catch (error) {
      const err = error as Error;
      logger.error(LogComponent.STORAGE, 'lineage_track_error', 'Failed to track version', {
        error: err.message,
        versionData
      });

      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Get lineage for an object ID
   * @param {string} objectId - Sui object ID
   * @returns {Object} Lineage query result
   */
  getLineageByObjectId(objectId) {
    try {
      const lineage = this.lineages.get(objectId);

      if (!lineage) {
        return {
          success: false,
          error: 'Lineage not found for object ID',
          timestamp: Date.now()
        };
      }

      return {
        success: true,
        lineage,
        timestamp: Date.now()
      };

    } catch (error) {
      const err = error as Error;
      logger.error(LogComponent.STORAGE, 'lineage_get_error', 'Failed to get lineage', {
        objectId,
        error: err.message
      });

      return {
        success: false,
        error: err.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get lineage for a blob ID
   * @param {string} blobId - Walrus blob ID
   * @returns {Object} Lineage query result
   */
  getLineageByBlobId(blobId) {
    try {
      const objectId = this.blobToObject.get(blobId);

      if (!objectId) {
        return {
          success: false,
          error: 'Lineage not found for blob ID',
          timestamp: Date.now()
        };
      }

      return this.getLineageByObjectId(objectId);

    } catch (error) {
      const err = error as Error;
      logger.error(LogComponent.STORAGE, 'lineage_get_error', 'Failed to get lineage', {
        blobId,
        error: err.message
      });

      return {
        success: false,
        error: err.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get specific version by blob ID
   * @param {string} blobId - Walrus blob ID
   * @returns {Object|null} Version data or null
   */
  getVersion(blobId) {
    const objectId = this.blobToObject.get(blobId);
    if (!objectId) return null;

    const lineage = this.lineages.get(objectId);
    if (!lineage) return null;

    return lineage.versions.find((v) => v.blobId === blobId) || null;
  }

  /**
   * Get all versions for an object
   * @param {string} objectId - Sui object ID
   * @returns {Array} Array of versions
   */
  getAllVersions(objectId) {
    const lineage = this.lineages.get(objectId);
    return lineage ? lineage.versions : [];
  }

  /**
   * Get version history (newest to oldest)
   * @param {string} objectId - Sui object ID
   * @param {number} limit - Max number of versions to return
   * @returns {Array} Array of versions
   */
  getVersionHistory(objectId, limit = 50) {
    const versions = this.getAllVersions(objectId);
    return versions.slice().reverse().slice(0, limit);
  }

  /**
   * Get parent version
   * @param {string} blobId - Current blob ID
   * @returns {Object|null} Parent version or null
   */
  getParentVersion(blobId) {
    const version = this.getVersion(blobId);
    if (!version || !version.parentBlobId) return null;

    return this.getVersion(version.parentBlobId);
  }

  /**
   * Get child versions
   * @param {string} blobId - Parent blob ID
   * @returns {Array} Array of child versions
   */
  getChildVersions(blobId) {
    const objectId = this.blobToObject.get(blobId);
    if (!objectId) return [];

    const lineage = this.lineages.get(objectId);
    if (!lineage) return [];

    return lineage.versions.filter((v) => v.parentBlobId === blobId);
  }

  /**
   * Update version metadata
   * @param {string} blobId - Blob ID to update
   * @param {Object} updates - Metadata updates
   * @returns {boolean} Success status
   */
  updateVersionMetadata(blobId, updates) {
    try {
      const objectId = this.blobToObject.get(blobId);
      if (!objectId) {
        logger.warn(LogComponent.STORAGE, 'lineage_update_not_found', 'Version not found', {
          blobId
        });
        return false;
      }

      const lineage = this.lineages.get(objectId);
      if (!lineage) return false;

      const versionIndex = lineage.versions.findIndex((v) => v.blobId === blobId);
      if (versionIndex === -1) return false;

      // Update version
      lineage.versions[versionIndex] = {
        ...lineage.versions[versionIndex],
        ...updates
      };

      lineage.updatedAt = Date.now();

      // Save changes
      this.saveToStorage();

      // Emit event
      eventBus.emit('blob:lineage:updated', {
        type: 'lineage_updated',
        blobId,
        objectId,
        timestamp: Date.now(),
        data: updates
      });

      logger.debug(LogComponent.STORAGE, 'lineage_version_updated', 'Version metadata updated', {
        blobId,
        updates
      });

      return true;

    } catch (error) {
      const err = error as Error;
      logger.error(LogComponent.STORAGE, 'lineage_update_error', 'Failed to update version', {
        blobId,
        error: err.message
      });
      return false;
    }
  }

  /**
   * Build lineage chain from blob to root
   * @param {string} blobId - Starting blob ID
   * @returns {Array} Array of versions from current to root
   */
  buildChain(blobId) {
    const chain = [];
    let currentBlobId = blobId;

    while (currentBlobId) {
      const version = this.getVersion(currentBlobId);
      if (!version) break;

      chain.push(version);
      currentBlobId = version.parentBlobId;
    }

    return chain;
  }

  /**
   * Get lineage statistics
   * @param {string} objectId - Sui object ID
   * @returns {Object} Statistics
   */
  getStatistics(objectId) {
    const lineage = this.lineages.get(objectId);
    if (!lineage) return null;

    const now = Date.now();
    const ageMs = now - lineage.createdAt;
    const ageDays = Math.floor(ageMs / 86400000);

    const certifiedVersions = lineage.versions.filter((v) => v.poaStatus === 'certified').length;
    const totalSize = lineage.versions.reduce((sum, v) => sum + (v.size || 0), 0);

    return {
      totalVersions: lineage.totalVersions,
      certifiedVersions,
      uncertifiedVersions: lineage.totalVersions - certifiedVersions,
      totalSize,
      averageSize: lineage.totalVersions > 0 ? Math.floor(totalSize / lineage.totalVersions) : 0,
      ageDays,
      createdAt: lineage.createdAt,
      updatedAt: lineage.updatedAt,
      rootBlobId: lineage.rootBlobId,
      currentBlobId: lineage.currentBlobId
    };
  }

  /**
   * Delete lineage for an object
   * @param {string} objectId - Sui object ID
   * @returns {boolean} Success status
   */
  deleteLineage(objectId) {
    try {
      const lineage = this.lineages.get(objectId);
      if (!lineage) return false;

      // Remove blob ID mappings
      for (const version of lineage.versions) {
        this.blobToObject.delete(version.blobId);
      }

      // Remove lineage
      this.lineages.delete(objectId);

      // Save changes
      this.saveToStorage();

      logger.info(LogComponent.STORAGE, 'lineage_deleted', 'Lineage deleted', {
        objectId,
        versionsDeleted: lineage.totalVersions
      });

      return true;

    } catch (error) {
      const err = error as Error;
      logger.error(LogComponent.STORAGE, 'lineage_delete_error', 'Failed to delete lineage', {
        objectId,
        error: err.message
      });
      return false;
    }
  }

  /**
   * Clear all lineage data
   */
  clearAll() {
    this.lineages.clear();
    this.blobToObject.clear();
    if (this.storage && typeof this.storage.removeItem === 'function') {
      try {
        this.storage.removeItem(this.storageKey);
      } catch (error) {
        const err = error as Error;
        logger.warn(LogComponent.STORAGE, 'lineage_clear_fallback', 'Failed to remove storage key, attempting save fallback', {
          error: err.message
        });
        this.saveToStorage();
      }
    } else {
      this.saveToStorage();
    }

    logger.info(LogComponent.STORAGE, 'lineage_cleared', 'All lineage data cleared');
  }

  /**
   * Load lineage data from localStorage
   * RAM-only mode: No browser persistence
   */
  loadFromStorage() {
    try {
      if (!this.storage || typeof this.storage.getItem !== 'function') {
        return;
      }

      const stored = this.storage.getItem(this.storageKey);
      if (!stored) {
        return;
      }

      const data = JSON.parse(stored);

      // Validate version
      if (data.version !== this.storageVersion) {
        logger.warn(LogComponent.STORAGE, 'lineage_version_mismatch', 'Storage version mismatch', {
          stored: data.version,
          current: this.storageVersion
        });
        // Could implement migration here
      }

      // Load lineages
      if (data.lineages) {
        this.lineages = new Map(Object.entries(data.lineages));
      }

      // Load blob mappings
      if (data.blobToObject) {
        this.blobToObject = new Map(Object.entries(data.blobToObject));
      }

      logger.info(LogComponent.STORAGE, 'lineage_loaded', 'Lineage data loaded from storage', {
        lineageCount: this.lineages.size,
        blobCount: this.blobToObject.size
      });

    } catch (error) {
      const err = error as Error;
      logger.error(LogComponent.STORAGE, 'lineage_load_error', 'Failed to load lineage data', {
        error: err.message
      });
    }
  }

  /**
   * Save lineage data to localStorage
   */
  saveToStorage() {
    try {
      if (!this.storage || typeof this.storage.setItem !== 'function') {
        return;
      }

      const data = {
        version: this.storageVersion,
        lineages: Object.fromEntries(this.lineages),
        blobToObject: Object.fromEntries(this.blobToObject),
        lastUpdated: Date.now()
      };
      this.storage.setItem(this.storageKey, JSON.stringify(data));
      logger.debug(LogComponent.STORAGE, 'lineage_saved', 'Lineage data saved to storage');

    } catch (error) {
      const err = error as Error;
      logger.error(LogComponent.STORAGE, 'lineage_save_error', 'Failed to save lineage data', {
        error: err.message
      });
    }
  }

  /**
   * Export lineage data as JSON
   * @param {string} objectId - Optional object ID to export (exports all if not provided)
   * @returns {Object} Exported data
   */
  exportData(objectId = null) {
    if (objectId) {
      const lineage = this.lineages.get(objectId);
      return lineage || null;
    }

    return {
      version: this.storageVersion,
      lineages: Object.fromEntries(this.lineages),
      blobToObject: Object.fromEntries(this.blobToObject),
      exportedAt: Date.now()
    };
  }

  /**
   * Import lineage data from JSON
   * @param {Object} data - Data to import
   * @param {boolean} merge - Whether to merge with existing data or replace
   * @returns {boolean} Success status
   */
  importData(data, merge = false) {
    try {
      if (!merge) {
        this.clearAll();
      }

      if (data.lineages) {
        for (const [objectId, lineage] of Object.entries(data.lineages)) {
          this.lineages.set(objectId, lineage);
        }
      }

      if (data.blobToObject) {
        for (const [blobId, objectId] of Object.entries(data.blobToObject)) {
          this.blobToObject.set(blobId, objectId as string);
        }
      }

      this.saveToStorage();

      logger.info(LogComponent.STORAGE, 'lineage_imported', 'Lineage data imported', {
        lineageCount: this.lineages.size,
        merge
      });

      return true;

    } catch (error) {
      const err = error as Error;
      logger.error(LogComponent.STORAGE, 'lineage_import_error', 'Failed to import lineage data', {
        error: err.message
      });
      return false;
    }
  }

  /**
   * Cleanup - save data before unload
   */
  cleanup() {
    this.saveToStorage();
    logger.info(LogComponent.STORAGE, 'lineage_cleanup', 'BlobLineageTracker cleaned up');
  }

  createStorageAdapter() {
    try {
      if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
        return globalThis.localStorage;
      }
    } catch (error) {
      const err = error as Error;
      logger.warn(LogComponent.STORAGE, 'lineage_storage_fallback', 'localStorage unavailable, using in-memory storage', {
        error: err.message
      });
    }

    const memoryStore = new Map();

    return {
      getItem(key) {
        return memoryStore.has(key) ? memoryStore.get(key) : null;
      },
      setItem(key, value) {
        memoryStore.set(key, value);
      },
      removeItem(key) {
        memoryStore.delete(key);
      },
      clear() {
        memoryStore.clear();
      }
    };
  }
}

// Export class for testing
export { BlobLineageTracker };

// Export singleton instance
export const blobLineageTracker = new BlobLineageTracker();

// Global access
if (typeof window !== 'undefined') {
  (window as any).blobLineageTracker = blobLineageTracker;

  // Save on page unload
  window.addEventListener('beforeunload', () => {
    blobLineageTracker.cleanup();
  });
}

export default blobLineageTracker;