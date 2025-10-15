/**
 * useGridTransform Hook
 * Domain hook for transforming grid data to/from Walrus blobs
 */
import { useState, useCallback } from 'react';
import { browserWalrusService } from '../../services/BrowserWalrusService.js';
import { parseBlob, serializeRange } from '../../utils/BlobParser.js';
import { logger, LogComponent } from '../../utils/Logger.js';

/**
 * Hook for transforming grid data between spreadsheet and Walrus blobs
 * @returns {Object} Transform state and methods
 */
export function useGridTransform() {
  const [transforming, setTransforming] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  /**
   * Load blob into grid range
   * @param {string} blobId - Blob ID to load
   * @param {number} startRow - Starting row (0-indexed)
   * @param {number} startCol - Starting column (0-indexed)
   * @param {Object} options - Transform options
   * @returns {Promise<Object>} Transform result
   */
  const blobToGrid = useCallback(async (blobId, startRow = 0, startCol = 0, options = {}) => {
    setTransforming(true);
    setError(null);
    setProgress({ stage: 'downloading', percent: 0 });

    try {
      logger.debug(LogComponent.UI, 'transform_blob_to_grid', 'Transforming blob to grid', {
        blobId,
        startRow,
        startCol
      });

      // Download blob
      setProgress({ stage: 'downloading', percent: 25 });
      const blobResult = await browserWalrusService.retrieveBlob(blobId);

      if (!blobResult.success) {
        throw new Error(blobResult.error || 'Failed to retrieve blob');
      }

      // Parse blob
      setProgress({ stage: 'parsing', percent: 50 });
      const parsed = await parseBlob(blobResult.data, {
        ...options,
        startRow,
        startCol
      });

      if (!parsed.success) {
        throw new Error(parsed.error || 'Failed to parse blob');
      }

      // Inject into grid
      setProgress({ stage: 'injecting', percent: 75 });
      if (window.luckysheet && parsed.data) {
        for (let i = 0; i < parsed.data.length; i++) {
          for (let j = 0; j < parsed.data[i].length; j++) {
            window.luckysheet.setCellValue(
              startRow + i,
              startCol + j,
              parsed.data[i][j]
            );
          }
        }
      }

      setProgress({ stage: 'complete', percent: 100 });

      logger.info(LogComponent.UI, 'transform_blob_to_grid_success', 'Blob loaded into grid', {
        blobId,
        rows: parsed.rows,
        cols: parsed.cols,
        format: parsed.format
      });

      return {
        success: true,
        blobId,
        startRow,
        startCol,
        endRow: startRow + parsed.rows - 1,
        endCol: startCol + parsed.cols - 1,
        rows: parsed.rows,
        cols: parsed.cols,
        format: parsed.format
      };
    } catch (error) {
      logger.error(LogComponent.UI, 'transform_blob_to_grid_error', 'Failed to transform blob', {
        blobId,
        error: error.message
      });
      setError(error.message);
      throw error;
    } finally {
      setTransforming(false);
      setProgress(null);
    }
  }, []);

  /**
   * Save grid range to Walrus blob
   * @param {number} startRow - Starting row (0-indexed)
   * @param {number} startCol - Starting column (0-indexed)
   * @param {number} endRow - Ending row (0-indexed)
   * @param {number} endCol - Ending column (0-indexed)
   * @param {Object} options - Transform options
   * @returns {Promise<Object>} Upload result
   */
  const gridToBlob = useCallback(async (startRow, startCol, endRow, endCol, options = {}) => {
    setTransforming(true);
    setError(null);
    setProgress({ stage: 'extracting', percent: 0 });

    try {
      logger.debug(LogComponent.UI, 'transform_grid_to_blob', 'Transforming grid to blob', {
        startRow,
        startCol,
        endRow,
        endCol
      });

      // Extract data from grid
      setProgress({ stage: 'extracting', percent: 25 });
      const gridData = [];
      if (window.luckysheet) {
        for (let r = startRow; r <= endRow; r++) {
          const row = [];
          for (let c = startCol; c <= endCol; c++) {
            const value = window.luckysheet.getCellValue(r, c);
            row.push(value || '');
          }
          gridData.push(row);
        }
      }

      if (gridData.length === 0) {
        throw new Error('No data to upload');
      }

      // Serialize data
      setProgress({ stage: 'serializing', percent: 50 });
      const serialized = await serializeRange(gridData, {
        format: options.format || 'json',
        includeHeaders: options.includeHeaders !== false
      });

      if (!serialized.success) {
        throw new Error(serialized.error || 'Failed to serialize data');
      }

      // Upload to Walrus
      setProgress({ stage: 'uploading', percent: 75 });
      const uploadResult = await browserWalrusService.storeBlob({
        content: serialized.data,
        format: options.format || 'json',
        metadata: {
          source: 'spreadsheet',
          startRow,
          startCol,
          endRow,
          endCol,
          rows: gridData.length,
          cols: gridData[0]?.length || 0,
          ...options.metadata
        }
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload to Walrus');
      }

      setProgress({ stage: 'complete', percent: 100 });

      logger.info(LogComponent.UI, 'transform_grid_to_blob_success', 'Grid uploaded to Walrus', {
        blobId: uploadResult.blobId,
        size: serialized.metadata?.size
      });

      return {
        success: true,
        blobId: uploadResult.blobId,
        size: serialized.metadata?.size,
        format: options.format || 'json',
        rows: gridData.length,
        cols: gridData[0]?.length || 0
      };
    } catch (error) {
      logger.error(LogComponent.UI, 'transform_grid_to_blob_error', 'Failed to transform grid', {
        error: error.message
      });
      setError(error.message);
      throw error;
    } finally {
      setTransforming(false);
      setProgress(null);
    }
  }, []);

  /**
   * Parse range string to coordinates
   * @param {string} range - Range string (e.g., "A1:Z100")
   * @returns {Object} Range coordinates
   */
  const parseRangeString = useCallback((range) => {
    const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) {
      throw new Error(`Invalid range format: ${range}`);
    }

    const startCol = match[1].charCodeAt(0) - 65;
    const startRow = parseInt(match[2]) - 1;
    const endCol = match[3].charCodeAt(0) - 65;
    const endRow = parseInt(match[4]) - 1;

    return { startRow, startCol, endRow, endCol };
  }, []);

  /**
   * Convert coordinates to range string
   * @param {number} startRow - Starting row (0-indexed)
   * @param {number} startCol - Starting column (0-indexed)
   * @param {number} endRow - Ending row (0-indexed)
   * @param {number} endCol - Ending column (0-indexed)
   * @returns {string} Range string
   */
  const coordinatesToRange = useCallback((startRow, startCol, endRow, endCol) => {
    const startColStr = String.fromCharCode(65 + startCol);
    const endColStr = String.fromCharCode(65 + endCol);
    return `${startColStr}${startRow + 1}:${endColStr}${endRow + 1}`;
  }, []);

  /**
   * Get current selection from Luckysheet
   * @returns {Object|null} Selection coordinates or null
   */
  const getCurrentSelection = useCallback(() => {
    if (!window.luckysheet) return null;

    const selection = window.luckysheet.getRange();
    if (!selection || selection.length === 0) return null;

    const { row, column } = selection[0];
    return {
      startRow: row[0],
      startCol: column[0],
      endRow: row[1],
      endCol: column[1]
    };
  }, []);

  return {
    // State
    transforming,
    progress,
    error,

    // Methods
    blobToGrid,
    gridToBlob,
    parseRangeString,
    coordinatesToRange,
    getCurrentSelection
  };
}

export default useGridTransform;
