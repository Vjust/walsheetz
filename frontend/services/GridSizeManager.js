/**
 * Grid Size Manager
 * Manages dynamic grid capacity for Luckysheet
 * Prevents stack overflow by pre-allocating grid in chunks as needed
 */

import { logger, LogComponent } from '../utils/Logger.js';

/**
 * GridSizeManager - Tracks and manages spreadsheet grid capacity
 * Uses a square-equivalent model: capacity = sqrt of total cells allocated
 */
export class GridSizeManager {
  constructor(options = {}) {
    // Default capacity: 1000 cells (e.g., 25x40 or 20x50)
    this.DEFAULT_CAPACITY = options.defaultCapacity || 1000;
    // Chunk size: expand by this many cells at a time
    this.CHUNK_SIZE = options.chunkSize || 1000;

    // Current allocated capacity (in cell count)
    this.currentCapacity = this.DEFAULT_CAPACITY;

    // Current grid dimensions
    this.currentRows = Math.ceil(Math.sqrt(this.DEFAULT_CAPACITY));
    this.currentCols = Math.ceil(this.DEFAULT_CAPACITY / this.currentRows);

    // Listeners for capacity expansion events
    this.expansionListeners = [];

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'grid_manager_init', 'GridSizeManager initialized', {
      defaultCapacity: this.DEFAULT_CAPACITY,
      chunkSize: this.CHUNK_SIZE,
      initialRows: this.currentRows,
      initialCols: this.currentCols
    });
  }

  /**
   * Get the current grid capacity as cell count
   * @returns {number} Total cell capacity
   */
  getCapacity() {
    return this.currentCapacity;
  }

  /**
   * Get current grid dimensions
   * @returns {Object} { rows, cols }
   */
  getDimensions() {
    return {
      rows: this.currentRows,
      cols: this.currentCols
    };
  }

  /**
   * Calculate square-equivalent dimensions for a given capacity
   * Tries to maintain a roughly square aspect ratio for balance
   * @param {number} cellCount - Total cells to allocate
   * @returns {Object} { rows, cols }
   */
  _calculateDimensions(cellCount) {
    const sqrt = Math.ceil(Math.sqrt(cellCount));
    return {
      rows: sqrt,
      cols: Math.ceil(cellCount / sqrt)
    };
  }

  /**
   * Get the next capacity boundary (rounded up to nearest chunk)
   * @param {number} requiredCapacity - Minimum capacity needed
   * @returns {number} Next capacity boundary
   */
  _getNextCapacityBoundary(requiredCapacity) {
    if (requiredCapacity <= this.currentCapacity) {
      return this.currentCapacity;
    }

    // Round up to next chunk boundary
    const chunks = Math.ceil(requiredCapacity / this.CHUNK_SIZE);
    return chunks * this.CHUNK_SIZE;
  }

  /**
   * Ensure the grid has enough capacity for given dimensions
   * Will expand grid if necessary, returning new dimensions if expanded
   * @param {Object} required - { rows, cols } dimensions required
   * @returns {Object} { expanded: boolean, oldDimensions, newDimensions, rowsAdded, colsAdded }
   */
  ensureCapacity(required) {
    const { rows: reqRows, cols: reqCols } = required;
    const requiredCapacity = reqRows * reqCols;

    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'ensure_capacity_check', 'Checking grid capacity', {
      required: { rows: reqRows, cols: reqCols, capacity: requiredCapacity },
      current: { rows: this.currentRows, cols: this.currentCols, capacity: this.currentCapacity }
    });

    // Check if expansion is needed
    if (requiredCapacity <= this.currentCapacity &&
        reqRows <= this.currentRows &&
        reqCols <= this.currentCols) {
      return {
        expanded: false,
        reason: 'capacity_sufficient'
      };
    }

    // Calculate next capacity boundary
    const nextCapacity = this._getNextCapacityBoundary(requiredCapacity);
    const newDimensions = this._calculateDimensions(nextCapacity);

    const oldDimensions = {
      rows: this.currentRows,
      cols: this.currentCols
    };

    const rowsAdded = Math.max(0, newDimensions.rows - this.currentRows);
    const colsAdded = Math.max(0, newDimensions.cols - this.currentCols);

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'grid_capacity_expand', 'Expanding grid capacity', {
      oldCapacity: this.currentCapacity,
      newCapacity: nextCapacity,
      oldDimensions,
      newDimensions,
      rowsAdded,
      colsAdded
    });

    // Update state
    this.currentCapacity = nextCapacity;
    this.currentRows = newDimensions.rows;
    this.currentCols = newDimensions.cols;

    // Notify listeners
    this._notifyExpansion({
      oldDimensions,
      newDimensions,
      rowsAdded,
      colsAdded,
      capacityBefore: Math.ceil(oldDimensions.rows * oldDimensions.cols),
      capacityAfter: nextCapacity
    });

    return {
      expanded: true,
      oldDimensions,
      newDimensions,
      rowsAdded,
      colsAdded
    };
  }

  /**
   * Pre-allocate capacity for a large import
   * Useful for knowing upfront how much space you need
   * @param {Object} importDimensions - { rows, cols } from imported data
   * @returns {Object} Same as ensureCapacity result
   */
  preallocateForImport(importDimensions) {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'grid_prealloc_import', 'Preallocating for import', {
      importDimensions
    });

    return this.ensureCapacity(importDimensions);
  }

  /**
   * Reset capacity to default
   */
  reset() {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'grid_capacity_reset', 'Resetting grid capacity', {
      fromCapacity: this.currentCapacity,
      toCapacity: this.DEFAULT_CAPACITY
    });

    this.currentCapacity = this.DEFAULT_CAPACITY;
    const dims = this._calculateDimensions(this.DEFAULT_CAPACITY);
    this.currentRows = dims.rows;
    this.currentCols = dims.cols;
  }

  /**
   * Subscribe to capacity expansion events
   * @param {Function} listener - Called with expansion details
   */
  onExpand(listener) {
    this.expansionListeners.push(listener);
  }

  /**
   * Unsubscribe from capacity expansion events
   * @param {Function} listener - Listener to remove
   */
  offExpand(listener) {
    this.expansionListeners = this.expansionListeners.filter(l => l !== listener);
  }

  /**
   * Notify all listeners of expansion
   * @private
   */
  _notifyExpansion(details) {
    for (const listener of this.expansionListeners) {
      try {
        listener(details);
      } catch (error) {
        logger.warn(LogComponent.SPREADSHEET_ENGINE, 'expansion_listener_error', 'Error in expansion listener', {
          error: error?.message || String(error)
        });
      }
    }
  }

  /**
   * Get capacity info for debugging/telemetry
   */
  getInfo() {
    return {
      capacity: this.currentCapacity,
      dimensions: this.getDimensions(),
      utilizationPotential: this.currentCapacity, // Cells we can fill before needing to expand
      defaultCapacity: this.DEFAULT_CAPACITY,
      chunkSize: this.CHUNK_SIZE
    };
  }
}

// Create singleton instance
export const gridSizeManager = new GridSizeManager();

export default GridSizeManager;
