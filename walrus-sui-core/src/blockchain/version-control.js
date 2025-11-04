// Version control system for WalSheetz
import { suiService } from './sui-service.js';
import { walrusService } from './walrus-service.js';
import { getCurrentConfig } from './config.js';

class VersionControl {
  constructor() {
    this.cellVersions = new Map(); // cellKey -> versions array
    this.spreadsheetVersions = new Map(); // spreadsheetId -> versions
    this.pendingChanges = new Map(); // cellKey -> change data
    this.maxVersionsPerCell = getCurrentConfig().storage.maxVersionHistory;
  }

  // Generate unique cell key
  generateCellKey(row, col, sheetId = 0) {
    return `${sheetId}_${row}_${col}`;
  }

  // Create version entry for a cell change
  createCellVersion(cellKey, oldValue, newValue, metadata = {}) {
    const version = {
      id: this.generateVersionId(),
      cellKey,
      timestamp: Date.now(),
      oldValue,
      newValue,
      author: metadata.author || 'anonymous',
      changeType: this.determineChangeType(oldValue, newValue),
      metadata: {
        formula: metadata.formula,
        style: metadata.style,
        comment: metadata.comment,
        ...metadata
      }
    };

    return version;
  }

  // Determine the type of change
  determineChangeType(oldValue, newValue) {
    if (oldValue === undefined || oldValue === null) {
      return 'create';
    }
    if (newValue === undefined || newValue === null || newValue === '') {
      return 'delete';
    }
    return 'update';
  }

