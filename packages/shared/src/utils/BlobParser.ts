/**
 * Blob Parser Utility
 * Converts blob data between various formats and grid representations
 */

import { logger, LogComponent } from "./Logger.js";

type BlobFormat = 'auto' | 'json' | 'csv' | 'text';

interface ParseOptions {
  format?: BlobFormat;
  startRow?: number;
  startCol?: number;
  maxRows?: number;
  maxCols?: number;
  delimiter?: string | null;
  hasHeaders?: boolean;
}

interface ParseResult {
  success: boolean;
  data: string[][];
  rows: number;
  cols: number;
  format: string;
  hasHeaders?: boolean;
  truncated?: boolean;
  delimiter?: string;
  error?: string;
}

interface SerializeOptions {
  format?: 'json' | 'csv';
  includeHeaders?: boolean;
  compression?: boolean;
  delimiter?: string;
  quote?: string;
}

interface SerializeResult {
  success: boolean;
  data?: string;
  format?: string;
  error?: string;
  metadata?: {
    rows: number;
    cols: number;
    size: number;
  };
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  rows?: number;
  cols?: number;
}

export async function parseBlob(blob: unknown, options: ParseOptions = {}): Promise<ParseResult> {
  const {
    format = 'auto',
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
    let data: unknown;
    let detectedFormat: string = format;

    if (blob instanceof ArrayBuffer || blob instanceof Uint8Array) {
      const decoder = new TextDecoder('utf-8');
      data = decoder.decode(blob);
    } else if (typeof blob === 'string') {
      data = blob;
    } else if (typeof blob === 'object') {
      data = blob;
      detectedFormat = 'json';
    } else {
      throw new Error('Unsupported blob type');
    }

    if (format === 'auto' && typeof data === 'string') {
      detectedFormat = detectFormat(data);
    }

    let result: ParseResult;
    switch (detectedFormat) {
      case 'json':
        result = parseJSON(typeof data === 'string' ? JSON.parse(data) : data, options);
        break;
      case 'csv':
        result = parseCSV(data as string, options);
        break;
      case 'text':
      default:
        result = parseText(data as string, options);
        break;
    }

    if (result.data.length > maxRows) {
      result.data = result.data.slice(0, maxRows);
      result.rows = maxRows;
      result.truncated = true;
    }

    if (result.data[0]?.length > maxCols) {
      result.data = result.data.map((row) => row.slice(0, maxCols));
      result.cols = maxCols;
      result.truncated = true;
    }

    logger.info(LogComponent.STORAGE_SERVICE, 'parse_blob_success', 'Blob parsed successfully', {
      format: result.format,
      rows: result.rows,
      cols: result.cols,
      truncated: result.truncated || false
    });

    return result;

  } catch (error) {
    const err = error as Error;
    logger.error(LogComponent.STORAGE_SERVICE, 'parse_blob_error', 'Failed to parse blob', {
      error: err.message
    });

    return {
      success: false,
      error: err.message,
      data: [[String(blob)]],
      rows: 1,
      cols: 1,
      format: 'text'
    };
  }
}

