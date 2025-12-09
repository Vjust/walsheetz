/**
 * Cell Reference Utilities
 *
 * Shared utilities for converting between cell references (A1, B2) and coordinates (row, col)
 */

export function columnLettersToNumber(letters: string): number {
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return col - 1;
}

export function columnNumberToLetters(col: number): string {
  let result = '';
  col += 1;

  while (col > 0) {
    col -= 1;
    result = String.fromCharCode(65 + (col % 26)) + result;
    col = Math.floor(col / 26);
  }

  return result;
}

export function parseCellRef(cellRef: string): { row: number; col: number } | null {
  if (!cellRef || typeof cellRef !== 'string') {
    return null;
  }

  const match = cellRef.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    return null;
  }

  const letters = match[1];
  const number = parseInt(match[2]);

  if (number < 1) {
    return null;
  }

  const col = columnLettersToNumber(letters);
  const row = number - 1;

  return { row, col };
}

export function coordsToCellRef(row: number, col: number): string {
  if (row < 0 || col < 0) {
    return '';
  }

  const letters = columnNumberToLetters(col);
  const number = row + 1;

  return letters + number;
}

export function isValidCellRef(cellRef: string): boolean {
  return parseCellRef(cellRef) !== null;
}
