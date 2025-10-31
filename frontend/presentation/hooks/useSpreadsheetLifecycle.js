/**
 * useSpreadsheetLifecycle Hook
 *
 * Manages Luckysheet initialization lifecycle with clean state machine:
 * IDLE → LOADING → READY → (ERROR if failed)
 *
 * Key features:
 * - Idempotent initialization (safe to call multiple times)
 * - Proper cleanup of event listeners
 * - Clear error handling
 * - Prevents duplicate canvas/listener issues
 *
 * @param {Object} config - Configuration object
 * @param {Object} config.spreadsheetData - Sheet data to load
 * @param {Function} config.handleCellEdit - Cell edit handler
 * @param {Function} config.setCurrentCell - Current cell setter
 * @param {Function} config.handleFormulaChange - Formula change handler
 * @param {Function} config.clearFormulaPreview - Formula preview clearer
 * @param {Function} config.saveToBlockchain - Blockchain save handler
 * @param {Function} config.setLuckysheetReady - Ready state setter
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import luckysheetApi from '../../services/luckysheetApi.js';
import { luckysheetAdapter } from '../../services/luckysheet/LuckysheetAdapter.js';
import { registerWalSheetzFunctions } from '../../services/formulas/WalSheetzFunctions.js';
import { convertToLuckysheetData, calculateSheetDimensions } from '../../services/luckysheet/dataTransforms.js';
import { columnLettersToNumber, columnNumberToLetters } from '../../utils/cellUtils.js';

const INIT_RETRY_INTERVAL = 100;
const INIT_TIMEOUT = 10000;

export function useSpreadsheetLifecycle({
  spreadsheetData,
  handleCellEdit,
  setCurrentCell,
  handleFormulaChange,
  clearFormulaPreview,
  saveToBlockchain,
  setLuckysheetReady
}) {
  const [lifecycleState, setLifecycleState] = useState('IDLE');
  const luckysheetRef = useRef(null);
  const previousCellValueRef = useRef(null);
  const domEventListenersRef = useRef([]);
  const lastInitializedDataRef = useRef(null);

  /**
   * Initialize Luckysheet instance
   */
  const initLuckysheet = useCallback(async () => {
    const container = document.getElementById('luckysheet-container');

    if (typeof window.luckysheet === 'undefined') {
      console.log('[Lifecycle] Luckysheet not loaded yet');
      return false;
    }

    if (!container) {
      console.warn('[Lifecycle] Container not found');
      return false;
    }

    // Check if already initialized with same data
    if (luckysheetRef.current && window.luckysheet && window.luckysheet.getluckysheetfile) {
      const currentDataString = JSON.stringify(spreadsheetData);
      const lastDataString = lastInitializedDataRef.current;
      if (currentDataString === lastDataString) {
        console.log('[Lifecycle] Already initialized with same data');
        return true;
      }
    }

    // Cleanup existing instance
    const existingCanvas = container.querySelector('canvas');
    if (existingCanvas) {
      console.log('[Lifecycle] Cleaning up existing instance');
      try {
        if (window.luckysheet && typeof window.luckysheet.destroy === 'function') {
          window.luckysheet.destroy();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (e) {
        console.warn('[Lifecycle] Cleanup error:', e);
      }
    }

    // Clear container
    try {
      if (window.luckysheet && typeof window.luckysheet.destroy === 'function') {
        window.luckysheet.destroy();
      }
    } catch (e) {
      // Ignore
    }

    luckysheetRef.current = false;
    container.innerHTML = '';

    // Wait for DOM to be ready
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      console.log('[Lifecycle] Initializing Luckysheet...');
      setLifecycleState('LOADING');

      // Convert data
      const celldata = convertToLuckysheetData(spreadsheetData);
      console.log('[Lifecycle] Converted celldata:', celldata.length, 'cells');

      // Calculate actual dimensions from celldata (don't hardcode grid size)
      const { rows: actualRows, cols: actualCols } = calculateSheetDimensions(celldata);
      console.log('[Lifecycle] Calculated sheet dimensions:', { rows: actualRows, cols: actualCols });

      // Build WZ function definitions using public API
      const {
        tree: wzFunctionTree,
        functionList: wzFunctionList
      } = luckysheetAdapter.buildWZFunctionDefinitions();

      await luckysheetApi.init({
        containerId: 'luckysheet-container',
        sheet: {
          name: spreadsheetData?.data?.metadata?.title || spreadsheetData?.title || "Sheet1",
          color: "",
          index: 0,
          status: 1,
          order: 0,
          hide: 0,
          row: actualRows,
          column: actualCols,
          defaultRowHeight: 25,
          defaultColWidth: 80,
          celldata: celldata,
          config: {},
          scrollLeft: 0,
          scrollTop: 0,
          luckysheet_select_save: [],
          calcChain: [],
          isPivotTable: false,
          pivotTable: {},
          filter_select: {},
          filter: null,
          luckysheet_alternateformat_save: [],
          luckysheet_alternateformat_save_modelCustom: [],
          luckysheet_conditionformat_save: {},
          frozen: {},
          chart: [],
          zoomRatio: 1,
          image: [],
          showGridLines: 1,
          dataVerification: {},
          luckysheet_function: wzFunctionTree,
          functionList: wzFunctionList,
          functionlist: wzFunctionList
        },
        title: 'WalSheetz',
        lang: 'en',
        showinfobar: false,
        showstatisticBar: false,
        hook: {
          workbookCreateAfter: function() {
            console.log('[Lifecycle] Workbook created');
            luckysheetRef.current = true;
            setLifecycleState('READY');

            if (setLuckysheetReady) {
              setLuckysheetReady(true);
            }

            // Register functions
            try {
              registerWalSheetzFunctions();
            } catch (error) {
              console.error('[Lifecycle] Failed to register functions:', error);
            }
          },
          // Other hooks...
          cellEditBefore: function(range) {
            // Handle cellEditBefore
            if (range && range.length > 0) {
              const cell = range[0];
              const row = cell.row?.[0] ?? cell.r?.[0] ?? cell.row ?? cell.r;
              const column = cell.column?.[0] ?? cell.c?.[0] ?? cell.column ?? cell.c;

              if (row != null && column != null) {
                try {
                  const oldValue = window.luckysheet.getCellValue(row, column);
                  previousCellValueRef.current = { row, column, oldValue };
                } catch (e) {
                  previousCellValueRef.current = { row, column, oldValue: '' };
                }

                const cellRef = columnNumberToLetters(column) + (row + 1);
                setCurrentCell(cellRef);
              }
            }
          },
          cellEditEnd: function(range, value) {
            if (!range || range.length === 0) return;

            const cell = range[0];
            const row = cell.row?.[0] ?? cell.r?.[0] ?? cell.row ?? cell.r;
            const column = cell.column?.[0] ?? cell.c?.[0] ?? cell.column ?? cell.c;

            if (row != null && column != null && typeof row === 'number' && typeof column === 'number') {
              let oldValue = '';
              if (previousCellValueRef.current?.row === row && previousCellValueRef.current?.column === column) {
                oldValue = previousCellValueRef.current.oldValue;
              }

              if (handleCellEdit) {
                handleCellEdit(row, column, oldValue, value);
              }

              if (handleFormulaChange) {
                if (typeof value === 'string' && value.startsWith('=')) {
                  handleFormulaChange(value);
                } else {
                  handleFormulaChange(value || '');
                }
              }
            }
          },
          cellMousedown: function(cell) {
            if (!luckysheetRef.current || !cell) return;

            const row = cell.row?.[0] ?? cell.r?.[0] ?? cell.row ?? cell.r;
            const column = cell.column?.[0] ?? cell.c?.[0] ?? cell.column ?? cell.c;

            if (row != null && column != null && typeof row === 'number' && typeof column === 'number') {
              const cellRef = columnNumberToLetters(column) + (row + 1);
              setCurrentCell(cellRef);

              if (clearFormulaPreview) {
                clearFormulaPreview();
              }

              if (handleFormulaChange) {
                const cellValue = window.luckysheet.getCellValue(row, column);
                if (cellValue && typeof cellValue === 'object' && cellValue.f) {
                  handleFormulaChange('=' + cellValue.f);
                } else {
                  handleFormulaChange(cellValue || '');
                }
              }
            }
          }
        }
      });

      lastInitializedDataRef.current = JSON.stringify(spreadsheetData);
      return true;

    } catch (error) {
      console.error('[Lifecycle] Initialization failed:', error);
      setLifecycleState('ERROR');
      return false;
    }
  }, [spreadsheetData, handleCellEdit, setCurrentCell, handleFormulaChange, clearFormulaPreview, setLuckysheetReady, convertToLuckysheetData]);

  /**
   * Cleanup function
   */
  const cleanup = useCallback(() => {
    console.log('[Lifecycle] Cleaning up...');

    // Remove DOM listeners
    domEventListenersRef.current.forEach(({ element, event, handler }) => {
      try {
        element.removeEventListener(event, handler);
      } catch (e) {
        console.warn('[Lifecycle] Error removing listener:', e);
      }
    });
    domEventListenersRef.current = [];

    // Destroy Luckysheet
    if (luckysheetRef.current && window.luckysheet) {
      try {
        luckysheetApi.destroy?.();
      } catch (e) {
        console.error('[Lifecycle] Error destroying via API:', e);
      }

      try {
        window.luckysheet.destroy?.();
      } catch (e) {
        console.error('[Lifecycle] Error destroying via global:', e);
      }

      luckysheetRef.current = false;
    }

    setLifecycleState('IDLE');
  }, []);

  return {
    lifecycleState,
    luckysheetRef,
    previousCellValueRef,
    domEventListenersRef,
    initLuckysheet,
    cleanup
  };
}
