import React, { useState } from 'react';
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
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [previewRows, setPreviewRows] = useState(10);

  if (!isOpen) return null;

  const sheets = importData?.sheets || [];
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

  const currentSheet = sheets[currentSheetIndex] || {};
  const sheetData = currentSheet.data || [];
  const maxRow = Math.min(previewRows, sheetData.length);

  // Get column count from first row
  let maxCol = 0;
  for (let r = 0; r < Math.min(5, sheetData.length); r++) {
    if (sheetData[r]) {
      maxCol = Math.max(maxCol, Object.keys(sheetData[r]).length);
    }
  }
  maxCol = Math.min(maxCol || 10, 10); // Limit to 10 columns in preview

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
                {Array.from({ length: maxRow }).map((_, rowIndex) => (
                  <tr key={rowIndex} className={rowIndex === 0 ? 'header-row' : ''}>
                    <td className="row-number">{rowIndex + 1}</td>
                    {Array.from({ length: maxCol }).map((_, colIndex) => {
                      const cell = sheetData[rowIndex]?.[colIndex];
                      const cellValue = cell?.v !== undefined ? cell.v : cell?.m || '';
                      return (
                        <td
                          key={`${rowIndex}-${colIndex}`}
                          className="preview-cell"
                          title={String(cellValue).substring(0, 100)}
                        >
                          <span className="cell-value">
                            {String(cellValue).substring(0, 50)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
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
              <span className="stat-value">{currentSheet.row || sheetData.length}</span>
            </div>
            <div className="info-stat">
              <span className="stat-label">Columns:</span>
              <span className="stat-value">{currentSheet.column || maxCol}</span>
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
