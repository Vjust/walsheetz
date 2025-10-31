import React, { useState } from 'react';
import { logger, LogComponent } from '@utils/logging/Logger.js';
import './StaleFallbackCleanupModal.css';

/**
 * StaleFallbackCleanupModal Component
 *
 * Shows a modal asking user what to do with stale fallback saves.
 * Provides options to: Export as JSON, Keep Trying, or Delete
 */
export function StaleFallbackCleanupModal({
  staleFallbacks = [],
  onConfirmDelete = () => {},
  onExport = () => {},
  onKeep = () => {}
}) {
  const [selectedKeys, setSelectedKeys] = useState(new Set(staleFallbacks.map(f => f.key)));
  const [isExporting, setIsExporting] = useState(false);

  if (!staleFallbacks || staleFallbacks.length === 0) {
    return null;
  }

  const handleExportAll = async () => {
    setIsExporting(true);
    try {
      for (const fallback of staleFallbacks.filter(f => selectedKeys.has(f.key))) {
        await onExport(fallback.key);
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = () => {
    const keysToDelete = Array.from(selectedKeys);
    logger.info(LogComponent.UI_COMPONENT, 'cleanup_delete', 'Deleting stale fallbacks', {
      count: keysToDelete.length
    });
    onConfirmDelete(keysToDelete);
  };

  const handleKeep = () => {
    logger.info(LogComponent.UI_COMPONENT, 'cleanup_keep', 'Keeping stale fallbacks for retry');
    onKeep();
  };

  const totalSize = staleFallbacks.reduce((sum, f) => sum + f.size, 0);
  const selectedSize = staleFallbacks
    .filter(f => selectedKeys.has(f.key))
    .reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="modal-overlay">
      <div className="stale-cleanup-modal">
        <div className="modal-header">
          <h2>⏳ Old Unsaved Changes Found</h2>
          <p className="modal-subtitle">
            {staleFallbacks.length} save{staleFallbacks.length > 1 ? 's' : ''} older than 7 days
          </p>
        </div>

        <div className="modal-content">
          <p className="modal-description">
            These are spreadsheets that couldn't sync to blockchain and have been waiting for {staleFallbacks[0]?.ageDays || '?'} days.
            What would you like to do?
          </p>

          <div className="fallback-list">
            {staleFallbacks.map((fallback) => (
              <div key={fallback.key} className="fallback-item">
                <input
                  type="checkbox"
                  checked={selectedKeys.has(fallback.key)}
                  onChange={(e) => {
                    const newSelected = new Set(selectedKeys);
                    if (e.target.checked) {
                      newSelected.add(fallback.key);
                    } else {
                      newSelected.delete(fallback.key);
                    }
                    setSelectedKeys(newSelected);
                  }}
                  className="fallback-checkbox"
                />
                <div className="fallback-info">
                  <span className="fallback-age">{fallback.ageDays} days old</span>
                  <span className="fallback-size">({Math.round(fallback.size / 1024)} KB)</span>
                </div>
              </div>
            ))}
          </div>

          <div className="size-info">
            Selected: {Math.round(selectedSize / 1024)} KB of {Math.round(totalSize / 1024)} KB
          </div>
        </div>

        <div className="modal-actions">
          <button
            className="btn btn-export"
            onClick={handleExportAll}
            disabled={isExporting || selectedKeys.size === 0}
            title="Download selected saves as JSON files for backup"
          >
            {isExporting ? '📥 Exporting...' : '📥 Export as JSON'}
          </button>
          <button
            className="btn btn-keep"
            onClick={handleKeep}
            title="Keep these saves and continue retry attempts"
          >
            ⏳ Keep Trying
          </button>
          <button
            className="btn btn-delete"
            onClick={handleDelete}
            disabled={selectedKeys.size === 0}
            title="Permanently delete selected saves from browser storage"
          >
            🗑️ Delete Selected
          </button>
        </div>

        <div className="modal-footer">
          <p className="modal-note">
            💡 Tip: Export first if you want to keep a backup of your data
          </p>
        </div>
      </div>
    </div>
  );
}

export default StaleFallbackCleanupModal;
