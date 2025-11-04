// Data encoding utilities: compression, encoding, hashing
// Provides encode/decode/compress/decompress/hash functions for Walrus storage

/**
 * Encode spreadsheet data to binary format with optional compression
 * @param {Object} data - Spreadsheet data
 * @param {Object} options - Encoding options (compressionThreshold, compressionEnabled)
 * @returns {Promise<{data: Uint8Array, isCompressed: boolean, originalSize: number, compressedSize?: number}>}
 */
export async function encodeSpreadsheetData(data, options = {}) {
  const compressionThreshold = options.compressionThreshold || 16384; // 16KB
  const compressionEnabled = options.compressionEnabled !== false;

  // Optimize cell data structure
  const optimizedData = {
    version: data.version || 1,
    timestamp: data.timestamp || Date.now(),
    spreadsheetId: data.spreadsheetId,
    metadata: {
      title: data.metadata?.title || data.title || 'Untitled Spreadsheet',
      createdAt: data.metadata?.createdAt || data.createdAt || Date.now(),
      lastModified: Date.now(),
      format: 'walsheetz-v1'
    },
    cells: optimizeCellData(data.cells || {}),
    sheets: data.sheets || []
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
      compressedSize: compressedData.length
    };
  }

  return {
    data: rawData,
    isCompressed: false,
    originalSize: rawData.length
  };
}

/**
 * Decode binary data to spreadsheet object
 * @param {Uint8Array} data - Binary data from Walrus
 * @returns {Promise<Object>} Decoded spreadsheet data
 */
export async function decodeSpreadsheetData(data) {
  // Decompress if gzipped
  let rawData = data;
  if (isGzipCompressed(data)) {
    rawData = await decompressData(data);
  }

  // Decode to string and parse JSON
  const decoder = new TextDecoder();
  const jsonString = decoder.decode(rawData);
  const parsed = JSON.parse(jsonString);

  // Normalize cells from storage format to UI format
  if (parsed.cells) {
    parsed.cells = normalizeCellData(parsed.cells);
  }

  return parsed;
}

/**
 * Compress data using gzip
 * @param {Uint8Array} data - Data to compress
 * @returns {Promise<Uint8Array>} Compressed data
 */
export async function compressData(data) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    }
  });

  try {
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const chunks = [];
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
  } catch (streamError) {
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
export async function decompressData(data) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    }
  });

  try {
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const chunks = [];
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
  } catch (streamError) {
    // Fallback for mock gzip: strip magic bytes
    if (isGzipCompressed(data)) {
      return data.slice(2);
    }
    return data;
  }
}

/**
 * Check if data is gzip compressed
 * @param {Uint8Array} data - Data to check
 * @returns {boolean} True if gzipped
 */
export function isGzipCompressed(data) {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

/**
 * Calculate SHA-256 hash of data
 * @param {Uint8Array} data - Data to hash
 * @returns {Promise<string>} Hex-encoded hash
 */
export async function calculateContentHash(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper: Optimize cells for storage (UI format → storage format)
function optimizeCellData(cells) {
  const optimized = {};
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
function normalizeCellData(cells) {
  const normalized = {};
  if (!cells || typeof cells !== 'object') return normalized;

  for (const [cellKey, cellData] of Object.entries(cells)) {
    if (!cellData || typeof cellData !== 'object') continue;

    normalized[cellKey] = {
      value: cellData.v !== undefined ? cellData.v : cellData.value,
      formula: cellData.f !== undefined ? cellData.f : cellData.formula,
      type: cellData.t !== undefined ? cellData.t : cellData.type,
      s: cellData.s
    };
  }

  return normalized;
}
