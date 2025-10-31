// Data validation utilities for Walrus storage
// Validates spreadsheet data before encoding and storage

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_CELLS = 100000;
const MAX_NESTING = 20;

/**
 * Validate data for Walrus storage
 * @param {Object} data - Data to validate
 * @returns {{valid: boolean, error: string|null, errors: string[]}}
 */
export function validateDataForWalrus(data) {
  const errors = [];

  // Check defined
  if (data === null || data === undefined) {
    return { valid: false, error: 'Data cannot be null or undefined', errors: ['Data cannot be null or undefined'] };
  }

  // Check type
  if (typeof data !== 'object') {
    return { valid: false, error: 'Data must be an object', errors: ['Data must be an object'] };
  }

  // Check JSON serialization
  let jsonString;
  try {
    jsonString = JSON.stringify(data);
  } catch (jsonError) {
    return {
      valid: false,
      error: 'Data cannot be serialized to JSON',
      errors: [`JSON serialization failed: ${jsonError.message}`]
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
  if (data.cells !== undefined || data.metadata !== undefined || data.spreadsheetId !== undefined) {
    errors.push(...validateSpreadsheetStructure(data));
  }

  // Validate content
  errors.push(...validateDataContent(jsonString, data));

  return {
    valid: errors.length === 0,
    error: errors.length > 0 ? errors[0] : null,
    errors
  };
}

/**
 * Validate spreadsheet structure
 * @param {Object} data - Spreadsheet data
 * @returns {string[]} Array of error messages
 */
function validateSpreadsheetStructure(data) {
  const errors = [];

  // Validate spreadsheetId
  if (data.spreadsheetId && typeof data.spreadsheetId !== 'string') {
    errors.push('spreadsheetId must be a string');
  }

  // Validate cells
  if (data.cells !== undefined) {
    if (typeof data.cells !== 'object' || Array.isArray(data.cells)) {
      errors.push('cells must be an object (not array)');
    } else {
      const totalCells = Object.keys(data.cells).length;
      if (totalCells > MAX_CELLS) {
        errors.push(`Too many cells: ${totalCells} (max: ${MAX_CELLS})`);
      }

      // Validate cell keys (A1, B2, etc.)
      for (const cellKey of Object.keys(data.cells)) {
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
 * @param {string} jsonString - JSON string
 * @param {Object} data - Parsed data object
 * @returns {string[]} Array of error messages
 */
function validateDataContent(jsonString, data) {
  const errors = [];

  // Check for excessive nesting
  const maxNesting = calculateMaxNestingLevel(data);
  if (maxNesting > MAX_NESTING) {
    errors.push(`JSON nesting too deep: ${maxNesting} levels (max: ${MAX_NESTING})`);
  }

  return errors;
}

/**
 * Calculate maximum nesting level in object
 * @param {*} obj - Object to analyze
 * @param {number} currentLevel - Current recursion level
 * @returns {number} Maximum nesting level
 */
function calculateMaxNestingLevel(obj, currentLevel = 0) {
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
