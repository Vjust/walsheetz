// Data encoding utilities: compression, encoding, hashing
// Provides encode/decode/compress/decompress/hash functions for Walrus storage

import {
  SpreadsheetDataSchema,
  type SpreadsheetData,
  type Cell,
} from '@dreamlit/shared';

export interface EncodingOptions {
  compressionThreshold?: number;
  compressionEnabled?: boolean;
}

// Re-export types from schema for backward compatibility
export type { SpreadsheetData, Cell as CellData };

/**
 * Encode spreadsheet data to binary format with optional compression
 */
export async function encodeSpreadsheetData(data: unknown, options: EncodingOptions = {}) {
  // Validate input at boundary
  const parsed = SpreadsheetDataSchema.parse(data);

  const compressionThreshold = options.compressionThreshold || 16384; // 16KB
  const compressionEnabled = options.compressionEnabled !== false;

  // Optimize cell data structure
  const optimizedData = {
    version: parsed.version,
    timestamp: parsed.timestamp,
    spreadsheetId: parsed.spreadsheetId,
    metadata: {
      title: parsed.metadata?.title || 'Untitled Spreadsheet',
      createdAt: parsed.metadata?.createdAt || Date.now(),
      lastModified: Date.now(),
      format: 'walsheetz-v1',
    },
    cells: optimizeCellData(parsed.cells || {}),
    sheets: parsed.sheets || [],
  };

  // Convert to binary
  const jsonString = JSON.stringify(optimizedData);
  const encoder = new TextEncoder();
  const rawData = encoder.encode(jsonString);

  // Compress if needed
  const shouldCompress =
    compressionEnabled &&
    rawData.length > compressionThreshold &&
    typeof CompressionStream !== 'undefined';

  if (shouldCompress) {
    const compressedData = await compressData(rawData);
    return {
      data: compressedData,
      isCompressed: true,
      originalSize: rawData.length,
      compressedSize: compressedData.length,
    };
  }

  return {
    data: rawData,
    isCompressed: false,
    originalSize: rawData.length,
  };
}

/**
 * Decode binary data to spreadsheet object
 */
export async function decodeSpreadsheetData(data: Uint8Array): Promise<SpreadsheetData> {
  // Decompress if gzipped
  let rawData = data;
  if (isGzipCompressed(data)) {
    rawData = await decompressData(data);
  }

  // Decode to string and parse JSON
  const decoder = new TextDecoder();
  const jsonString = decoder.decode(rawData);
  const parsed = JSON.parse(jsonString);

  // Validate after parse - use safeParse for graceful handling
  const result = SpreadsheetDataSchema.safeParse(parsed);
  if (!result.success) {
    console.warn('Spreadsheet data validation warnings:', result.error.issues);
    // Fall back to raw parsed data for backward compatibility
    if (parsed.cells) {
      parsed.cells = normalizeCellData(parsed.cells);
    }
    return parsed;
  }

  // Use validated data with schema defaults applied
  const validated = result.data;
  if (validated.cells) {
    validated.cells = normalizeCellData(validated.cells);
  }

  return validated;
}

/**
 * Compress data using gzip
 * @param {Uint8Array} data - Data to compress
 * @returns {Promise<Uint8Array>} Compressed data
 */
export async function compressData(data: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });

  try {
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const chunks: Uint8Array[] = [];
    const reader = compressedStream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  } catch (_streamError) {
    // Fallback: prefix with gzip magic bytes
    const result = new Uint8Array(data.length + 2);
    result[0] = 0x1f;
    result[1] = 0x8b;
    result.set(data, 2);
    return result;
  }
}

/**
 * Decompress gzipped data
 * @param {Uint8Array} data - Compressed data
 * @returns {Promise<Uint8Array>} Decompressed data
 */
export async function decompressData(data: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });

  try {
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const chunks: Uint8Array[] = [];
    const reader = decompressedStream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  } catch (_streamError) {
    // Fallback for mock gzip: strip magic bytes
    if (isGzipCompressed(data)) {
      return data.slice(2);
    }
    return data;
  }
}

/**
 * Check if data is gzip compressed
 */
export function isGzipCompressed(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

/**
 * Calculate SHA-256 hash of data
 */
export async function calculateContentHash(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Helper: Optimize cells for storage (UI format -> storage format)
function optimizeCellData(cells: Record<string, Cell>): Record<string, Cell> {
  const optimized: Record<string, Cell> = {};
  if (!cells || typeof cells !== 'object') return optimized;

  for (const [cellKey, cellData] of Object.entries(cells)) {
    if (!cellData || typeof cellData !== 'object') continue;

    const value = cellData.v !== undefined ? cellData.v : cellData.value;
    const formula = cellData.f !== undefined ? cellData.f : cellData.formula;
    const type = cellData.t !== undefined ? cellData.t : cellData.type;
    const style = cellData.s;

    if (value !== undefined || formula !== undefined) {
      optimized[cellKey] = { v: value, f: formula, t: type, s: style };
    }
  }

  return optimized;
}

// Helper: Normalize cells from storage to UI format
function normalizeCellData(cells: Record<string, Cell>): Record<string, Cell> {
  const normalized: Record<string, Cell> = {};
  if (!cells || typeof cells !== 'object') return normalized;

  for (const [cellKey, cellData] of Object.entries(cells)) {
    if (!cellData || typeof cellData !== 'object') continue;

    normalized[cellKey] = {
      value: cellData.v !== undefined ? cellData.v : cellData.value,
      formula: cellData.f !== undefined ? cellData.f : cellData.formula,
      type: cellData.t !== undefined ? cellData.t : cellData.type,
      s: cellData.s,
    };
  }

  return normalized;
}
