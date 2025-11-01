/**
 * FormulaRefreshScheduler
 *
 * Manages periodic refresh of formula cells in the spreadsheet.
 * Extracted from SpreadsheetEngine.js (Phase 4 refactoring).
 *
 * Responsibilities:
 * - Register/unregister cells for periodic refresh
 * - Schedule and execute cell formula recalculations
 * - Clamp intervals to safe bounds (5s - 1h)
 * - Enable/disable refresh globally
 */

import { logger, LogComponent } from "@/sdk/utils/Logger.js";

/**
 * Scheduler for periodic formula cell refreshes
 */
export class FormulaRefreshScheduler {
  /**
   * Create a new FormulaRefreshScheduler
   */
  constructor() {
    // Formula refresh scheduling
    this.refreshSchedules = new Map(); // cellRef -> { interval, lastRun, formula, enabled }
    this.refreshSchedulerTimer = null; // Main scheduler loop
    this.refreshSchedulerInterval = 1000; // Check every second for cells to refresh
    this.minRefreshInterval = 5000; // Minimum 5 seconds between refreshes for a cell
    this.maxRefreshInterval = 3600000; // Maximum 1 hour between refreshes
    this.refreshEnabled = true; // Global enable/disable flag

    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'formula_scheduler_init',
    'FormulaRefreshScheduler initialized');
  }

  /**
   * Register a cell for periodic refresh
   * @param {string} cellRef - Cell reference (e.g., "A1", "B5")
   * @param {number} interval - Refresh interval in milliseconds
   * @param {string} formula - Formula to re-execute
   */
  registerCellForRefresh(cellRef, interval, formula) {
    // Validate interval
    const clampedInterval = Math.max(
      this.minRefreshInterval,
      Math.min(interval, this.maxRefreshInterval)
    );

    if (clampedInterval !== interval) {
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'register_refresh',
      `Refresh interval clamped for cell ${cellRef}`, {
        requested: interval,
        actual: clampedInterval
      });
    }

    // Store schedule
    this.refreshSchedules.set(cellRef, {
      interval: clampedInterval,
      lastRun: Date.now(),
      formula,
      enabled: true
    });

    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'register_refresh',
    `Registered cell for refresh`, {
      cellRef,
      interval: clampedInterval,
      formula: formula.substring(0, 50)
    });

    // Start scheduler if not already running
    if (!this.refreshSchedulerTimer && this.refreshEnabled) {
      this.startRefreshScheduler();
    }
  }

  /**
   * Unregister a cell from periodic refresh
   * @param {string} cellRef - Cell reference
   */
  unregisterCellForRefresh(cellRef) {
    const removed = this.refreshSchedules.delete(cellRef);

    if (removed) {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'unregister_refresh',
      `Unregistered cell from refresh`, { cellRef });
    }

    // Stop scheduler if no more cells to refresh
    if (this.refreshSchedules.size === 0 && this.refreshSchedulerTimer) {
      this.stopRefreshScheduler();
    }
  }

  /**
   * Start the refresh scheduler loop
   */
  startRefreshScheduler() {
    if (this.refreshSchedulerTimer) {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'start_refresh_scheduler',
      'Refresh scheduler already running');
      return;
    }

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'start_refresh_scheduler',
    'Starting refresh scheduler', {
      cellCount: this.refreshSchedules.size,
      interval: this.refreshSchedulerInterval
    });

    this.refreshSchedulerTimer = setInterval(
      () => this._runRefreshScheduler(),
      this.refreshSchedulerInterval
    );
  }

  /**
   * Stop the refresh scheduler loop
   */
  stopRefreshScheduler() {
    if (this.refreshSchedulerTimer) {
      clearInterval(this.refreshSchedulerTimer);
      this.refreshSchedulerTimer = null;

      logger.info(LogComponent.SPREADSHEET_ENGINE, 'stop_refresh_scheduler',
      'Refresh scheduler stopped');
    }
  }

  /**
   * Enable/disable refresh scheduler globally
   * @param {boolean} enabled - Enable or disable
   */
  setRefreshEnabled(enabled) {
    this.refreshEnabled = enabled;

    if (enabled && this.refreshSchedules.size > 0 && !this.refreshSchedulerTimer) {
      this.startRefreshScheduler();
    } else if (!enabled && this.refreshSchedulerTimer) {
      this.stopRefreshScheduler();
    }

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'set_refresh_enabled',
    `Refresh scheduler ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Main refresh scheduler loop - checks all cells and refreshes as needed
   * @private
   */
  _runRefreshScheduler() {
    const now = Date.now();
    const toRefresh = [];

    // Check each registered cell
    for (const [cellRef, schedule] of this.refreshSchedules.entries()) {
      if (!schedule.enabled) continue;

      const timeSinceLastRun = now - schedule.lastRun;
      if (timeSinceLastRun >= schedule.interval) {
        toRefresh.push({ cellRef, schedule });
      }
    }

    // Refresh cells
    if (toRefresh.length > 0) {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'refresh_scheduler',
      `Refreshing ${toRefresh.length} cells`, {
        cells: toRefresh.map((r) => r.cellRef)
      });

      toRefresh.forEach(({ cellRef, schedule }) => {
        this._refreshCell(cellRef, schedule);
        schedule.lastRun = now;
      });
    }
  }

  /**
   * Refresh a specific cell by re-executing its formula
   * @private
   * @param {string} cellRef - Cell reference
   * @param {Object} schedule - Refresh schedule object
   */
  async _refreshCell(cellRef, schedule) {
    try {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'refresh_cell',
      `Refreshing cell ${cellRef}`, { formula: schedule.formula });

      // Re-execute formula via Luckysheet if available
      if (window.luckysheet) {
        // Parse cell reference (e.g., "A1" -> row=0, col=0)
        const match = cellRef.match(/^([A-Z]+)(\d+)$/);
        if (match) {
          const col = match[1].charCodeAt(0) - 65; // A=0, B=1, etc.
          const row = parseInt(match[2]) - 1; // 1-indexed to 0-indexed

          // Get current cell value
          const currentValue = window.luckysheet.getCellValue(row, col);

          // Only refresh if it's still a formula
          if (currentValue && typeof currentValue === 'object' && currentValue.f) {
            // Force recalculation by setting the same formula
            window.luckysheet.setCellValue(row, col, currentValue);

            logger.debug(LogComponent.SPREADSHEET_ENGINE, 'refresh_cell',
            `Cell ${cellRef} refreshed`, { row, col });
          } else {
            // Cell no longer contains a formula, unregister it
            logger.warn(LogComponent.SPREADSHEET_ENGINE, 'refresh_cell',
            `Cell ${cellRef} no longer has formula, unregistering`, { currentValue });
            this.unregisterCellForRefresh(cellRef);
          }
        }
      }
    } catch (error) {
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'refresh_cell_error',
      `Error refreshing cell ${cellRef}`, {
        error: error.message,
        cellRef
      });
    }
  }

  /**
   * Cleanup - stop all timers
   */
  cleanup() {
    this.stopRefreshScheduler();
    this.refreshSchedules.clear();

    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'formula_scheduler_cleanup',
    'FormulaRefreshScheduler cleaned up');
  }
}