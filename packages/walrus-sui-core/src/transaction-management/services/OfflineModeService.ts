/**
 * Offline Mode Service for WalSheetz
 * Provides local-first capabilities with synchronization when services are available
 */

import { logger, LogComponent } from "@dreamlit/walrus";

class OfflineModeService {
  private isBrowser: boolean;
  private isOnline: boolean;
  private pendingOperations: any[];
  private localDataStore: Map<string, any>;
  private syncQueue: any[];
  private conflictResolver: ConflictResolver;
  private PENDING_OPERATIONS_KEY: string;
  private LOCAL_DATA_KEY: string;
  private SYNC_QUEUE_KEY: string;

  constructor() {
    // Guard browser-only APIs for Node.js compatibility
    this.isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';
    this.isOnline = this.isBrowser ? navigator.onLine : true; // Assume online in Node.js
    this.pendingOperations = [];
    this.localDataStore = new Map();
    this.syncQueue = [];
    this.conflictResolver = new ConflictResolver();

    // Storage keys
    this.PENDING_OPERATIONS_KEY = 'walsheetz_offline_operations';
    this.LOCAL_DATA_KEY = 'walsheetz_local_data';
    this.SYNC_QUEUE_KEY = 'walsheetz_sync_queue';

    // Initialize offline detection (browser only)
    if (this.isBrowser) {
      this.setupOfflineDetection();
    }
    this.loadPersistedData();

    logger.info(LogComponent.PERFORMANCE, 'offline_mode_init', 'Offline Mode Service initialized', {
      isOnline: this.isOnline,
      pendingOperationsCount: this.pendingOperations.length,
      localDataCount: this.localDataStore.size
    });
  }