export function detectFormat(data: string): string {
  if (!data || typeof data !== 'string') {
    return 'text';
  }

  const trimmed = data.trim();

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  const lines = trimmed.split(/\r?\n/);
  if (lines.length > 1) {
    const commaCount = lines[0].split(',').length - 1;
    const tabCount = lines[0].split('\t').length - 1;

    if (commaCount >= 1 || tabCount >= 1) {
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

export function parseJSON(json: unknown, options: ParseOptions = {}): ParseResult {
  const { startRow = 0, startCol = 0 } = options;

  if (Array.isArray(json)) {
    if (json.length > 0 && typeof json[0] === 'object' && !Array.isArray(json[0])) {
      const keys = Object.keys(json[0] as Record<string, unknown>);
      const headerRow = keys;
      const dataRows = json.map((obj) => keys.map((k) => {
        const val = (obj as Record<string, unknown>)[k];
        return val === null || val === undefined ? '' : String(val);
      }));

      return {
        success: true,
        data: [headerRow, ...dataRows],
        rows: dataRows.length + 1,
        cols: keys.length,
        format: 'json',
        hasHeaders: true
      };
    }

    if (json.length > 0 && Array.isArray(json[0])) {
      return {
        success: true,
        data: json.map((row) => (row as unknown[]).map((val) => String(val))),
        rows: json.length,
        cols: (json[0] as unknown[])?.length || 0,
        format: 'json',
        hasHeaders: false
      };
    }

    return {
      success: true,
      data: json.map((val) => [String(val)]),
      rows: json.length,
      cols: 1,
      format: 'json',
      hasHeaders: false
    };
  }

  if (typeof json === 'object' && json !== null) {
    const entries = Object.entries(json as Record<string, unknown>).map(([key, val]) => [
      key,
      val === null || val === undefined ? '' : String(val)
    ]);

    return {
      success: true,
      data: [['Key', 'Value'], ...entries],
      rows: entries.length + 1,
      cols: 2,
      format: 'json',
      hasHeaders: true
    };
  }

  return {
    success: true,
    data: [[String(json)]],
    rows: 1,
    cols: 1,
    format: 'json',
    hasHeaders: false
  };
}

export function parseCSV(csv: string, options: ParseOptions = {}): ParseResult {
  const {
    delimiter = null,
    hasHeaders = true,
    startRow = 0,
    startCol = 0
  } = options;

  if (!csv || typeof csv !== 'string') {
    return {
      success: true,
      data: [],
      rows: 0,
      cols: 0,
      format: 'csv',
      hasHeaders: false
    };
  }

  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    return {
      success: true,
      data: [],
      rows: 0,
      cols: 0,
      format: 'csv',
      hasHeaders: false
    };
  }

  let actualDelimiter = delimiter;
  if (!actualDelimiter) {
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;

    actualDelimiter = tabCount > commaCount ?
      '\t' :
      semicolonCount > commaCount ? ';' : ',';
  }

  const rows = lines.map((line) => parseCSVLine(line, actualDelimiter));

  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const normalizedRows = rows.map((row) => {
    while (row.length < maxCols) {
      row.push('');
    }
    return row;
  });

  return {
    success: true,
    data: normalizedRows,
    rows: normalizedRows.length,
    cols: maxCols,
    format: 'csv',
    hasHeaders,
    delimiter: actualDelimiter
  };
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 2;
        continue;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }

    i++;
  }

  fields.push(current);

  return fields.map((field) => field.trim());
}

export function parseText(text: string, options: ParseOptions = {}): ParseResult {
  const { startRow = 0, startCol = 0 } = options;

  if (!text || typeof text !== 'string') {
    return {
      success: true,
      data: [],
      rows: 0,
      cols: 0,
      format: 'text',
      hasHeaders: false
    };
  }

  const lines = text.split(/\r?\n/);
  const data = lines.map((line) => [line]);

  return {
    success: true,
    data,
    rows: lines.length,
    cols: 1,
    format: 'text',
    hasHeaders: false
  };
}

export async function serializeRange(range: unknown[][], options: SerializeOptions = {}): Promise<SerializeResult> {
  const {
    format = 'json',
    includeHeaders = true,
    compression = false
  } = options;

  logger.debug(LogComponent.STORAGE_SERVICE, 'serialize_range_start', 'Starting range serialization', {
    format,
    rows: range.length,
    cols: range[0]?.length || 0
  });

  try {
    let serialized: string;

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
    const err = error as Error;
    logger.error(LogComponent.STORAGE_SERVICE, 'serialize_range_error', 'Failed to serialize range', {
      error: err.message
    });

    return {
      success: false,
      error: err.message
    };
  }
}

export function serializeToJSON(range: unknown[][], options: SerializeOptions = {}): string {
  const { includeHeaders = true } = options;

  if (!Array.isArray(range) || range.length === 0) {
    return JSON.stringify([]);
  }

  if (includeHeaders && range.length > 1) {
    const headers = range[0] as string[];
    const dataRows = range.slice(1);
    const objects = dataRows.map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });
    return JSON.stringify(objects, null, 2);
  }

  return JSON.stringify(range, null, 2);
}

export function serializeToCSV(range: unknown[][], options: SerializeOptions = {}): string {
  const { delimiter = ',', quote = '"' } = options;

  if (!Array.isArray(range) || range.length === 0) {
    return '';
  }

  return range.map((row) => {
    return row.map((cell) => {
      const cellStr = cell === null || cell === undefined ? '' : String(cell);

      if (cellStr.includes(delimiter) || cellStr.includes(quote) || cellStr.includes('\n')) {
        return `${quote}${cellStr.replace(new RegExp(quote, 'g'), quote + quote)}${quote}`;
      }

      return cellStr;
    }).join(delimiter);
  }).join('\n');
}

export function validateGrid(grid: unknown): ValidationResult {
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

  const invalidRows = grid.filter((row) => !Array.isArray(row));
  if (invalidRows.length > 0) {
    return {
      valid: false,
      error: 'All rows must be arrays'
    };
  }

  const colCounts = grid.map((row) => (row as unknown[]).length);
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
