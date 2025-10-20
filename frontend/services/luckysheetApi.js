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
    this.gridSizeManager = null; // Will be set during init
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
   * @param {Object} config.gridSizeManager - GridSizeManager instance for capacity tracking
   * @returns {Promise<void>}
   */
  async init(config) {
    await this.ensureLoaded();

    const {
      containerId = 'luckysheet-container',
      sheet = {},
      onReady = () => {},
      gridSizeManager = null,
      ...otherConfig
    } = config;

    // Store reference to grid size manager
    this.gridSizeManager = gridSizeManager;

    // Clean up any existing instance
    await this.destroy();

    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element with ID '${containerId}' not found`);
    }

    container.innerHTML = '';

    // Use capacity-aware dimensions from GridSizeManager if available
    let sheetToInit = { ...sheet };
    if (gridSizeManager) {
      const dims = gridSizeManager.getDimensions();
      // Use manager's dimensions for initialization (ensures pre-allocated capacity)
      sheetToInit.row = dims.rows;
      sheetToInit.column = dims.cols;
    } else {
      // Fallback: use sheet dimensions or sensible defaults
      sheetToInit.row = sheet.row || 100;
      sheetToInit.column = sheet.column || 26;
    }

    const luckysheetConfig = {
      container: containerId,
      title: sheet.name || 'WalSheetz',
      lang: 'en',
      showinfobar: false,
      showstatisticBar: false,
      data: [sheetToInit],
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
   * Properly cleans up DOM elements and waits for cleanup to complete
   * @returns {Promise<void>}
   */
  async destroy() {
    try {
      // Call Luckysheet destroy if available
      if (window.luckysheet && typeof window.luckysheet.destroy === 'function') {
        try {
          window.luckysheet.destroy()
        } catch (error) {
          console.warn('Error destroying Luckysheet:', error)
        }
      }

      // Clear any canvas elements that may still exist
      const containers = document.querySelectorAll('[id^="luckysheet"], canvas')
      containers.forEach(el => {
        if (el && el.parentNode) {
          // For canvas elements, clear the context
          if (el.tagName === 'CANVAS') {
            const ctx = el.getContext('2d')
            if (ctx) {
              ctx.clearRect(0, 0, el.width, el.height)
            }
          }
        }
      })

      // Clear the main container
      const container = document.getElementById('luckysheet') || document.getElementById('luckysheet-container')
      if (container) {
        container.innerHTML = ''
      }

      // Reset state
      this.isReady = false
      this.readyPromise = null

      // Wait for DOM to settle before returning
      // This ensures all cleanup is complete before next operation
      await new Promise(resolve => {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => {
            setTimeout(resolve, 0)
          })
        } else {
          setTimeout(resolve, 10)
        }
      })
    } catch (error) {
      console.warn('Error during destroy cleanup:', error)
      // Don't throw - allow cleanup to continue even with errors
      this.isReady = false
      this.readyPromise = null
    }
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

  /**
   * Ensure grid has enough capacity for data
   * Called before loading large imports to pre-allocate grid space
   * @param {Object} required - { rows, cols } required dimensions
   * @returns {boolean} True if capacity was ensured
   */
  ensureGridCapacity(required) {
    if (!this.gridSizeManager || !this.isReady) {
      console.debug('Grid capacity check skipped: manager or luckysheet not ready');
      return false;
    }

    try {
      const result = this.gridSizeManager.ensureCapacity(required);

      if (result.expanded && window.luckysheetfile && window.luckysheetfile[0]) {
        // Update the current sheet with new dimensions
        window.luckysheetfile[0].row = result.newDimensions.rows;
        window.luckysheetfile[0].column = result.newDimensions.cols;

        // Refresh to apply new grid dimensions
        this.refresh('all');

        console.debug('Grid expanded:', {
          oldDims: result.oldDimensions,
          newDims: result.newDimensions,
          rowsAdded: result.rowsAdded,
          colsAdded: result.colsAdded
        });
      }

      return result.expanded;
    } catch (error) {
      console.warn('Error ensuring grid capacity:', error);
      return false;
    }
  }

  /**
   * Get current grid dimensions from Luckysheet
   * @returns {Object|null} { rows, cols } or null
   */
  getGridDimensions() {
    if (!this.isReady || !window.luckysheetfile || !window.luckysheetfile[0]) {
      return null;
    }

    return {
      rows: window.luckysheetfile[0].row || 100,
      cols: window.luckysheetfile[0].column || 26
    };
  }

  /**
   * Check for required Luckysheet methods
   * Useful for diagnosing CDN version issues
   * @returns {Object} { available, missing }
   */
  checkRequiredMethods() {
    const requiredMethods = [
      'create', 'destroy', 'undo', 'redo', 'refresh', 'refreshFormula',
      'copy', 'paste', 'cut', 'zoom', 'getAllSheets'
    ];

    const available = [];
    const missing = [];

    if (!window.luckysheet) {
      return { available: [], missing: requiredMethods, error: 'Luckysheet not loaded' };
    }

    requiredMethods.forEach(method => {
      if (typeof window.luckysheet[method] === 'function') {
        available.push(method);
      } else {
        missing.push(method);
      }
    });

    const result = { available, missing };

    if (missing.length > 0) {
      console.warn('[LuckysheetApi] Missing methods:', missing);
    } else {
      console.log('[LuckysheetApi] ✅ All required methods are available');
    }

    return result;
  }

  /**
   * Verify CDN version by checking Script tag
   * @returns {Object} { version, scriptSrc, cdnProvider }
   */
  verifyCDNVersion() {
    if (!window.luckysheet) {
      return { error: 'Luckysheet not loaded' };
    }

    const scripts = Array.from(document.querySelectorAll('script'));
    const luckysheetScript = scripts.find(s => s.src && s.src.includes('luckysheet'));

    if (!luckysheetScript) {
      return { warning: 'Could not find Luckysheet script tag' };
    }

    // Parse version from CDN URL (e.g., luckysheet@2.1.13)
    const versionMatch = luckysheetScript.src.match(/luckysheet@([\d.]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    // Detect CDN provider
    let cdnProvider = 'unknown';
    if (luckysheetScript.src.includes('jsdelivr')) cdnProvider = 'jsDelivr';
    if (luckysheetScript.src.includes('unpkg')) cdnProvider = 'unpkg';
    if (luckysheetScript.src.includes('cdnjs')) cdnProvider = 'cdnjs';

    console.log('[LuckysheetApi] CDN Info:', { version, cdnProvider, scriptSrc: luckysheetScript.src });

    return {
      version,
      scriptSrc: luckysheetScript.src,
      cdnProvider
    };
  }
}

// Create singleton instance
const luckysheetApi = new LuckysheetApi();

// Phase 0: Temporarily expose for console testing
if (typeof window !== 'undefined') {
  window.luckysheetApi = luckysheetApi;
}

export default luckysheetApi;