import React, { useState } from 'react';
import { FileDown, ChevronDown } from 'lucide-react';
import './ExportButton.css';

/**
 * Export Button Component
 * Allows users to export Luckysheet data to Excel or CSV
 */
export const ExportButton = ({
  onExport,
  onError,
  disabled = false,
  isLoading = false,
  title = "Export Spreadsheet"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format) => {
    setIsExporting(true);
    setIsOpen(false);

    try {
      if (onExport) {
        await onExport(format);
      }
    } catch (error) {
      console.error('Export error:', error);
      if (onError) {
        onError(error);
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="export-button-container">
      <div className="export-dropdown">
        <button
          className="export-button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled || isExporting || isLoading}
          title={title}
          aria-label="Export spreadsheet"
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <FileDown size={18} />
          <span className="button-text">
            {isExporting ? 'Exporting...' : 'Export'}
          </span>
          <ChevronDown size={16} className={`chevron ${isOpen ? 'open' : ''}`} />
        </button>

        {isOpen && (
          <div className="export-menu">
            <button
              className="export-menu-item"
              onClick={() => handleExport('xlsx')}
              disabled={isExporting || disabled || isLoading}
            >
              <span className="menu-icon">📊</span>
              <span className="menu-text">Export as Excel (.xlsx)</span>
            </button>
            <button
              className="export-menu-item"
              onClick={() => handleExport('csv')}
              disabled={isExporting || disabled || isLoading}
            >
              <span className="menu-icon">📋</span>
              <span className="menu-text">Export as CSV</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExportButton;
