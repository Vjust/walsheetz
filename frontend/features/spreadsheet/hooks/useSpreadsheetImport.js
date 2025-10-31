/**
 * useSpreadsheetImport Hook
 *
 * Manages spreadsheet initialization and import functionality.
 * Extracted from useSpreadsheet.js (Phase 3 refactoring).
 *
 * Responsibilities:
 * - Initialize local spreadsheets with templates
 * - Load imported data from Excel/CSV files
 * - Handle grid pre-allocation for large imports
 */

import { useCallback } from 'react';
import { getTemplateData } from '../../utils/templateData.js';
import { logger, LogComponent } from '@utils/logging/Logger.js';

/**
 * Hook for managing spreadsheet import and initialization
 *
 * @param {Object} options - Configuration options
 * @param {React.RefObject} options.engineRef - Reference to SpreadsheetEngine
 * @param {React.RefObject} options.storageRef - Reference to StorageAdapter
 * @param {React.RefObject} options.gridSizeManagerRef - Reference to GridSizeManager
 * @param {Function} options.setSpreadsheetData - State setter for spreadsheet data
 * @param {Function} options.setEditCount - State setter for edit count
 * @param {Function} options.setSaveStatus - State setter for save status
 * @returns {Object} Import functions
 */
export function useSpreadsheetImport({
  engineRef,
  storageRef,
  gridSizeManagerRef,
  setSpreadsheetData,
  setEditCount,
  setSaveStatus
}) {
  /**
   * Initialize local spreadsheet with template
   * Creates a new spreadsheet using a template (blank, financial, etc.)
   *
   * @param {Object} options - Initialization options
   * @param {string} options.title - Spreadsheet title
   * @param {string} options.template - Template name ('blank', 'financial', etc.)
   * @returns {Promise<Object>} Result with success flag
   */
  const initializeLocalSpreadsheet = useCallback(async ({ title, template }) => {
    if (!engineRef.current || !storageRef.current) {
      return { success: false, error: 'Services not initialized' };
    }

    try {
      // Get template data from pure utility
      const templateConfig = getTemplateData(template);

      // Create data structure in format engine expects
      const localData = {
        data: {
          version: `v${Date.now()}-local`,
          createdAt: Date.now(),
          savedAt: Date.now(),
          title,
          celldata: templateConfig.celldata || [],
          edits: [],
          metadata: {
            title,
            rows: templateConfig.rows || 100,
            cols: templateConfig.cols || 26,
            sheets: templateConfig.sheets || [{ name: 'Sheet1', index: 0, order: 0, status: 1 }],
            template,
            isLocal: true
          }
        }
      };

      // Clear current data and load template
      await storageRef.current.clearData();
      await engineRef.current.loadData(localData);

      // Update storage adapter state
      storageRef.current.setCurrentSpreadsheetId(null); // Signal local-only
      storageRef.current.setSpreadsheetTitle(title);

      // Update component state
      setSpreadsheetData(localData);
      setEditCount(0);
      setSaveStatus('ready');

      logger.info(LogComponent.BUSINESS_LOGIC, 'local_init_success', 'Local spreadsheet initialized', {
        title,
        template
      });

      return { success: true, title, isLocal: true };
    } catch (error) {
      logger.error(LogComponent.BUSINESS_LOGIC, 'local_init_error', 'Local init failed', {
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }, [engineRef, storageRef, setSpreadsheetData, setEditCount, setSaveStatus]);

  /**
   * Load imported data from spreadsheet import (Excel/CSV)
   * Handles grid pre-allocation for large sheets
   *
   * @param {Array} importedSheets - Array of sheets from import
   * @param {number} selectedSheetIndex - Index of sheet to load
   * @param {string} title - Title for the imported spreadsheet
   * @returns {Promise<Object>} Result with success flag
   */
  const loadImportedData = useCallback(async (importedSheets, selectedSheetIndex, title) => {
    if (!engineRef.current || !gridSizeManagerRef.current) {
      return { success: false, error: 'Services not initialized' };
    }

    try {
      logger.info(LogComponent.BUSINESS_LOGIC, 'import_load_start', 'Loading imported data', {
        sheetsCount: importedSheets?.length,
        selectedIndex: selectedSheetIndex,
        title
      });

      // Get the sheet to load
      const selectedSheet = importedSheets[selectedSheetIndex] || importedSheets[0];

      // Pre-allocate grid capacity before loading data
      if (selectedSheet.row && selectedSheet.column) {
        logger.debug(LogComponent.BUSINESS_LOGIC, 'import_prealloc', 'Pre-allocating grid', {
          rows: selectedSheet.row,
          cols: selectedSheet.column
        });

        gridSizeManagerRef.current.preallocateForImport({
          rows: selectedSheet.row,
          cols: selectedSheet.column
        });
      }

      // Construct data format expected by lifecycle hook
      const importData = {
        celldata: selectedSheet.celldata,
        data: {
          metadata: {
            title: title || selectedSheet.name || 'Imported Spreadsheet'
          }
        }
      };

      // Update state - lifecycle hook will detect and re-init with WalSheetz config
      setSpreadsheetData(importData);

      // Update storage metadata
      if (storageRef.current) {
        storageRef.current.setSpreadsheetTitle(title || selectedSheet.name || 'Imported Spreadsheet');
      }

      logger.info(LogComponent.BUSINESS_LOGIC, 'import_load_success', 'Imported data loaded', {
        title,
        cellCount: selectedSheet.celldata?.length || 0
      });

      return { success: true, title };
    } catch (error) {
      logger.error(LogComponent.BUSINESS_LOGIC, 'import_load_error', 'Failed to load imported data', {
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }, [engineRef, gridSizeManagerRef, storageRef, setSpreadsheetData]);

  return {
    initializeLocalSpreadsheet,
    loadImportedData
  };
}
