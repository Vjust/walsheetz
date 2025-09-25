/**
 * Luckysheet API Wrapper
 *
 * Provides a clean, typed interface to Luckysheet with normalized methods,
 * proper error handling, and fallback support for missing API methods.
 */

class LuckysheetApi {
  constructor() {
    this.isReady = false;
    this.readyPromise = null;
    this.loadingPromise = null;
  }

  /**
   * Ensure Luckysheet library is loaded and available
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<boolean>} - True if loaded successfully
   */
  async ensureLoaded(timeout = 10000) {
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = new Promise((resolve, reject) => {
      if (typeof window !== 'undefined' && window.luckysheet) {
        resolve(true);
        return;
      }

      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (typeof window !== 'undefined' && window.luckysheet) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error(`Luckysheet failed to load within ${timeout}ms`));
        }
      }, 100);
    });

    return this.loadingPromise;
  }

  /**
   * Wait for Luckysheet to be fully initialized and ready
   * @returns {Promise<void>}
   */
  async whenReady() {
    if (this.isReady) {
      return Promise.resolve();
    }

    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise((resolve) => {
      const checkReady = () => {
        if (this.isReady && window.luckysheet && document.getElementById('luckysheet-container')) {
          resolve();
        } else {
          setTimeout(checkReady, 50);
        }
      };
      checkReady();
    });

    return this.readyPromise;
  }

  /**
   * Initialize Luckysheet with configuration
   * @param {Object} config - Luckysheet configuration
   * @param {string} config.containerId - Container element ID
   * @param {Object} config.sheet - Sheet data and configuration
   * @param {Function} config.onReady - Callback when ready
   * @returns {Promise<void>}
   */
  async init(config) {
    await this.ensureLoaded();

    const {
      containerId = 'luckysheet-container',
      sheet = {},
      onReady = () => {},
      ...otherConfig
    } = config;

    // Clean up any existing instance
    await this.destroy();

    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element with ID '${containerId}' not found`);
    }

    container.innerHTML = '';

    const luckysheetConfig = {
      container: containerId,
      title: sheet.name || 'WalSheetz',
      lang: 'en',
      showinfobar: false,
      showstatisticBar: false,
      data: [sheet],
      ...otherConfig,
      hook: {
        ...otherConfig.hook,
        workbookCreateAfter: () => {
          this.isReady = true;
          if (otherConfig.hook?.workbookCreateAfter) {
            otherConfig.hook.workbookCreateAfter();
          }
          onReady();
        }
      }
    };

    window.luckysheet.create(luckysheetConfig);
  }

  /**
   * Destroy the current Luckysheet instance
   * @returns {Promise<void>}
   */
  async destroy() {
    if (window.luckysheet && typeof window.luckysheet.destroy === 'function') {
      try {
        window.luckysheet.destroy()
      } catch (error) {
        console.warn('Error destroying Luckysheet:', error)
      }
    }
    this.isReady = false
    this.readyPromise = null
  }

  /**
   * Get normalized selection information
   * @returns {Object|null} - Normalized selection object
   */
  getSelection() {
    if (!this.isReady || !window.luckysheet) return null;

    try {
      // Try modern API first
      if (window.luckysheet.getRange) {
        const ranges = window.luckysheet.getRange();
        if (ranges && ranges.length > 0) {
          const range = ranges[0];
          return {
            startRow: Array.isArray(range.row) ? range.row[0] : range.row,
            endRow: Array.isArray(range.row) ? range.row[1] : range.row,
            startCol: Array.isArray(range.column) ? range.column[0] : range.column,
            endCol: Array.isArray(range.column) ? range.column[1] : range.column
          };
        }
      }

      // Fallback to legacy selection
      if (window.luckysheet.getActiveRange) {
        const range = window.luckysheet.getActiveRange();
        if (range) {
          return {
            startRow: Array.isArray(range.row) ? range.row[0] : range.row,
            endRow: Array.isArray(range.row) ? range.row[1] : range.row,
            startCol: Array.isArray(range.column) ? range.column[0] : range.column,
            endCol: Array.isArray(range.column) ? range.column[1] : range.column
          };
        }
      }

      // Final fallback to global selection variable
      if (window.luckysheet_select_save && window.luckysheet_select_save.length > 0) {
        const sel = window.luckysheet_select_save[0];
        return {
          startRow: sel.row ? sel.row[0] : sel.r,
          endRow: sel.row ? sel.row[1] : sel.r,
          startCol: sel.column ? sel.column[0] : sel.c,
          endCol: sel.column ? sel.column[1] : sel.c
        };
      }
    } catch (error) {
      console.warn('Error getting selection:', error);
    }

    return null;
  }

  /**
   * Get active cell coordinates
   * @returns {Object|null} - {row, col} or null
   */
  getActiveCell() {
    const selection = this.getSelection();
    if (selection) {
      return {
        row: selection.startRow,
        col: selection.startCol
      };
    }
    return null;
  }

  /**
   * Get cell value with type information
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @param {Object} options - Options like {type: 'object'}
   * @returns {any} - Cell value or cell object
   */
  getCellValue(row, col, options = {}) {
    if (!this.isReady || !window.luckysheet) return null;

    try {
      if (window.luckysheet.getCellValue) {
        return window.luckysheet.getCellValue(row, col, options);
      }
    } catch (error) {
      console.warn('Error getting cell value:', error);
    }

    return null;
  }

  /**
   * Set cell value
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @param {any} value - Cell value to set
   * @param {Object} options - Options for setting value
   */
  setCellValue(row, col, value, options = {}) {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.setCellValue) {
        window.luckysheet.setCellValue(row, col, value, options);
      } else if (window.luckysheet.setcellvalue) {
        // Fallback to alternative method name
        window.luckysheet.setcellvalue(row, col, value, options);
      }
    } catch (error) {
      console.warn('Error setting cell value:', error);
    }
  }

  /**
   * Set cell format attribute
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @param {string} attr - Format attribute (bl, it, un, etc.)
   * @param {any} value - Format value
   */
  setCellFormat(row, col, attr, value) {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.setCellFormat) {
        window.luckysheet.setCellFormat(row, col, attr, value);
      }
    } catch (error) {
      console.warn('Error setting cell format:', error);
    }
  }

  /**
   * Get all sheets data
   * @returns {Array} - Array of sheet objects
   */
  getAllSheets() {
    if (!this.isReady || !window.luckysheet) return [];

    try {
      if (window.luckysheet.getAllSheets) {
        return window.luckysheet.getAllSheets();
      }

      // Fallback to global variable
      if (window.luckysheetfile) {
        return window.luckysheetfile;
      }
    } catch (error) {
      console.warn('Error getting all sheets:', error);
    }

    return [];
  }

  /**
   * Zoom the spreadsheet
   * @param {number} ratio - Zoom ratio (e.g., 1.2 for 120%)
   */
  zoom(ratio) {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.zoom) {
        window.luckysheet.zoom(ratio);
      }
    } catch (error) {
      console.warn('Error zooming:', error);
    }
  }

  /**
   * Refresh the spreadsheet display
   * @param {string} type - Refresh type ('auto', 'all', etc.)
   */
  refresh(type = 'auto') {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (type === 'all' && window.luckysheet.refreshAll) {
        window.luckysheet.refreshAll();
      } else if (window.luckysheet.refresh) {
        window.luckysheet.refresh();
      } else if (window.luckysheet.refreshFormula) {
        window.luckysheet.refreshFormula();
      }
    } catch (error) {
      console.warn('Error refreshing:', error);
    }
  }

  /**
   * Undo last action
   */
  undo() {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.undo) {
        window.luckysheet.undo();
      }
    } catch (error) {
      console.warn('Error undoing:', error);
    }
  }

  /**
   * Redo last undone action
   */
  redo() {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.redo) {
        window.luckysheet.redo();
      }
    } catch (error) {
      console.warn('Error redoing:', error);
    }
  }

  /**
   * Refresh formulas in the spreadsheet
   */
  refreshFormula() {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.refreshFormula) {
        window.luckysheet.refreshFormula();
      }
    } catch (error) {
      console.warn('Error refreshing formulas:', error);
    }
  }

  /**
   * Copy selection
   */
  copy() {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.copy) {
        window.luckysheet.copy();
      }
    } catch (error) {
      console.warn('Error copying:', error);
    }
  }

  /**
   * Cut selection
   */
  cut() {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.cut) {
        window.luckysheet.cut();
      }
    } catch (error) {
      console.warn('Error cutting:', error);
    }
  }

  /**
   * Paste from clipboard
   */
  paste() {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.paste) {
        window.luckysheet.paste();
      }
    } catch (error) {
      console.warn('Error pasting:', error);
    }
  }

  /**
   * Insert row
   * @param {number} index - Row index to insert at
   */
  insertRow(index) {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.insertRow) {
        window.luckysheet.insertRow(index);
      }
    } catch (error) {
      console.warn('Error inserting row:', error);
    }
  }

  /**
   * Delete row
   * @param {number} index - Row index to delete
   */
  deleteRow(index) {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.deleteRow) {
        window.luckysheet.deleteRow(index);
      }
    } catch (error) {
      console.warn('Error deleting row:', error);
    }
  }

  /**
   * Insert column
   * @param {number} index - Column index to insert at
   */
  insertColumn(index) {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.insertColumn) {
        window.luckysheet.insertColumn(index);
      }
    } catch (error) {
      console.warn('Error inserting column:', error);
    }
  }

  /**
   * Delete column
   * @param {number} index - Column index to delete
   */
  deleteColumn(index) {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.deleteColumn) {
        window.luckysheet.deleteColumn(index);
      }
    } catch (error) {
      console.warn('Error deleting column:', error);
    }
  }

  /**
   * Sort selection
   * @param {Object} options - Sort options
   */
  sort(options = {}) {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.sort) {
        window.luckysheet.sort(options);
      }
    } catch (error) {
      console.warn('Error sorting:', error);
    }
  }

  /**
   * Sort selection by ascending/descending order
   * @param {boolean} ascending - True for ascending, false for descending
   */
  sortSelection(ascending = true) {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.sortSelection) {
        window.luckysheet.sortSelection(ascending);
      } else if (window.luckysheet.sort) {
        // Fallback to generic sort method
        window.luckysheet.sort({ order: ascending ? 'asc' : 'desc' });
      }
    } catch (error) {
      console.warn('Error sorting selection:', error);
    }
  }

  /**
   * Export to Excel
   * @param {string} documentName - Name for the exported document
   * @param {Object} options - Export options
   */
  exportToExcel(documentName = 'WalSheetz_Export', options = {}) {
    if (!this.isReady || !window.luckysheet) return false;

    try {
      // Try modern export method first
      if (window.luckysheet.exportLuckyToExcel) {
        window.luckysheet.exportLuckyToExcel(documentName, options);
        return true;
      }
      // Fallback to legacy export method
      else if (window.luckysheet.export) {
        window.luckysheet.export('excel', documentName);
        return true;
      }
    } catch (error) {
      console.warn('Error exporting to Excel:', error);
    }

    return false;
  }

  /**
   * Rename current sheet
   * @param {string} name - New sheet name
   */
  renameSheet(name) {
    if (!this.isReady || !window.luckysheet) return;

    try {
      if (window.luckysheet.renameSheet) {
        window.luckysheet.renameSheet(name);
      } else if (window.luckysheetfile && window.luckysheetfile[0]) {
        // Fallback: directly modify the sheet name
        window.luckysheetfile[0].name = name;
        this.refresh('all');
      }
    } catch (error) {
      console.warn('Error renaming sheet:', error);
    }
  }
}

// Create singleton instance
const luckysheetApi = new LuckysheetApi();

// Phase 0: Temporarily expose for console testing
if (typeof window !== 'undefined') {
  window.luckysheetApi = luckysheetApi;
}

export default luckysheetApi;