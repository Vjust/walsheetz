// Grid Streamer - Stream blob data as grid/spreadsheet format

/**
 * Stream blob to grid format (2D array)
 * @param {string} blobId - Blob ID to retrieve
 * @param {number} startRow - Starting row index
 * @param {number} startCol - Starting column index
 * @param {Object} options - Options {format: 'csv'|'json', delimiter, maxRows, maxCols}
 * @param {Object} blobClient - WalrusBlobClient instance
 * @returns {Promise<{success: boolean, data: Array<Array>, metadata: {rows: number, cols: number, format: string}}>}
 */
export async function streamBlobToGrid(blobId, startRow, startCol, options, blobClient) {
  try {
    // Retrieve blob
    const decoded = await blobClient.retrieveBlob(blobId);

    // Parse based on format
    const format = options?.format || 'json';
    let gridData = [];

    if (format === 'csv') {
      gridData = parseCSV(decoded, options);
    } else if (format === 'json') {
      gridData = parseJSON(decoded);
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }

    // Apply slice for startRow/startCol
    const slicedData = gridData
      .slice(startRow)
      .map(row => Array.isArray(row) ? row.slice(startCol) : []);

    // Apply limits if specified
    const maxRows = options?.maxRows || slicedData.length;
    const maxCols = options?.maxCols || (slicedData[0]?.length || 0);
    const limitedData = slicedData
      .slice(0, maxRows)
      .map(row => row.slice(0, maxCols));

    return {
      success: true,
      data: limitedData,
      metadata: {
        rows: limitedData.length,
        cols: limitedData[0]?.length || 0,
        format
      }
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      metadata: { rows: 0, cols: 0, format: options?.format || 'unknown' },
      error: error.message
    };
  }
}

// Helper: Parse CSV to 2D array
function parseCSV(data, options) {
  const delimiter = options?.delimiter || ',';

  // Convert to string if cells object
  let text = '';
  if (typeof data === 'object' && data.cells) {
    // Convert spreadsheet cells to CSV
    const rows = [];
    for (const [key, cell] of Object.entries(data.cells)) {
      const match = key.match(/^([A-Z]+)(\d+)$/);
      if (match) {
        const colIndex = columnToIndex(match[1]);
        const rowIndex = parseInt(match[2]) - 1;
        rows[rowIndex] = rows[rowIndex] || [];
        rows[rowIndex][colIndex] = cell.value || cell.v || '';
      }
    }
    return rows.filter(Boolean);
  }

  // Otherwise try to parse as CSV string
  text = typeof data === 'string' ? data : JSON.stringify(data);
  return text.split('\n').map(line => line.split(delimiter));
}

// Helper: Parse JSON to 2D array
function parseJSON(data) {
  if (Array.isArray(data)) {
    return data.map(row => Array.isArray(row) ? row : [row]);
  }
  if (typeof data === 'object' && data.cells) {
    // Convert spreadsheet cells to 2D array
    return parseCSV(data, {});
  }
  return [[data]];
}

// Helper: Convert column letter to index (A=0, B=1, ..., Z=25, AA=26)
function columnToIndex(col) {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index - 1;
}
