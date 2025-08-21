import { IStorageService } from '../interfaces/IStorageService.js';

/**
 * Storage service adapter implementing IStorageService
 */
export class StorageAdapter extends IStorageService {
  constructor() {
    super();
    this.storageKey = 'walsheetz_data';
    this.historyKey = 'walsheetz_history';
    this.maxHistoryEntries = 100;
  }

  async saveData(data) {
    try {
      const saveData = {
        ...data,
        savedAt: Date.now(),
        version: data.version || this.generateVersion()
      };

      // Save to localStorage
      localStorage.setItem(this.storageKey, JSON.stringify(saveData));
      
      // Update history
      await this.updateHistory(saveData);

      console.log('Data saved to localStorage:', saveData);
      
      return { success: true };
    } catch (error) {
      console.error('Failed to save data:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async loadData() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      
      if (!stored) {
        // Return default empty spreadsheet data
        return this.getDefaultData();
      }

      const data = JSON.parse(stored);
      console.log('Data loaded from localStorage:', data);
      
      return data;
    } catch (error) {
      console.error('Failed to load data:', error);
      
      // Return default data on error
      return this.getDefaultData();
    }
  }

  getCellHistory(row, col) {
    try {
      const historyData = localStorage.getItem(this.historyKey);
      
      if (!historyData) {
        return [];
      }

      const history = JSON.parse(historyData);
      const cellKey = `${row}-${col}`;
      
      return history[cellKey] || [];
    } catch (error) {
      console.error('Failed to get cell history:', error);
      return [];
    }
  }

  async clearData() {
    try {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem(this.historyKey);
      console.log('All data cleared from localStorage');
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw error;
    }
  }

  async updateHistory(data) {
    try {
      let history = {};
      
      const existingHistory = localStorage.getItem(this.historyKey);
      if (existingHistory) {
        history = JSON.parse(existingHistory);
      }

      // Add current save to history if it contains edits
      if (data.edits && Array.isArray(data.edits)) {
        data.edits.forEach(edit => {
          const cellKey = `${edit.row}-${edit.col}`;
          
          if (!history[cellKey]) {
            history[cellKey] = [];
          }
          
          history[cellKey].push({
            oldValue: edit.oldValue,
            newValue: edit.newValue,
            timestamp: edit.timestamp,
            version: data.version
          });

          // Limit history entries per cell
          if (history[cellKey].length > this.maxHistoryEntries) {
            history[cellKey] = history[cellKey].slice(-this.maxHistoryEntries);
          }
        });
      }

      localStorage.setItem(this.historyKey, JSON.stringify(history));
    } catch (error) {
      console.error('Failed to update history:', error);
    }
  }

  getDefaultData() {
    return {
      version: this.generateVersion(),
      createdAt: Date.now(),
      savedAt: Date.now(),
      edits: [],
      metadata: {
        title: 'New Spreadsheet',
        rows: 20,
        cols: 10
      }
    };
  }

  generateVersion() {
    return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Additional utility methods
  getStorageInfo() {
    try {
      const data = localStorage.getItem(this.storageKey);
      const history = localStorage.getItem(this.historyKey);
      
      return {
        hasData: !!data,
        dataSize: data ? data.length : 0,
        hasHistory: !!history,
        historySize: history ? history.length : 0,
        totalSize: (data?.length || 0) + (history?.length || 0)
      };
    } catch (error) {
      return {
        hasData: false,
        dataSize: 0,
        hasHistory: false,
        historySize: 0,
        totalSize: 0,
        error: error.message
      };
    }
  }

  async exportData() {
    try {
      const data = await this.loadData();
      const history = localStorage.getItem(this.historyKey);
      
      return {
        spreadsheet: data,
        history: history ? JSON.parse(history) : {},
        exportedAt: Date.now()
      };
    } catch (error) {
      throw new Error(`Failed to export data: ${error.message}`);
    }
  }

  async importData(importedData) {
    try {
      if (importedData.spreadsheet) {
        await this.saveData(importedData.spreadsheet);
      }
      
      if (importedData.history) {
        localStorage.setItem(this.historyKey, JSON.stringify(importedData.history));
      }
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}