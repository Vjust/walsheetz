/**
 * Blob Parser Utility
 * Converts blob data between various formats and grid representations
 */

import { logger, LogComponent } from '@dreamlit/walrus';

/**
 * Parse blob data to grid format
 * @param {*} blob - Blob data (string, ArrayBuffer, or Object)
 * @param {Object} options - Parse options
 * @returns {Promise<Object>} Parsed grid data
 */
export async function parseBlob(blob, options = {}) {
  const {
    format = 'auto', // 'auto', 'json', 'csv', 'text'
    startRow = 0,
    startCol = 0,
    maxRows = 10000,
    maxCols = 100
  } = options;

  logger.debug(LogComponent.STORAGE_SERVICE, 'parse_blob_start', 'Starting blob parsing', {
    format,
    startRow,
    startCol
  });

  try {
    let data;
    let detectedFormat = format;

    // Convert blob to string if needed
    if (blob instanceof ArrayBuffer || blob instanceof Uint8Array) {
      const decoder = new TextDecoder('utf-8');
      data = decoder.decode(blob);
    } else if (typeof blob === 'string') {
      data = blob;
    } else if (typeof blob === 'object') {
      // Already parsed object
      data = blob;
      detectedFormat = 'json';
    } else {
      throw new Error('Unsupported blob type');
    }

    // Auto-detect format if needed
    if (format === 'auto' && typeof data === 'string') {
      detectedFormat = detectFormat(data);
    }

    // Parse based on format
    let result;
    switch (detectedFormat) {
      case 'json':
        result = parseJSON(typeof data === 'string' ? JSON.parse(data) : data, options);
        break;
      case 'csv':
        result = parseCSV(data, options);
        break;
      case 'text':
      default:
        result = parseText(data, options);
        break;
    }

    // Apply row/column limits
    if (result.data.length > maxRows) {
      result.data = result.data.slice(0, maxRows);
      result.rows = maxRows;
      result.truncated = true;
    }

    if (result.data[0]?.length > maxCols) {
      result.data = result.data.map(row => row.slice(0, maxCols));
      result.cols = maxCols;
      result.truncated = true;
    }

    logger.info(LogComponent.STORAGE_SERVICE, 'parse_blob_success', 'Blob parsed successfully', {
      format: result.format,
      rows: result.rows,
      cols: result.cols,
      truncated: result.truncated || false
    });

    return {
      success: true,
      ...result
    };

  } catch (error) {
    logger.error(LogComponent.STORAGE_SERVICE, 'parse_blob_error', 'Failed to parse blob', {
      error: error.message
    });

    return {
      success: false,
      error: error.message,
      data: [[String(blob)]],
      rows: 1,
      cols: 1,
      format: 'text'
    };
  }
}

/**
 * Detect format of text data
 * @param {string} data - Text data
 * @returns {string} Detected format
 */
export function detectFormat(data) {
  if (!data || typeof data !== 'string') {
    return 'text';
  }

  const trimmed = data.trim();

  // Check for JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  // Check for CSV (heuristic: contains commas and line breaks)
  const lines = trimmed.split(/\r?\n/);
  if (lines.length > 1) {
    const commaCount = lines[0].split(',').length - 1;
    const tabCount = lines[0].split('\t').length - 1;

    if (commaCount >= 1 || tabCount >= 1) {
      // Check if multiple lines have similar structure
      const secondLineCommas = lines[1]?.split(',').length - 1 || 0;
      const secondLineTabs = lines[1]?.split('\t').length - 1 || 0;

      if (Math.abs(commaCount - secondLineCommas) <= 1 ||
          Math.abs(tabCount - secondLineTabs) <= 1) {
        return 'csv';
      }
    }
  }

  return 'text';
}

/**
 * Parse JSON data to grid format
 * @param {*} json - JSON data
 * @param {Object} options - Parse options
 * @returns {Object} Parsed grid data
 */