  // Generate unique version ID
  generateVersionId() {
    return `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Track cell change
  trackCellChange(row, col, oldValue, newValue, metadata = {}) {
    const cellKey = this.generateCellKey(row, col, metadata.sheetId);
    const version = this.createCellVersion(cellKey, oldValue, newValue, metadata);

    // Add to cell versions
    if (!this.cellVersions.has(cellKey)) {
      this.cellVersions.set(cellKey, []);
    }

    const versions = this.cellVersions.get(cellKey);
    versions.push(version);

    // Limit version history per cell
    if (versions.length > this.maxVersionsPerCell) {
      versions.shift(); // Remove oldest version
    }

    // Add to pending changes
    this.pendingChanges.set(cellKey, version);

    return version;
  }

  // Get version history for a cell
  getCellHistory(row, col, sheetId = 0) {
    const cellKey = this.generateCellKey(row, col, sheetId);
    return this.cellVersions.get(cellKey) || [];
  }

  // Get all pending changes
  getPendingChanges() {
    return Array.from(this.pendingChanges.values());
  }

  // Clear pending changes (after successful save)
  clearPendingChanges() {
    this.pendingChanges.clear();
  }

  // Create spreadsheet version from pending changes
  createSpreadsheetVersion(spreadsheetId, title = 'Untitled Spreadsheet') {
    const pendingChanges = this.getPendingChanges();
    
    if (pendingChanges.length === 0) {
      return null;
    }

    const version = {
      id: this.generateVersionId(),
      spreadsheetId,
      title,
      timestamp: Date.now(),
      changeCount: pendingChanges.length,
      changes: pendingChanges.map(change => ({
        cellKey: change.cellKey,
        changeType: change.changeType,
        oldValue: change.oldValue,
        newValue: change.newValue,
        timestamp: change.timestamp,
        metadata: change.metadata
      })),
      metadata: {
        totalCells: this.getTotalCellCount(spreadsheetId),
        changedCells: new Set(pendingChanges.map(c => c.cellKey)).size,
        author: pendingChanges[0]?.author || 'anonymous'
      }
    };

    return version;
  }

  // Save version to blockchain and Walrus
  async saveVersion(spreadsheetId, title, options = {}) {
    try {
      const version = this.createSpreadsheetVersion(spreadsheetId, title);
      
      if (!version) {
        return {
          success: false,
          message: 'No changes to save'
        };
      }

      // Store version data to Walrus
      const walrusResult = await walrusService.storeBatch(
        spreadsheetId,
        version.changes,
        {
          tags: [
            'walsheetz',
            'version',
            `spreadsheet:${spreadsheetId}`,
            `version:${version.id}`
          ],
          force: options.force || false
        }
      );

      let suiResult = null;
      
      // If successfully stored to Walrus, record on Sui blockchain
      if (walrusResult.success && walrusResult.blobId) {
        const versionMetadata = {
          spreadsheetId,
          version: version.id,
          walrusBlobId: walrusResult.blobId,
          timestamp: version.timestamp,
          changeCount: version.changeCount,
          metadata: {
            title,
            author: version.metadata.author,
            totalCells: version.metadata.totalCells,
            changedCells: version.metadata.changedCells
          }
        };

        try {
          suiResult = await suiService.storeSpreadsheetVersion(versionMetadata);
        } catch (suiError) {
          console.warn('Failed to store on Sui blockchain, but Walrus storage succeeded:', suiError);
          // Continue without Sui - Walrus storage is the primary concern
        }
      }

      // Add to spreadsheet versions
      if (!this.spreadsheetVersions.has(spreadsheetId)) {
        this.spreadsheetVersions.set(spreadsheetId, []);
      }
      
      const spreadsheetVersions = this.spreadsheetVersions.get(spreadsheetId);
      spreadsheetVersions.push({
        ...version,
        walrusBlobId: walrusResult.blobId,
        suiTransactionDigest: suiResult?.transactionDigest
      });

      // Clear pending changes after successful save
      this.clearPendingChanges();

      return {
        success: true,
        version: version.id,
        walrusBlobId: walrusResult.blobId,
        suiTransactionDigest: suiResult?.transactionDigest,
        changeCount: version.changeCount,
        savedAt: version.timestamp
      };

    } catch (error) {
      console.error('Failed to save version:', error);
      throw error;
    }
  }

  // Restore version from Walrus
  async restoreVersion(versionId, blobId) {
    try {
      const data = await walrusService.retrieveBlob(blobId);
      
      if (!data.success) {
        throw new Error('Failed to retrieve version data from Walrus');
      }

      const versionData = data.data;
      
      // Apply changes from the version
      const restoredCells = {};
      for (const change of versionData.changes) {
        const [sheetId, row, col] = change.cellKey.split('_');
        const cellCoord = `${row}_${col}`;
        
        restoredCells[cellCoord] = {
          v: change.newValue,
          f: change.metadata?.formula,
          t: this.inferCellType(change.newValue),
          s: change.metadata?.style
        };
      }

      return {
        success: true,
        versionId,
        cells: restoredCells,
        metadata: versionData.metadata,
        restoredAt: Date.now()
      };

    } catch (error) {
      console.error('Failed to restore version:', error);
      throw error;
    }
  }

  // Infer cell type from value
  inferCellType(value) {
    if (typeof value === 'number') return 'n';
    if (typeof value === 'boolean') return 'b';
    if (typeof value === 'string' && value.startsWith('=')) return 'f';
    return 's'; // string
  }

  // Get spreadsheet version history
  getSpreadsheetHistory(spreadsheetId) {
    return this.spreadsheetVersions.get(spreadsheetId) || [];
  }

  // Get total cell count for spreadsheet
  getTotalCellCount(spreadsheetId) {
    let count = 0;
    for (const [cellKey, versions] of this.cellVersions.entries()) {
      if (versions.length > 0 && versions[versions.length - 1].newValue !== null) {
        count++;
      }
    }
    return count;
  }

  // Compare two versions
  compareVersions(version1, version2) {
    const changes = {
      added: [],
      modified: [],
      deleted: []
    };

    // Create maps for easier comparison
    const v1Changes = new Map();
    const v2Changes = new Map();

    version1.changes?.forEach(change => {
      v1Changes.set(change.cellKey, change);
    });

    version2.changes?.forEach(change => {
      v2Changes.set(change.cellKey, change);
    });

    // Find differences
    for (const [cellKey, change] of v2Changes.entries()) {
      const v1Change = v1Changes.get(cellKey);
      
      if (!v1Change) {
        changes.added.push(change);
      } else if (v1Change.newValue !== change.newValue) {
        changes.modified.push({
          cellKey,
          from: v1Change.newValue,
          to: change.newValue,
          timestamp: change.timestamp
        });
      }
    }

    // Find deleted cells
    for (const [cellKey, change] of v1Changes.entries()) {
      if (!v2Changes.has(cellKey)) {
        changes.deleted.push(change);
      }
    }

    return changes;
  }

  // Get version statistics
  getVersionStats(spreadsheetId) {
    const history = this.getSpreadsheetHistory(spreadsheetId);
    const cellVersionCount = this.cellVersions.size;
    const pendingCount = this.pendingChanges.size;

    return {
      totalVersions: history.length,
      totalCellVersions: cellVersionCount,
      pendingChanges: pendingCount,
      lastSaved: history.length > 0 ? history[history.length - 1].timestamp : null,
      oldestVersion: history.length > 0 ? history[0].timestamp : null
    };
  }

  // Auto-save based on conditions
  shouldAutoSave(spreadsheetId) {
    const config = getCurrentConfig().storage;
    const pendingCount = this.pendingChanges.size;
    
    // Check if we have enough changes
    if (pendingCount >= config.editThreshold) {
      return { should: true, reason: 'edit_threshold', count: pendingCount };
    }

    // Check time-based auto-save would be handled by the sync engine
    return { should: false, count: pendingCount };
  }
}

// Create singleton instance
export const versionControl = new VersionControl();

// Convenience functions
export const trackCellChange = (row, col, oldValue, newValue, metadata) => 
  versionControl.trackCellChange(row, col, oldValue, newValue, metadata);

export const getCellHistory = (row, col, sheetId) => 
  versionControl.getCellHistory(row, col, sheetId);

export const saveVersion = (spreadsheetId, title, options) => 
  versionControl.saveVersion(spreadsheetId, title, options);

export const restoreVersion = (versionId, blobId) => 
  versionControl.restoreVersion(versionId, blobId);

export const getVersionStats = (spreadsheetId) => 
  versionControl.getVersionStats(spreadsheetId);