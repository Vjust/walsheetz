import React, { useState, useMemo, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import './ImportPreviewModal.css';

/**
 * Import Preview Modal Component
 * Displays a preview of imported data before loading into Luckysheet
 */
export const ImportPreviewModal = ({
  isOpen,
  onClose,
  onConfirm,
  importData,
  fileName,
  isLoading = false
}) => {
  // CALL ALL HOOKS FIRST (before any conditional returns)
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [previewRows, setPreviewRows] = useState(10);

  // Safe defaults even when modal is closed
  const sheets = importData?.sheets || [];
  const currentSheet = sheets[currentSheetIndex] || {};
  const hasGridData = Array.isArray(currentSheet.data) && currentSheet.data.length > 0
  const hasCellData = Array.isArray(currentSheet.celldata) && currentSheet.celldata.length > 0

  // Build a lightweight lookup from celldata if needed for preview (memoized)
  const cellLookup = useMemo(() => {
    if (!hasGridData && hasCellData) {
      const lookup = new Map()
      for (const cell of currentSheet.celldata) {
        const key = `${cell.r}:${cell.c}`
        lookup.set(key, cell.v)
      }
      return lookup
    }
    return null
  }, [hasGridData, hasCellData, currentSheet.celldata])

  // Accessor to fetch a cell object compatible with getCellValue()
  const getCellAt = useMemo(() => (r, c) => {
    if (hasGridData) {
      return currentSheet.data[r]?.[c]
    }
    if (cellLookup) {
      return cellLookup.get(`${r}:${c}`)
    }
    return undefined
  }, [hasGridData, currentSheet.data, cellLookup])

  // Get actual row and column counts from sheet config or calculate from data (memoized)
  const { totalRows, totalCols } = useMemo(() => {
    let rows = currentSheet.row
    let cols = currentSheet.column

    if (!rows || !cols) {
      if (hasGridData) {
        rows = rows || currentSheet.data.length
        // Use reduce instead of spread operator to avoid stack overflow with large arrays
        cols = cols || currentSheet.data.reduce((max, r) =>
          Math.max(max, Array.isArray(r) ? r.length : 0), 0)
      } else if (hasCellData) {
        // Use reduce instead of spread operator to avoid stack overflow
        const maxR = currentSheet.celldata.reduce((max, c) => Math.max(max, c.r || 0), 0)
        const maxC = currentSheet.celldata.reduce((max, c) => Math.max(max, c.c || 0), 0)
        rows = rows || (maxR + 1)
        cols = cols || (maxC + 1)
      } else {
        rows = rows || 0
        cols = cols || 0
      }
    }

    return { totalRows: rows, totalCols: cols }
  }, [currentSheet, hasGridData, hasCellData])

  // Debug: Log data structure to help understand format (development mode only)
  useEffect(() => {
    if ((hasGridData || hasCellData) && process.env.NODE_ENV === 'development') {
      console.log('ImportPreviewModal - Sheet data sample:', {
        mode: hasGridData ? 'grid' : 'celldata',
        exampleCell: getCellAt(0, 0),
        sheetInfo: {
          name: currentSheet.name,
          row: currentSheet.row,
          column: currentSheet.column
        }
      });
    }
  }, [currentSheetIndex, hasGridData, hasCellData]); // Only log when sheet changes, not on every render

  // NOW conditional returns (after all hooks)
  if (!isOpen) return null;

  if (sheets.length === 0) {
    return (
      <div className="import-preview-modal-overlay">
        <div className="import-preview-modal">
          <div className="modal-header">
            <h2>Import Preview</h2>
            <button
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
          <div className="modal-content">
            <p className="error-message">No data found in the selected file.</p>
          </div>
          <div className="modal-footer">
            <button className="modal-btn modal-cancel-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  const maxRow = Math.min(previewRows, totalRows);
  const maxCol = Math.min(totalCols, 10); // Limit to 10 columns in preview

  // Helper function to get cell value from different possible structures
  const getCellValue = (rowData, colIndex) => {
    if (!rowData) return '';
    
    // Handle both array and object row structures
    const cell = Array.isArray(rowData) ? rowData[colIndex] : rowData[colIndex];
    
    // If no cell data at this position
    if (cell === undefined || cell === null) return '';
    
    // Handle different cell formats
    // LuckyExcel format: { v: value, m: formatted, ct: { fa: format, t: type } }
    if (typeof cell === 'object' && cell !== null) {
      // Prefer 'v' (value) over 'm' (formatted)
      if (cell.v !== undefined && cell.v !== null) {
        // Handle boolean values
        if (typeof cell.v === 'boolean') return cell.v ? 'TRUE' : 'FALSE';
        // Handle numbers and strings
        return cell.v;
      }
      if (cell.m !== undefined && cell.m !== null) {
        return cell.m;
      }
      // Check for other common property names
      if (cell.text !== undefined && cell.text !== null) {
        return cell.text;
      }
      if (cell.value !== undefined && cell.value !== null) {
        return cell.value;
      }
      // If cell is empty object or only has formatting
      return '';
    }
    
    // If cell is primitive value (string, number, boolean)
    if (typeof cell === 'boolean') return cell ? 'TRUE' : 'FALSE';
    return cell;
  };

  return (
    <div className="import-preview-modal-overlay" onClick={onClose}>
      <div
        className="import-preview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="header-info">
            <h2>Import Preview</h2>
            <p className="file-info">📄 {fileName}</p>
          </div>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Sheet Selector */}
        {sheets.length > 1 && (
          <div className="sheet-selector">
            <button
              className="sheet-nav-btn"
              onClick={() => setCurrentSheetIndex(Math.max(0, currentSheetIndex - 1))}
              disabled={currentSheetIndex === 0}
              aria-label="Previous sheet"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="sheet-info">
              <span className="sheet-name">{currentSheet.name || `Sheet ${currentSheetIndex + 1}`}</span>
              <span className="sheet-count">
                {currentSheetIndex + 1} of {sheets.length}
              </span>
            </div>
            <button
              className="sheet-nav-btn"
              onClick={() => setCurrentSheetIndex(Math.min(sheets.length - 1, currentSheetIndex + 1))}
              disabled={currentSheetIndex === sheets.length - 1}
              aria-label="Next sheet"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* Data Preview Table */}
        <div className="modal-content">
          <div className="preview-table-wrapper">
            <table className="preview-table">
              <tbody>
                {Array.from({ length: maxRow }).map((_, rowIndex) => {
                  return (
                    <tr key={rowIndex} className={rowIndex === 0 ? 'header-row' : ''}>
                      <td className="row-number">{rowIndex + 1}</td>
                      {Array.from({ length: maxCol }).map((_, colIndex) => {
                        const cellValue = getCellValue(hasGridData ? currentSheet.data[rowIndex] : getCellAt(rowIndex, colIndex) ? { [colIndex]: getCellAt(rowIndex, colIndex) } : undefined, colIndex);
                        const displayValue = cellValue === '' || cellValue === null || cellValue === undefined 
                          ? '' 
                          : String(cellValue);
                        return (
                          <td
                            key={`${rowIndex}-${colIndex}`}
                            className="preview-cell"
                            title={displayValue || 'Empty cell'}
                          >
                            <span className="cell-value">
                              {displayValue || <span style={{ opacity: 0.3, fontStyle: 'italic' }}>—</span>}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Preview Info */}
          <div className="preview-info">
            <div className="info-stat">
              <span className="stat-label">Sheets:</span>
              <span className="stat-value">{sheets.length}</span>
            </div>
            <div className="info-stat">
              <span className="stat-label">Rows:</span>
              <span className="stat-value">{totalRows}</span>
            </div>
            <div className="info-stat">
              <span className="stat-label">Columns:</span>
              <span className="stat-value">{totalCols}</span>
            </div>
          </div>

          {/* Row Limit Selector */}
          <div className="preview-controls">
            <label htmlFor="preview-rows">Preview rows:</label>
            <select
              id="preview-rows"
              className="preview-select"
              value={previewRows}
              onChange={(e) => setPreviewRows(Number(e.target.value))}
            >
              <option value={5}>5 rows</option>
              <option value={10}>10 rows</option>
              <option value={20}>20 rows</option>
              <option value={50}>50 rows</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="modal-btn modal-cancel-btn"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className="modal-btn modal-confirm-btn"
            onClick={() => onConfirm(currentSheetIndex)}
            disabled={isLoading}
          >
            {isLoading ? 'Importing...' : 'Import Data'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportPreviewModal;