export function parseJSON(json, options = {}) {
  const { startRow = 0, startCol = 0 } = options;

  if (Array.isArray(json)) {
    // Array of objects -> table with headers
    if (json.length > 0 && typeof json[0] === 'object' && !Array.isArray(json[0])) {
      const keys = Object.keys(json[0]);
      const headerRow = keys;
      const dataRows = json.map(obj => keys.map(k => {
        const val = obj[k];
        return val === null || val === undefined ? '' : String(val);
      }));

      return {
        data: [headerRow, ...dataRows],
        rows: dataRows.length + 1,
        cols: keys.length,
        format: 'json',
        hasHeaders: true
      };
    }

    // Array of arrays -> direct grid
    if (json.length > 0 && Array.isArray(json[0])) {
      return {
        data: json.map(row => row.map(val => String(val))),
        rows: json.length,
        cols: json[0]?.length || 0,
        format: 'json',
        hasHeaders: false
      };
    }

    // Array of primitives -> single column
    return {
      data: json.map(val => [String(val)]),
      rows: json.length,
      cols: 1,
      format: 'json',
      hasHeaders: false
    };
  }

  // Single object -> key-value pairs
  if (typeof json === 'object' && json !== null) {
    const entries = Object.entries(json).map(([key, val]) => [
      key,
      val === null || val === undefined ? '' : String(val)
    ]);

    return {
      data: [['Key', 'Value'], ...entries],
      rows: entries.length + 1,
      cols: 2,
      format: 'json',
      hasHeaders: true
    };
  }

  // Primitive -> single cell
  return {
    data: [[String(json)]],
    rows: 1,
    cols: 1,
    format: 'json',
    hasHeaders: false
  };
}

/**
 * Parse CSV/TSV data to grid format
 * @param {string} csv - CSV/TSV text
 * @param {Object} options - Parse options
 * @returns {Object} Parsed grid data
 */
export function parseCSV(csv, options = {}) {
  const {
    delimiter = null, // Auto-detect if null
    hasHeaders = true,
    startRow = 0,
    startCol = 0
  } = options;

  if (!csv || typeof csv !== 'string') {
    return {
      data: [],
      rows: 0,
      cols: 0,
      format: 'csv',
      hasHeaders: false
    };
  }

  const lines = csv.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) {
    return {
      data: [],
      rows: 0,
      cols: 0,
      format: 'csv',
      hasHeaders: false
    };
  }

  // Auto-detect delimiter
  let actualDelimiter = delimiter;
  if (!actualDelimiter) {
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;

    actualDelimiter = tabCount > commaCount
      ? '\t'
      : (semicolonCount > commaCount ? ';' : ',');
  }

  // Parse each line
  const rows = lines.map(line => parseCSVLine(line, actualDelimiter));

  // Ensure all rows have same column count (pad with empty strings)
  // Use reduce instead of spread operator to avoid stack overflow with large arrays
  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const normalizedRows = rows.map(row => {
    while (row.length < maxCols) {
      row.push('');
    }
    return row;
  });

  return {
    data: normalizedRows,
    rows: normalizedRows.length,
    cols: maxCols,
    format: 'csv',
    hasHeaders,
    delimiter: actualDelimiter
  };
}

/**
 * Parse a single CSV line with proper quote handling
 * @param {string} line - CSV line
 * @param {string} delimiter - Field delimiter
 * @returns {Array<string>} Parsed fields
 */
function parseCSVLine(line, delimiter) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i += 2;
        continue;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      // Field separator
      fields.push(current);
      current = '';
    } else {
      current += char;
    }

    i++;
  }

  // Add last field
  fields.push(current);

  return fields.map(field => field.trim());
}

/**
 * Parse plain text to grid format
 * @param {string} text - Plain text
 * @param {Object} options - Parse options
 * @returns {Object} Parsed grid data
 */
export function parseText(text, options = {}) {
  const { startRow = 0, startCol = 0 } = options;

  if (!text || typeof text !== 'string') {
    return {
      data: [],
      rows: 0,
      cols: 0,
      format: 'text',
      hasHeaders: false
    };
  }

  const lines = text.split(/\r?\n/);
  const data = lines.map(line => [line]);

  return {
    data,
    rows: lines.length,
    cols: 1,
    format: 'text',
    hasHeaders: false
  };
}