  // Setup offline/online detection
  setupOfflineDetection() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      logger.info(LogComponent.PERFORMANCE, 'network_online', 'Network connection restored');
      this.emitEvent('network-online');
      this.processPendingOperations();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      logger.info(LogComponent.PERFORMANCE, 'network_offline', 'Network connection lost');
      this.emitEvent('network-offline');
    });
  }

  // Load persisted data from localStorage
  // RAM-only mode: No browser persistence
  loadPersistedData() {
    try {
      // RAM-only, no browser persistence - localStorage.getItem disabled
      // Load pending operations
      // const pendingOps = localStorage.getItem(this.PENDING_OPERATIONS_KEY);
      const pendingOps = null;
      if (pendingOps) {
        this.pendingOperations = JSON.parse(pendingOps);
      }

      // Load local data store
      // const localData = localStorage.getItem(this.LOCAL_DATA_KEY);
      const localData = null;
      if (localData) {
        const parsed = JSON.parse(localData);
        this.localDataStore = new Map(Object.entries(parsed));
      }

      // Load sync queue
      // const syncQueue = localStorage.getItem(this.SYNC_QUEUE_KEY);
      const syncQueue = null;
      if (syncQueue) {
        this.syncQueue = JSON.parse(syncQueue);
      }

      console.log('OfflineModeService: RAM-only mode, no browser persistence');
      logger.info(LogComponent.PERFORMANCE, 'data_loaded', 'Persisted data loaded (RAM-only)', {
        pendingOperations: this.pendingOperations.length,
        localDataItems: this.localDataStore.size,
        syncQueueItems: this.syncQueue.length
      });

    } catch (error) {
      const err = error as Error;
      logger.error(LogComponent.STORAGE_SERVICE, 'data_load_error', 'Failed to load persisted data', {
        error: err.message
      });
    }
  }

  // Persist data to localStorage
  // RAM-only mode: No browser persistence
  persistData() {
    try {
      // RAM-only, no browser persistence - localStorage.setItem disabled
      // Save pending operations
      // localStorage.setItem(this.PENDING_OPERATIONS_KEY, JSON.stringify(this.pendingOperations));

      // Save local data store
      // const localDataObj = Object.fromEntries(this.localDataStore);
      // localStorage.setItem(this.LOCAL_DATA_KEY, JSON.stringify(localDataObj));

      // Save sync queue
      // localStorage.setItem(this.SYNC_QUEUE_KEY, JSON.stringify(this.syncQueue));

      console.log('OfflineModeService: RAM-only mode, no browser persistence');

    } catch (error) {
      const err = error as Error;
      logger.error(LogComponent.STORAGE_SERVICE, 'data_persist_error', 'Failed to persist data', {
        error: err.message
      });
    }
  }

  // Create a new spreadsheet in offline mode
  async createOfflineSpreadsheet(title = 'Untitled Spreadsheet') {
    const spreadsheetId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const spreadsheetData = {
      id: spreadsheetId,
      title,
      createdAt: Date.now(),
      lastModified: Date.now(),
      version: 'v1.0.0',
      cells: {},
      metadata: {
        title,
        rows: 100,
        cols: 26,
        sheets: [{
          name: 'Sheet1',
          index: 0,
          order: 0,
          status: 1
        }]
      },
      offline: true,
      syncStatus: 'local_only'
    };

    // Store locally
    this.localDataStore.set(spreadsheetId, spreadsheetData);

    // Queue for synchronization when online
    this.addToSyncQueue({
      type: 'create_spreadsheet',
      data: spreadsheetData,
      timestamp: Date.now(),
      id: `sync_${Date.now()}`
    });

    this.persistData();

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'offline_spreadsheet_created', 'Offline spreadsheet created', {
      spreadsheetId,
      title
    });

    return {
      success: true,
      spreadsheetId,
      data: spreadsheetData,
      offline: true,
      message: 'Spreadsheet created locally - will sync when online'
    };
  }

  // Save spreadsheet data in offline mode
  async saveOfflineSpreadsheet(spreadsheetId: string, data: any) {
    const existingData = this.localDataStore.get(spreadsheetId);

    if (!existingData) {
      throw new Error(`Spreadsheet ${spreadsheetId} not found in local storage`);
    }

    // Update local data
    const updatedData = {
      ...existingData,
      ...data,
      lastModified: Date.now(),
      syncStatus: 'modified_offline'
    };

    this.localDataStore.set(spreadsheetId, updatedData);

    // Queue for synchronization
    this.addToSyncQueue({
      type: 'update_spreadsheet',
      spreadsheetId,
      data: updatedData,
      timestamp: Date.now(),
      id: `sync_${Date.now()}`
    });

    this.persistData();

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'offline_spreadsheet_saved', 'Offline spreadsheet saved', {
      spreadsheetId,
      dataSize: JSON.stringify(data).length
    });

    return {
      success: true,
      spreadsheetId,
      offline: true,
      message: 'Changes saved locally - will sync when online'
    };
  }

  // Load spreadsheet from offline storage
  async loadOfflineSpreadsheet(spreadsheetId: string) {
    const data = this.localDataStore.get(spreadsheetId);

    if (!data) {
      throw new Error(`Spreadsheet ${spreadsheetId} not found in offline storage`);
    }

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'offline_spreadsheet_loaded', 'Offline spreadsheet loaded', {
      spreadsheetId,
      lastModified: data.lastModified,
      syncStatus: data.syncStatus
    });

    return {
      success: true,
      data,
      offline: true,
      syncStatus: data.syncStatus
    };
  }

  // Get list of offline spreadsheets
  getOfflineSpreadsheets() {
    const spreadsheets = Array.from(this.localDataStore.values()).
    filter((item) => item.offline).
    map((item) => ({
      id: item.id,
      title: item.title,
      createdAt: item.createdAt,
      lastModified: item.lastModified,
      syncStatus: item.syncStatus,
      offline: true
    })).
    sort((a, b) => b.lastModified - a.lastModified);

    return spreadsheets;
  }

  // Add operation to sync queue
  addToSyncQueue(operation: any) {
    this.syncQueue.push(operation);
    logger.info(LogComponent.PERFORMANCE, 'sync_queued', 'Operation added to sync queue', {
      type: operation.type,
      id: operation.id,
      queueSize: this.syncQueue.length
    });
  }

  // Process pending operations when coming online
  async processPendingOperations() {
    if (!this.isOnline || this.syncQueue.length === 0) {
      return;
    }

    logger.info(LogComponent.PERFORMANCE, 'sync_processing_start', 'Starting sync queue processing', {
      queueSize: this.syncQueue.length
    });

    const results = [];

    for (const operation of this.syncQueue) {
      try {
        const result = await this.syncOperation(operation);
        results.push({ operation: operation.id, success: result.success, error: (result as any).error });

        if (result.success) {
          // Remove from queue
          this.syncQueue = this.syncQueue.filter((op) => op.id !== operation.id);
        }
      } catch (error) {
        const err = error as Error;
        logger.error(LogComponent.PERFORMANCE, 'sync_operation_error', 'Sync operation failed', {
          operationId: operation.id,
          error: err.message
        });
        results.push({ operation: operation.id, success: false, error: err.message });
      }
    }

    this.persistData();

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger.info(LogComponent.PERFORMANCE, 'sync_processing_complete', 'Sync queue processing completed', {
      total: results.length,
      successful,
      failed,
      remaining: this.syncQueue.length
    });

    this.emitEvent('sync-complete', { results, successful, failed });

    return { successful, failed };
  }

  // Sync individual operation
  async syncOperation(operation: any) {
    logger.info(LogComponent.PERFORMANCE, 'sync_operation_start', 'Syncing operation', {
      type: operation.type,
      id: operation.id
    });

    // This would integrate with the actual blockchain services
    // For now, we'll simulate the sync process
    switch (operation.type) {
      case 'create_spreadsheet':
        return await this.syncCreateSpreadsheet(operation);
      case 'update_spreadsheet':
        return await this.syncUpdateSpreadsheet(operation);
      default:
        return { success: false, error: `Unknown operation type: ${operation.type}` };
    }
  }

  // Sync create spreadsheet operation
  async syncCreateSpreadsheet(operation: any) {
    // In a real implementation, this would call the blockchain adapter
    // For now, we'll simulate success
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate network delay

    const data = operation.data;
    data.syncStatus = 'synced';
    this.localDataStore.set(data.id, data);

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'sync_create_success', 'Spreadsheet synced to blockchain', {
      spreadsheetId: data.id,
      title: data.title
    });

    return { success: true };
  }

  // Sync update spreadsheet operation
  async syncUpdateSpreadsheet(operation: any) {
    // In a real implementation, this would call the blockchain adapter
    // For now, we'll simulate success
    await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate network delay

    const data = operation.data;
    data.syncStatus = 'synced';
    this.localDataStore.set(operation.spreadsheetId, data);

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'sync_update_success', 'Spreadsheet update synced to blockchain', {
      spreadsheetId: operation.spreadsheetId
    });

    return { success: true };
  }

  // Check for conflicts when syncing
  detectConflicts(localData: any, remoteData: any) {
    return this.conflictResolver.detectConflicts(localData, remoteData);
  }

  // Resolve conflicts
  resolveConflict(conflict: any) {
    return this.conflictResolver.resolveConflict(conflict);
  }

  // Get offline status
  getOfflineStatus() {
    return {
      isOnline: this.isOnline,
      pendingOperations: this.pendingOperations.length,
      syncQueueSize: this.syncQueue.length,
      localSpreadsheets: this.getOfflineSpreadsheets().length,
      storageUsed: this.getStorageUsage()
    };
  }

  // Get storage usage
  // RAM-only mode: No browser persistence
  getStorageUsage() {
    try {
      // RAM-only, no browser persistence - localStorage.getItem disabled
      // const localData = localStorage.getItem(this.LOCAL_DATA_KEY) || '';
      // const pendingOps = localStorage.getItem(this.PENDING_OPERATIONS_KEY) || '';
      // const syncQueue = localStorage.getItem(this.SYNC_QUEUE_KEY) || '';
      const localData = '';
      const pendingOps = '';
      const syncQueue = '';

      return {
        localData: localData.length,
        pendingOperations: pendingOps.length,
        syncQueue: syncQueue.length,
        total: localData.length + pendingOps.length + syncQueue.length,
        ramOnly: true
      };
    } catch (error) {
      const err = error as Error;
      return { error: err.message };
    }
  }

  // Clear offline data
  // RAM-only mode: No browser persistence
  clearOfflineData() {
    this.localDataStore.clear();
    this.pendingOperations = [];
    this.syncQueue = [];

    // RAM-only, no browser persistence - localStorage.removeItem disabled
    // Clear from localStorage
    // localStorage.removeItem(this.PENDING_OPERATIONS_KEY);
    // localStorage.removeItem(this.LOCAL_DATA_KEY);
    // localStorage.removeItem(this.SYNC_QUEUE_KEY);

    console.log('OfflineModeService: RAM-only mode, offline data cleared from memory');
    logger.info(LogComponent.STORAGE_SERVICE, 'offline_data_cleared', 'All offline data cleared (RAM-only)');
  }

  // Export offline data for backup
  exportOfflineData() {
    return {
      localDataStore: Object.fromEntries(this.localDataStore),
      pendingOperations: this.pendingOperations,
      syncQueue: this.syncQueue,
      exportedAt: Date.now(),
      version: '1.0'
    };
  }

  // Import offline data from backup
  importOfflineData(data: any) {
    try {
      if (data.localDataStore) {
        this.localDataStore = new Map(Object.entries(data.localDataStore));
      }
      if (data.pendingOperations) {
        this.pendingOperations = data.pendingOperations;
      }
      if (data.syncQueue) {
        this.syncQueue = data.syncQueue;
      }

      this.persistData();

      logger.info(LogComponent.STORAGE_SERVICE, 'offline_data_imported', 'Offline data imported', {
        spreadsheets: this.localDataStore.size,
        pendingOperations: this.pendingOperations.length,
        syncQueueItems: this.syncQueue.length
      });

      return { success: true };
    } catch (error) {
      const err = error as Error;
      logger.error(LogComponent.STORAGE_SERVICE, 'offline_data_import_error', 'Failed to import offline data', {
        error: err.message
      });
      return { success: false, error: err.message };
    }
  }

  // Emit events for UI updates
  emitEvent(eventType: string, data: any = {}) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`offline-${eventType}`, {
        detail: { ...data, timestamp: Date.now() }
      }));
    }
  }

  // Cleanup
  destroy() {
    this.persistData();
    logger.info(LogComponent.PERFORMANCE, 'offline_mode_destroyed', 'Offline Mode Service destroyed');
  }
}

