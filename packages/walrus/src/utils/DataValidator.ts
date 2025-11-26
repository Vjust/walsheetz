// Data validation utilities for Walrus storage
// Validates spreadsheet data before encoding and storage

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_CELLS = 100000;
const MAX_NESTING = 20;

/**
 * Validate data for Walrus storage
 */
export function validateDataForWalrus(data: unknown) {
  const errors: string[] = [];

  // Check defined
  if (data === null || data === undefined) {
    return { valid: false, error: 'Data cannot be null or undefined', errors: ['Data cannot be null or undefined'] };
  }

  // Check type
  if (typeof data !== 'object') {
    return { valid: false, error: 'Data must be an object', errors: ['Data must be an object'] };
  }

  // Check JSON serialization
  let jsonString: string;
  try {
    jsonString = JSON.stringify(data);
  } catch (jsonError) {
    return {
      valid: false,
      error: 'Data cannot be serialized to JSON',
      errors: [`JSON serialization failed: ${(jsonError as Error).message}`]
    };
  }

  // Check size
  const dataSize = jsonString.length;
  if (dataSize > MAX_SIZE) {
    errors.push(`Data too large: ${dataSize} bytes (max: ${MAX_SIZE} bytes)`);
  }
  if (dataSize < 1) {
    errors.push('Data is empty after JSON serialization');
  }

  // Validate spreadsheet structure if present
  const dataObj = data as Record<string, unknown>;
  if (dataObj.cells !== undefined || dataObj.metadata !== undefined || dataObj.spreadsheetId !== undefined) {
    errors.push(...validateSpreadsheetStructure(dataObj));
  }

  // Validate content
  errors.push(...validateDataContent(jsonString, dataObj));

  return {
    valid: errors.length === 0,
    error: errors.length > 0 ? errors[0] : null,
    errors
  };
}

/**
 * Validate spreadsheet structure
 */
function validateSpreadsheetStructure(data: Record<string, unknown>): string[] {
  const errors: string[] = [];

  // Validate spreadsheetId
  if (data.spreadsheetId && typeof data.spreadsheetId !== 'string') {
    errors.push('spreadsheetId must be a string');
  }

  // Validate cells
  if (data.cells !== undefined) {
    if (typeof data.cells !== 'object' || data.cells === null || Array.isArray(data.cells)) {
      errors.push('cells must be an object (not array)');
    } else {
      const cells = data.cells as Record<string, unknown>;
      const totalCells = Object.keys(cells).length;
      if (totalCells > MAX_CELLS) {
        errors.push(`Too many cells: ${totalCells} (max: ${MAX_CELLS})`);
      }

      // Validate cell keys (A1, B2, etc.)
      for (const cellKey of Object.keys(cells)) {
        if (!/^[A-Z]+[0-9]+$/.test(cellKey)) {
          errors.push(`Invalid cell key format: ${cellKey}`);
          break;
        }
      }
    }
  }

  // Validate metadata
  if (data.metadata !== undefined && typeof data.metadata !== 'object') {
    errors.push('metadata must be an object');
  }

  return errors;
}

/**
 * Validate data content for suspicious patterns
 */
function validateDataContent(jsonString: string, data: object): string[] {
  const errors: string[] = [];

  // Check for excessive nesting
  const maxNesting = calculateMaxNestingLevel(data);
  if (maxNesting > MAX_NESTING) {
    errors.push(`JSON nesting too deep: ${maxNesting} levels (max: ${MAX_NESTING})`);
  }

  return errors;
}

/**
 * Calculate maximum nesting level in object
 */
function calculateMaxNestingLevel(obj: unknown, currentLevel = 0): number {
  if (currentLevel > 25) return currentLevel;

  let maxLevel = currentLevel;

  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const nestedLevel = calculateMaxNestingLevel(value, currentLevel + 1);
        maxLevel = Math.max(maxLevel, nestedLevel);
      }
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        const nestedLevel = calculateMaxNestingLevel(item, currentLevel + 1);
        maxLevel = Math.max(maxLevel, nestedLevel);
      }
    }
  }

  return maxLevel;
}
