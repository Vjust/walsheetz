/**
 * Cell Reference Utilities
 *
 * Shared utilities for converting between cell references (A1, B2) and coordinates (row, col)
 */

/**
 * Convert column letters to number (A=0, B=1, ..., Z=25, AA=26, etc.)
 * @param {string} letters - Column letters like 'A', 'B', 'AA'
 * @returns {number} - 0-indexed column number
 */
export function columnLettersToNumber(letters) {
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return col - 1; // Convert to 0-indexed
}

/**
 * Convert 0-indexed column number to letters (0=A, 1=B, ..., 25=Z, 26=AA, etc.)
 * @param {number} col - 0-indexed column number
 * @returns {string} - Column letters like 'A', 'B', 'AA'
 */
export function columnNumberToLetters(col) {
  let result = '';
  col += 1; // Convert to 1-indexed for calculation

  while (col > 0) {
    col -= 1; // Adjust for 0-based indexing in the alphabet
    result = String.fromCharCode(65 + (col % 26)) + result;
    col = Math.floor(col / 26);
  }

  return result;
}

/**
 * Parse cell reference like A1, B2 to {row, col}
 * @param {string} cellRef - Cell reference like 'A1', 'B2', 'AA1'
 * @returns {Object|null} - {row, col} (0-indexed) or null if invalid
 */
export function parseCellRef(cellRef) {
  if (!cellRef || typeof cellRef !== 'string') {
    return null;
  }

  const match = cellRef.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    return null; // Return null for invalid references
  }

  const letters = match[1];
  const number = parseInt(match[2]);

  // Row numbers must be >= 1 (A0, B0, etc. are invalid)
  if (number < 1) {
    return null;
  }

  const col = columnLettersToNumber(letters);
  const row = number - 1; // Convert to 0-indexed

  return { row, col };
}

/**
 * Convert {row, col} coordinates to cell reference like A1, B2
 * @param {number} row - 0-indexed row number
 * @param {number} col - 0-indexed column number
 * @returns {string} - Cell reference like 'A1', 'B2', 'AA1'
 */
export function coordsToCellRef(row, col) {
  if (row < 0 || col < 0) {
    return '';
  }

  const letters = columnNumberToLetters(col);
  const number = row + 1; // Convert to 1-indexed

  return letters + number;
}

/**
 * Check if a cell reference is valid
 * @param {string} cellRef - Cell reference to validate
 * @returns {boolean} - True if valid
 */
export function isValidCellRef(cellRef) {
  return parseCellRef(cellRef) !== null;
}