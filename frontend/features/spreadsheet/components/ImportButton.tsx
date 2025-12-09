import React, { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import './ImportButton.css';

/**
 * Import Button Component
 * Allows users to upload Excel files and import them into Luckysheet
 */
export const ImportButton = ({
  onImport,
  onError,
  disabled = false,
  isLoading = false,
  title = "Import Excel"
}) => {
  const fileInputRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);

    try {
      if (onImport) {
        await onImport(file);
      }
    } catch (error) {
      console.error('Import error:', error);
      if (onError) {
        onError(error);
      }
    } finally {
      setIsProcessing(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="import-button-container">
      <button
        className="import-button"
        onClick={handleClick}
        disabled={disabled || isProcessing || isLoading}
        title={title}
        aria-label="Import Excel file"
      >
        <FileUp size={18} />
        <span className="button-text">
          {isProcessing ? 'Importing...' : 'Import'}
        </span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
    </div>
  );
};

export default ImportButton;