// Conflict resolution helper class
class ConflictResolver {
  detectConflicts(localData: any, remoteData: any) {
    const conflicts = [];

    // Compare timestamps
    if (localData.lastModified > remoteData.lastModified) {
      conflicts.push({
        type: 'timestamp',
        field: 'lastModified',
        local: localData.lastModified,
        remote: remoteData.lastModified,
        resolution: 'local'
      });
    }

    // Compare cell data
    const localCells = localData.cells || {};
    const remoteCells = remoteData.cells || {};

    for (const [cellKey, localCell] of Object.entries(localCells)) {
      const remoteCell = remoteCells[cellKey];
      if (remoteCell && (localCell as any).v !== (remoteCell as any).v) {
        conflicts.push({
          type: 'cell_value',
          cell: cellKey,
          local: (localCell as any).v,
          remote: (remoteCell as any).v,
          resolution: 'merge' // Let user decide
        });
      }
    }

    return conflicts;
  }

  resolveConflict(conflict: any) {
    switch (conflict.type) {
      case 'timestamp':
        return conflict.resolution === 'local' ? conflict.local : conflict.remote;
      case 'cell_value':
        // For cell conflicts, default to local changes but mark for user review
        return {
          value: conflict.local,
          needsReview: true,
          conflict: conflict
        };
      default:
        return conflict.local;
    }
  }
}

