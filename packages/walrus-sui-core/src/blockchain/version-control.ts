// Version control system for WalSheetz
import { suiService } from './sui-service.js';
import { nodeWalrusService as walrusService } from '@dreamlit/walrus/node';
import { getCurrentConfig } from './config.js';

class VersionControl {
  cellVersions: Map<string, unknown[]>;
  spreadsheetVersions: Map<string, unknown>;
  pendingChanges: Map<string, unknown>;
  maxVersionsPerCell: number;

  constructor() {
    this.cellVersions = new Map(); // cellKey -> versions array
    this.spreadsheetVersions = new Map(); // spreadsheetId -> versions
    this.pendingChanges = new Map(); // cellKey -> change data
    this.maxVersionsPerCell = getCurrentConfig().storage.maxVersionHistory;
  }

  // Generate unique cell key
  generateCellKey(row: number, col: number, sheetId: number = 0): string {
    return `${sheetId}_${row}_${col}`;
  }

  // Create version entry for a cell change
  createCellVersion(cellKey: string, oldValue: unknown, newValue: unknown, metadata: Record<string, unknown> = {}) {
    const version = {
      id: this.generateVersionId(),
      cellKey,
      timestamp: Date.now(),
      oldValue,
      newValue,
      author: (metadata.author as string) || 'anonymous',
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
  determineChangeType(oldValue: unknown, newValue: unknown): string {
    if (oldValue === undefined || oldValue === null) {
      return 'create';
    }
    if (newValue === undefined || newValue === null || newValue === '') {
      return 'delete';
    }
    return 'update';
  }

  // Generate unique version ID
  generateVersionId(): string {
    return `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Track cell change
  trackCellChange(row: number, col: number, oldValue: unknown, newValue: unknown, metadata: Record<string, unknown> = {}) {
    const cellKey = this.generateCellKey(row, col, metadata.sheetId as number);
    const version = this.createCellVersion(cellKey, oldValue, newValue, metadata);

    // Add to cell versions
    if (!this.cellVersions.has(cellKey)) {
      this.cellVersions.set(cellKey, []);
    }

    const versions = this.cellVersions.get(cellKey) as unknown[];
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
  getCellHistory(row: number, col: number, sheetId: number = 0) {
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
  createSpreadsheetVersion(spreadsheetId: string, title: string = 'Untitled Spreadsheet') {
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
      changes: pendingChanges.map(change => {
        const c = change as Record<string, unknown>;
        return {
          cellKey: c.cellKey,
          changeType: c.changeType,
          oldValue: c.oldValue,
          newValue: c.newValue,
          timestamp: c.timestamp,
          metadata: c.metadata
        };
      }),
      metadata: {
        totalCells: this.getTotalCellCount(spreadsheetId),
        changedCells: new Set(pendingChanges.map(c => (c as Record<string, unknown>).cellKey)).size,
        author: (pendingChanges[0] as Record<string, unknown> | undefined)?.author || 'anonymous'
      }
    };

    return version;
  }

  // Save version to blockchain and Walrus
  async saveVersion(spreadsheetId: string, title: string, options: Record<string, unknown> = {}) {
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
      const walrusRes = walrusResult as Record<string, unknown>;
      if (walrusRes.success && walrusRes.blobId) {
        const versionMetadata = {
          spreadsheetId,
          version: version.id,
          walrusBlobId: walrusRes.blobId,
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
          const err = suiError as Error;
          console.warn('Failed to store on Sui blockchain, but Walrus storage succeeded:', err);
          // Continue without Sui - Walrus storage is the primary concern
        }
      }

      // Add to spreadsheet versions
      if (!this.spreadsheetVersions.has(spreadsheetId)) {
        this.spreadsheetVersions.set(spreadsheetId, []);
      }

      const spreadsheetVersions = this.spreadsheetVersions.get(spreadsheetId) as unknown[];
      spreadsheetVersions.push({
        ...version,
        walrusBlobId: walrusRes.blobId,
        suiTransactionDigest: suiResult && typeof suiResult === 'object' ? (suiResult as Record<string, unknown>).transactionDigest : undefined
      });

      // Clear pending changes after successful save
      this.clearPendingChanges();

      return {
        success: true,
        version: version.id,
        walrusBlobId: walrusRes.blobId,
        suiTransactionDigest: suiResult && typeof suiResult === 'object' ? (suiResult as Record<string, unknown>).transactionDigest : undefined,
        changeCount: version.changeCount,
        savedAt: version.timestamp
      };

    } catch (error) {
      const err = error as Error;
      console.error('Failed to save version:', err);
      throw err;
    }
  }

  // Restore version from Walrus
  async restoreVersion(versionId: string, blobId: string) {
    try {
      const data = await walrusService.retrieveBlob(blobId);
      
      if (!data.success) {
        throw new Error('Failed to retrieve version data from Walrus');
      }

      const versionData = data.data as Record<string, unknown>;

      // Apply changes from the version
      const restoredCells: Record<string, unknown> = {};
      for (const change of (versionData.changes as unknown[])) {
        const changeObj = change as Record<string, unknown>;
        const [sheetId, row, col] = (changeObj.cellKey as string).split('_');
        const cellCoord = `${row}_${col}`;
        const metadata = changeObj.metadata as Record<string, unknown>;

        restoredCells[cellCoord] = {
          v: changeObj.newValue,
          f: metadata?.formula,
          t: this.inferCellType(changeObj.newValue),
          s: metadata?.style
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
      const err = error as Error;
      console.error('Failed to restore version:', err);
      throw err;
    }
  }

  // Infer cell type from value
  inferCellType(value: unknown): string {
    if (typeof value === 'number') return 'n';
    if (typeof value === 'boolean') return 'b';
    if (typeof value === 'string' && value.startsWith('=')) return 'f';
    return 's'; // string
  }

  // Get spreadsheet version history
  getSpreadsheetHistory(spreadsheetId: string) {
    return this.spreadsheetVersions.get(spreadsheetId) || [];
  }

  // Get total cell count for spreadsheet
  getTotalCellCount(spreadsheetId: string): number {
    let count = 0;
    const entries = Array.from(this.cellVersions.entries());
    for (const [cellKey, versions] of entries) {
      const versionsList = versions as unknown[];
      const lastVersion = versionsList[versionsList.length - 1] as Record<string, unknown>;
      if (versionsList.length > 0 && lastVersion.newValue !== null) {
        count++;
      }
    }
    return count;
  }

  // Compare two versions
  compareVersions(version1: Record<string, unknown>, version2: Record<string, unknown>) {
    const changes = {
      added: [] as unknown[],
      modified: [] as unknown[],
      deleted: [] as unknown[]
    };

    // Create maps for easier comparison
    const v1Changes = new Map();
    const v2Changes = new Map();

    const v1ChangesList = (version1.changes as unknown[]) || [];
    const v2ChangesList = (version2.changes as unknown[]) || [];

    v1ChangesList.forEach(change => {
      const changeObj = change as Record<string, unknown>;
      v1Changes.set(changeObj.cellKey, changeObj);
    });

    v2ChangesList.forEach(change => {
      const changeObj = change as Record<string, unknown>;
      v2Changes.set(changeObj.cellKey, changeObj);
    });

    // Find differences
    const v2Entries = Array.from(v2Changes.entries());
    for (const [cellKey, change] of v2Entries) {
      const v1Change = v1Changes.get(cellKey);

      if (!v1Change) {
        changes.added.push(change);
      } else if ((v1Change as Record<string, unknown>).newValue !== (change as Record<string, unknown>).newValue) {
        changes.modified.push({
          cellKey,
          from: (v1Change as Record<string, unknown>).newValue,
          to: (change as Record<string, unknown>).newValue,
          timestamp: (change as Record<string, unknown>).timestamp
        });
      }
    }

    // Find deleted cells
    const v1Entries = Array.from(v1Changes.entries());
    for (const [cellKey, change] of v1Entries) {
      if (!v2Changes.has(cellKey)) {
        changes.deleted.push(change);
      }
    }

    return changes;
  }

  // Get version statistics
  getVersionStats(spreadsheetId: string) {
    const historyList = this.getSpreadsheetHistory(spreadsheetId) as unknown[];
    const cellVersionCount = this.cellVersions.size;
    const pendingCount = this.pendingChanges.size;

    return {
      totalVersions: historyList.length,
      totalCellVersions: cellVersionCount,
      pendingChanges: pendingCount,
      lastSaved: historyList.length > 0 ? (historyList[historyList.length - 1] as Record<string, unknown>).timestamp : null,
      oldestVersion: historyList.length > 0 ? (historyList[0] as Record<string, unknown>).timestamp : null
    };
  }

  // Auto-save based on conditions
  shouldAutoSave(spreadsheetId: string) {
    const config = getCurrentConfig().storage;
    const pendingCount = this.pendingChanges.size;

    // Check if we have enough changes
    if (pendingCount >= (config.editThreshold as number)) {
      return { should: true, reason: 'edit_threshold', count: pendingCount };
    }

    // Check time-based auto-save would be handled by the sync engine
    return { should: false, count: pendingCount };
  }
}

// Create singleton instance
export const versionControl = new VersionControl();

// Convenience functions
export const trackCellChange = (row: number, col: number, oldValue: unknown, newValue: unknown, metadata: Record<string, unknown>) =>
  versionControl.trackCellChange(row, col, oldValue, newValue, metadata);

export const getCellHistory = (row: number, col: number, sheetId: number) =>
  versionControl.getCellHistory(row, col, sheetId);

export const saveVersion = (spreadsheetId: string, title: string, options: Record<string, unknown>) =>
  versionControl.saveVersion(spreadsheetId, title, options);

export const restoreVersion = (versionId: string, blobId: string) =>
  versionControl.restoreVersion(versionId, blobId);

export const getVersionStats = (spreadsheetId: string) =>
  versionControl.getVersionStats(spreadsheetId);