/**
 * useLuckysheetShortcuts Hook
 *
 * Manages keyboard shortcuts for Luckysheet spreadsheet.
 * Consolidates formatting logic to avoid duplication.
 *
 * Supported shortcuts:
 * - Ctrl/Cmd + S: Save to blockchain
 * - Ctrl/Cmd + Z: Undo
 * - Ctrl/Cmd + Y: Redo
 * - Ctrl/Cmd + B: Toggle bold
 * - Ctrl/Cmd + I: Toggle italic
 * - Ctrl/Cmd + U: Toggle underline
 */

import { useEffect } from 'react';

/**
 * Get current cell format from Luckysheet
 * @param {number} row - 0-indexed row
 * @param {number} col - 0-indexed column
 * @returns {Object} Cell format object
 */
function getCurrentCellFormat(row, col) {
  try {
    if (window.luckysheet && window.luckysheet.getCellValue) {
      const cellInfo = window.luckysheet.getCellValue(row, col, { type: 'object' });
      return cellInfo && cellInfo.s ? cellInfo.s : {};
    }
  } catch (error) {
    console.debug('[useLuckysheetShortcuts] Error getting cell format:', error);
  }
  return {};
}

/**
 * Apply cell format while preserving other formats
 * @param {number} row - 0-indexed row
 * @param {number} col - 0-indexed column
 * @param {string} attr - Format attribute ('bl', 'it', 'un', etc.)
 * @param {*} value - Format value
 */
function applyCellFormat(row, col, attr, value) {
  try {
    const existingFormat = getCurrentCellFormat(row, col);
    const newFormat = { ...existingFormat, [attr]: value };

    // Apply all format attributes to preserve existing formatting
    if (newFormat.bl !== undefined) window.luckysheet.setCellFormat(row, col, 'bl', newFormat.bl);
    if (newFormat.it !== undefined) window.luckysheet.setCellFormat(row, col, 'it', newFormat.it);
    if (newFormat.un !== undefined) window.luckysheet.setCellFormat(row, col, 'un', newFormat.un);
    if (newFormat.ff !== undefined) window.luckysheet.setCellFormat(row, col, 'ff', newFormat.ff);
    if (newFormat.fs !== undefined) window.luckysheet.setCellFormat(row, col, 'fs', newFormat.fs);
    if (newFormat.fc !== undefined) window.luckysheet.setCellFormat(row, col, 'fc', newFormat.fc);
    if (newFormat.bg !== undefined) window.luckysheet.setCellFormat(row, col, 'bg', newFormat.bg);
  } catch (error) {
    console.error('[useLuckysheetShortcuts] Error applying cell format:', error);
  }
}

/**
 * Get current selection from Luckysheet
 * @returns {Object|null} Selection object or null
 */
function getCurrentSelection() {
  if (window.luckysheet && window.luckysheet.getRange) {
    try {
      const ranges = window.luckysheet.getRange();
      return ranges && ranges.length > 0 ? ranges[0] : null;
    } catch (e) {
      return null;
    }
  }
  return window.luckysheet_select_save && window.luckysheet_select_save[0] || null;
}

/**
 * Toggle formatting attribute for selected cells
 * @param {string} attr - Format attribute ('bl' for bold, 'it' for italic, 'un' for underline)
 */
function toggleFormatting(attr) {
  if (!window.luckysheet || !window.luckysheet.setCellFormat) {
    return;
  }

  const selection = getCurrentSelection();
  if (selection) {
    const startRow = selection.row ? selection.row[0] : selection.r || 0;
    const endRow = selection.row ? selection.row[1] : selection.r || 0;
    const startCol = selection.column ? selection.column[0] : selection.c || 0;
    const endCol = selection.column ? selection.column[1] : selection.c || 0;

    // Check current state of first cell to determine toggle direction
    const firstCellFormat = getCurrentCellFormat(startRow, startCol);
    const currentValue = firstCellFormat[attr] === 1;
    const newValue = currentValue ? 0 : 1;

    // Apply to all cells in selection
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        applyCellFormat(r, c, attr, newValue);
      }
    }
  } else {
    // Apply to current cell (0,0 as fallback)
    const currentFormat = getCurrentCellFormat(0, 0);
    const currentValue = currentFormat[attr] === 1;
    applyCellFormat(0, 0, attr, currentValue ? 0 : 1);
  }
}

/**
 * Hook to manage Luckysheet keyboard shortcuts
 *
 * @param {Object} options - Configuration options
 * @param {React.RefObject} options.luckysheetRef - Ref to track if Luckysheet is ready
 * @param {Function} options.saveToBlockchain - Save handler function
 */
export function useLuckysheetShortcuts({ luckysheetRef, saveToBlockchain }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Only handle if Luckysheet is ready
      if (!window.luckysheet || !luckysheetRef || !luckysheetRef.current) {
        return;
      }

      try {
        // Only handle keyboard shortcuts with Ctrl/Cmd modifier
        if (event.ctrlKey || event.metaKey) {
          switch (event.key.toLowerCase()) {
            case 'z':
              if (!event.shiftKey) {
                event.preventDefault();
                window.luckysheet.undo && window.luckysheet.undo();
                return;
              }
              break;

            case 'y':
              event.preventDefault();
              window.luckysheet.redo && window.luckysheet.redo();
              return;

            case 'b':
              event.preventDefault();
              toggleFormatting('bl'); // Bold
              return;

            case 'i':
              event.preventDefault();
              toggleFormatting('it'); // Italic
              return;

            case 'u':
              event.preventDefault();
              toggleFormatting('un'); // Underline
              return;

            case 's':
              event.preventDefault();
              if (saveToBlockchain) {
                saveToBlockchain();
              }
              return;

            default:
              // Let other shortcuts pass through
              break;
          }
        }
        // Let Luckysheet handle all normal keyboard input naturally
      } catch (error) {
        console.warn('[useLuckysheetShortcuts] Error in keyboard handler:', error);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [luckysheetRef, saveToBlockchain]);
}
