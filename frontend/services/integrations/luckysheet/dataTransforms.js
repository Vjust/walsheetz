/**
 * Luckysheet Data Transforms
 *
 * Shared utilities for converting between WalSheetz and Luckysheet data formats.
 * Consolidates duplicate logic from Spreadsheet.jsx and useSpreadsheetLifecycle.js.
 */

import { columnLettersToNumber } from '@utils/helpers/cellUtils.js';
import { WALSHEETZ_FUNCTION_METADATA, WALSHEETZ_FUNCTIONS } from '../formulas/WalSheetzFunctions.js';
import { ensureLuckysheetFunctionTree } from './ensureLuckysheetNesting.js';

/**
 * Convert WalSheetz spreadsheet data to Luckysheet celldata format
 *
 * Handles multiple input formats:
 * - {success, data: {data: {cells}}} - API response format
 * - {data: {cells}} - Nested data format
 * - {cells} - Direct cells format
 * - {celldata} - Pre-built celldata array
 *
 * @param {Object} spreadsheetData - Spreadsheet data in various formats
 * @returns {Array} Luckysheet celldata array [{r, c, v}, ...]
 */
export function convertToLuckysheetData(spreadsheetData) {
  try {
    // Accept prebuilt celldata if already in correct format
    const prebuilt = spreadsheetData?.data?.celldata || spreadsheetData?.celldata;
    if (Array.isArray(prebuilt)) {
      return prebuilt;
    }

    // Extract cells from various nested formats
    const cells =
      spreadsheetData?.data?.data?.cells ??
      spreadsheetData?.data?.cells ??
      spreadsheetData?.cells ??
      null;

    if (!cells || typeof cells !== 'object') {
      return [];
    }

    // Convert cell-reference-keyed object to Luckysheet celldata array
    const celldata = [];
    for (const cellRef of Object.keys(cells)) {
      const cell = cells[cellRef];
      const match = cellRef.match(/^([A-Z]+)(\d+)$/);
      if (!match) continue;

      const col = columnLettersToNumber(match[1]);
      const row = parseInt(match[2], 10) - 1; // Convert to 0-indexed

      celldata.push({
        r: row,
        c: col,
        v: {
          v: cell?.value,
          m: cell?.value != null ? String(cell.value) : '',
          ct: cell?.type ? { fa: cell.type, t: 'g' } : { fa: 'General', t: 'g' }
        }
      });
    }

    return celldata;
  } catch (error) {
    console.error('[dataTransforms] Error converting to Luckysheet data:', error);
    return [];
  }
}

/**
 * Convert WalSheetz function metadata to Luckysheet formula format
 *
 * @param {string} name - Function name (e.g., "WZ_BALANCE")
 * @param {Object} metadata - Function metadata from WalSheetzFunctions
 * @returns {Object} Luckysheet formula definition
 */
export function convertToLuckysheetFormula(name, metadata) {
  const params = metadata.parameters || [];
  let minArgs = 0;
  let maxArgs = 0;
  let hasVariadic = false;

  // Calculate min/max arguments
  for (const param of params) {
    if (param.name?.startsWith('...')) {
      hasVariadic = true;
      maxArgs = 255; // Luckysheet max
    } else if (param.optional !== true) {
      minArgs++;
      maxArgs++;
    } else {
      maxArgs++;
    }
  }

  if (!hasVariadic && params.length > 0) {
    maxArgs = Math.max(maxArgs, minArgs);
  }

  // Filter out variadic parameters for display
  const displayParams = params.filter(p => !p.name?.startsWith('...'));

  return {
    n: name,
    t: 0, // Function type
    d: metadata.description || `WalSheetz ${metadata.category} function`,
    a: displayParams.map(param => param.name).join(',') || '',
    m: [minArgs, hasVariadic ? 255 : maxArgs],
    p: displayParams.map(param => ({
      name: param.name,
      detail: param.description,
      example: param.example || '',
      require: param.optional === true ? 'o' : 'm',
      repeat: 'n',
      type: param.type === 'number' ? 'n' : 's'
    }))
  };
}

/**
 * Build complete luckysheet_function object with WZ functions
 * Uses nested structure for Luckysheet compatibility.
 *
 * @returns {Object} Nested luckysheet_function tree
 */
export function buildLuckysheetFunctionObject() {
  const luckysheet_function = {};

  Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
    try {
      const luckysheetFormula = convertToLuckysheetFormula(name, metadata);
      ensureLuckysheetFunctionTree(
        luckysheet_function,
        name,
        luckysheetFormula,
        WALSHEETZ_FUNCTIONS[name]
      );
    } catch (error) {
      console.error(`[dataTransforms] Failed to build function tree for ${name}:`, error);
    }
  });

  console.log(`[dataTransforms] Built luckysheet_function with ${Object.keys(WALSHEETZ_FUNCTION_METADATA).length} WZ functions`);
  return luckysheet_function;
}

/**
 * Calculate actual dimensions from celldata
 * Ensures export includes all data, not just visible cells.
 *
 * @param {Array} celldata - Luckysheet celldata array
 * @param {number} minRows - Minimum row count (default 100)
 * @param {number} minCols - Minimum column count (default 26)
 * @returns {Object} {rows, cols}
 */
export function calculateSheetDimensions(celldata, minRows = 100, minCols = 26) {
  let actualRows = minRows;
  let actualCols = minCols;

  if (celldata && celldata.length > 0) {
    const bounds = celldata.reduce((acc, cell) => {
      if (cell && typeof cell.r === 'number') {
        acc.maxRow = Math.max(acc.maxRow, cell.r);
      }
      if (cell && typeof cell.c === 'number') {
        acc.maxCol = Math.max(acc.maxCol, cell.c);
      }
      return acc;
    }, { maxRow: -1, maxCol: -1 });

    if (bounds.maxRow >= 0) {
      actualRows = Math.max(actualRows, bounds.maxRow + 1);
    }
    if (bounds.maxCol >= 0) {
      actualCols = Math.max(actualCols, bounds.maxCol + 1);
    }
  }

  return { rows: actualRows, cols: actualCols };
}