/**
 * Serialize grid range to blob format
 * @param {Array<Array>} range - Grid data (2D array)
 * @param {Object} options - Serialization options
 * @returns {Promise<Object>} Serialized data
 */
export async function serializeRange(range, options = {}) {
  const {
    format = 'json', // 'json', 'csv'
    includeHeaders = true,
    compression = false
  } = options;

  logger.debug(LogComponent.STORAGE_SERVICE, 'serialize_range_start', 'Starting range serialization', {
    format,
    rows: range.length,
    cols: range[0]?.length || 0
  });

  try {
    let serialized;

    switch (format) {
      case 'csv':
        serialized = serializeToCSV(range, options);
        break;
      case 'json':
      default:
        serialized = serializeToJSON(range, options);
        break;
    }

    logger.info(LogComponent.STORAGE_SERVICE, 'serialize_range_success', 'Range serialized successfully', {
      format,
      size: serialized.length
    });

    return {
      success: true,
      data: serialized,
      format,
      metadata: {
        rows: range.length,
        cols: range[0]?.length || 0,
        size: serialized.length
      }
    };

  } catch (error) {
    logger.error(LogComponent.STORAGE_SERVICE, 'serialize_range_error', 'Failed to serialize range', {
      error: error.message
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Serialize range to JSON
 * @param {Array<Array>} range - Grid data
 * @param {Object} options - Serialization options
 * @returns {string} JSON string
 */
export function serializeToJSON(range, options = {}) {
  const { includeHeaders = true } = options;

  if (!Array.isArray(range) || range.length === 0) {
    return JSON.stringify([]);
  }

  if (includeHeaders && range.length > 1) {
    // First row as headers
    const headers = range[0];
    const dataRows = range.slice(1);
    const objects = dataRows.map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });
    return JSON.stringify(objects, null, 2);
  }

  // No headers - serialize as 2D array
  return JSON.stringify(range, null, 2);
}

/**
 * Serialize range to CSV
 * @param {Array<Array>} range - Grid data
 * @param {Object} options - Serialization options
 * @returns {string} CSV string
 */
export function serializeToCSV(range, options = {}) {
  const { delimiter = ',', quote = '"' } = options;

  if (!Array.isArray(range) || range.length === 0) {
    return '';
  }

  return range.map(row => {
    return row.map(cell => {
      const cellStr = cell === null || cell === undefined ? '' : String(cell);

      // Quote field if it contains delimiter, quote, or newline
      if (cellStr.includes(delimiter) || cellStr.includes(quote) || cellStr.includes('\n')) {
        return `${quote}${cellStr.replace(new RegExp(quote, 'g'), quote + quote)}${quote}`;
      }

      return cellStr;
    }).join(delimiter);
  }).join('\n');
}

/**
 * Validate grid data
 * @param {Array<Array>} grid - Grid data
 * @returns {Object} Validation result
 */
export function validateGrid(grid) {
  if (!Array.isArray(grid)) {
    return {
      valid: false,
      error: 'Grid must be an array'
    };
  }

  if (grid.length === 0) {
    return {
      valid: true,
      warnings: ['Grid is empty']
    };
  }

  // Check if all rows are arrays
  const invalidRows = grid.filter((row, i) => !Array.isArray(row));
  if (invalidRows.length > 0) {
    return {
      valid: false,
      error: 'All rows must be arrays'
    };
  }

  // Check for consistent column count
  // Use reduce instead of spread operator to avoid stack overflow with large arrays
  const colCounts = grid.map(row => row.length);
  const minCols = colCounts.reduce((min, col) => Math.min(min, col), Infinity);
  const maxCols = colCounts.reduce((max, col) => Math.max(max, col), 0);

  if (maxCols - minCols > 0) {
    return {
      valid: true,
      warnings: [`Inconsistent column count: min=${minCols}, max=${maxCols}`]
    };
  }

  return {
    valid: true,
    rows: grid.length,
    cols: maxCols
  };
}

export default {
  parseBlob,
  detectFormat,
  parseJSON,
  parseCSV,
  parseText,
  serializeRange,
  serializeToJSON,
  serializeToCSV,
  validateGrid
};