// Create singleton instance
const isBrowserEnvironment = typeof window !== 'undefined' && typeof navigator !== 'undefined';

class OfflineModeServiceShim {
  async createOfflineSpreadsheet() {
    return {
      success: false,
      offline: false,
      message: 'Offline mode is unavailable in this environment'
    };
  }

  async saveOfflineSpreadsheet() {
    return {
      success: false,
      offline: false,
      message: 'Offline mode is unavailable in this environment'
    };
  }

  async loadOfflineSpreadsheet() {
    throw new Error('Offline mode is unavailable in this environment');
  }

  getOfflineSpreadsheets() {
    return [];
  }

  addToSyncQueue() {}

  async processPendingOperations() {
    return { successful: 0, failed: 0 };
  }

  async syncOperation() {
    return { success: false, error: 'Offline mode is unavailable in this environment' };
  }

  async syncCreateSpreadsheet() {
    return { success: false, error: 'Offline mode is unavailable in this environment' };
  }

  async syncUpdateSpreadsheet() {
    return { success: false, error: 'Offline mode is unavailable in this environment' };
  }

  detectConflicts() {
    return [];
  }

  resolveConflict(conflict: any) {
    return conflict?.remote ?? null;
  }

  getOfflineStatus() {
    return {
      isOnline: true,
      pendingOperations: 0,
      syncQueueSize: 0,
      localSpreadsheets: 0,
      storageUsed: this.getStorageUsage()
    };
  }

  getStorageUsage() {
    return {
      localData: 0,
      pendingOperations: 0,
      syncQueue: 0,
      total: 0,
      ramOnly: false
    };
  }

  clearOfflineData() {}

  exportOfflineData() {
    return {
      localDataStore: {},
      pendingOperations: [],
      syncQueue: [],
      exportedAt: Date.now(),
      version: 'shim'
    };
  }

  importOfflineData() {
    return {
      success: false,
      error: 'Offline mode is unavailable in this environment'
    };
  }

  emitEvent() {}

  destroy() {}
}

let offlineModeSingleton = null;

export const getOfflineModeService = () => {
  if (!offlineModeSingleton) {
    offlineModeSingleton = isBrowserEnvironment
      ? new OfflineModeService()
      : new OfflineModeServiceShim();

    if (isBrowserEnvironment && typeof window !== 'undefined') {
      (window as any).walSheetzOfflineMode = offlineModeSingleton;
    }
  }

  return offlineModeSingleton;
};

export const offlineModeService = getOfflineModeService();

export default offlineModeService;