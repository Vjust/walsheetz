import { logger, LogComponent } from '../utils/Logger.js';

/**
 * Service for tracking import history and recent files
 */
export class ImportHistoryService {
  constructor(maxHistoryItems = 50) {
    this.maxHistoryItems = maxHistoryItems;
    this.storageKey = 'walsheetz_import_history';
    this.recentFilesKey = 'walsheetz_recent_files';
    this.history = this._loadHistory();
    this.recentFiles = this._loadRecentFiles();
  }

  /**
   * Add an import to history
   * @param {Object} importRecord - Import record to add
   */
  addToHistory(importRecord) {
    try {
      const record = {
        id: `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        fileName: importRecord.fileName,
        fileSize: importRecord.fileSize,
        sheetsCount: importRecord.sheetsCount,
        duration: importRecord.duration,
        status: importRecord.status || 'success',
        spreadsheetTitle: importRecord.spreadsheetTitle,
        notes: importRecord.notes || ''
      };

      this.history.unshift(record);

      // Keep only recent items
      if (this.history.length > this.maxHistoryItems) {
        this.history = this.history.slice(0, this.maxHistoryItems);
      }

      this._saveHistory();

      logger.info(LogComponent.UI_COMPONENT, 'import_history_added', 'Import added to history', {
        recordId: record.id,
        fileName: record.fileName
      });

      return record;
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'import_history_error', 'Failed to add import to history', {
        error: error.message
      });
    }
  }

  /**
   * Track a file for recent files list
   * @param {Object} fileRecord - File record to track
   */
  addRecentFile(fileRecord) {
    try {
      const record = {
        id: `recent_${Date.now()}`,
        fileName: fileRecord.fileName,
        fileSize: fileRecord.fileSize,
        lastAccessTime: Date.now(),
        filePath: fileRecord.filePath || null,
        hash: this._generateFileHash(fileRecord.fileName, fileRecord.fileSize)
      };

      // Remove if already exists
      this.recentFiles = this.recentFiles.filter(f => f.hash !== record.hash);

      // Add to beginning
      this.recentFiles.unshift(record);

      // Keep only recent files
      if (this.recentFiles.length > 10) {
        this.recentFiles = this.recentFiles.slice(0, 10);
      }

      this._saveRecentFiles();

      logger.info(LogComponent.UI_COMPONENT, 'recent_file_added', 'File added to recent files', {
        fileName: record.fileName
      });

      return record;
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'recent_file_error', 'Failed to add recent file', {
        error: error.message
      });
    }
  }

  /**
   * Get all import history
   * @returns {Array} Import history records
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * Get recent files
   * @returns {Array} Recent files list
   */
  getRecentFiles() {
    return [...this.recentFiles];
  }

  /**
   * Get history for a specific date range
   * @param {Number} startTime - Start timestamp
   * @param {Number} endTime - End timestamp
   * @returns {Array} Filtered history
   */
  getHistoryByDateRange(startTime, endTime) {
    return this.history.filter(record =>
      record.timestamp >= startTime && record.timestamp <= endTime
    );
  }

  /**
   * Clear import history
   */
  clearHistory() {
    this.history = [];
    this._saveHistory();

    logger.info(LogComponent.UI_COMPONENT, 'import_history_cleared', 'Import history cleared');
  }

  /**
   * Clear recent files
   */
  clearRecentFiles() {
    this.recentFiles = [];
    this._saveRecentFiles();

    logger.info(LogComponent.UI_COMPONENT, 'recent_files_cleared', 'Recent files cleared');
  }

  /**
   * Get statistics about imports
   * @returns {Object} Import statistics
   */
  getStatistics() {
    const totalImports = this.history.length;
    const successfulImports = this.history.filter(r => r.status === 'success').length;
    const failedImports = this.history.filter(r => r.status === 'failed').length;
    const totalDuration = this.history.reduce((sum, r) => sum + (r.duration || 0), 0);
    const averageDuration = totalImports > 0 ? totalDuration / totalImports : 0;
    const totalSheets = this.history.reduce((sum, r) => sum + (r.sheetsCount || 0), 0);
    const totalSize = this.history.reduce((sum, r) => sum + (r.fileSize || 0), 0);

    return {
      totalImports,
      successfulImports,
      failedImports,
      successRate: totalImports > 0 ? (successfulImports / totalImports) * 100 : 0,
      averageDuration,
      totalDuration,
      totalSheets,
      totalSize,
      lastImportTime: this.history[0]?.timestamp || null
    };
  }

  /**
   * Remove a specific import from history
   * @param {String} recordId - Record ID to remove
   */
  removeFromHistory(recordId) {
    this.history = this.history.filter(r => r.id !== recordId);
    this._saveHistory();

    logger.info(LogComponent.UI_COMPONENT, 'import_history_removed', 'Import removed from history', {
      recordId
    });
  }

  /**
   * Remove a specific file from recent files
   * @param {String} fileId - File ID to remove
   */
  removeRecentFile(fileId) {
    this.recentFiles = this.recentFiles.filter(f => f.id !== fileId);
    this._saveRecentFiles();

    logger.info(LogComponent.UI_COMPONENT, 'recent_file_removed', 'Recent file removed', {
      fileId
    });
  }

  /**
   * Load history from localStorage
   * @private
   */
  _loadHistory() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      logger.warn(LogComponent.UI_COMPONENT, 'import_history_load_error', 'Failed to load import history', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Save history to localStorage
   * @private
   */
  _saveHistory() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.history));
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'import_history_save_error', 'Failed to save import history', {
        error: error.message
      });
    }
  }

  /**
   * Load recent files from localStorage
   * @private
   */
  _loadRecentFiles() {
    try {
      const data = localStorage.getItem(this.recentFilesKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      logger.warn(LogComponent.UI_COMPONENT, 'recent_files_load_error', 'Failed to load recent files', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Save recent files to localStorage
   * @private
   */
  _saveRecentFiles() {
    try {
      localStorage.setItem(this.recentFilesKey, JSON.stringify(this.recentFiles));
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'recent_files_save_error', 'Failed to save recent files', {
        error: error.message
      });
    }
  }

  /**
   * Generate a hash for a file based on name and size
   * @private
   */
  _generateFileHash(fileName, fileSize) {
    return `${fileName}_${fileSize}`;
  }

  /**
   * Export history as JSON
   * @returns {String} JSON string of history
   */
  exportHistoryAsJSON() {
    return JSON.stringify(this.history, null, 2);
  }

  /**
   * Export statistics as JSON
   * @returns {String} JSON string of statistics
   */
  exportStatisticsAsJSON() {
    return JSON.stringify(this.getStatistics(), null, 2);
  }
}

export default ImportHistoryService;
