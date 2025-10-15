/**
 * Blob Lineage Viewer Component
 * Displays blob version history and relationships in a visual timeline
 */

import React, { useState, useEffect } from 'react';
import { blobLineageTracker } from '../../services/BlobLineageTracker.js';
import { EventBus } from '../../utils/EventBus.js';
import '../styles/BlobLineageViewer.css';

export function BlobLineageViewer({ objectId, blobId, isOpen, onClose }) {
  const [lineage, setLineage] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [view, setView] = useState('timeline'); // 'timeline' or 'list'
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    loadLineage();

    // Subscribe to lineage updates
    const handleUpdate = () => {
      loadLineage();
    };

    EventBus.on('blob:lineage:version_created', handleUpdate);
    EventBus.on('blob:lineage:updated', handleUpdate);

    return () => {
      EventBus.off('blob:lineage:version_created', handleUpdate);
      EventBus.off('blob:lineage:updated', handleUpdate);
    };
  }, [isOpen, objectId, blobId]);

  const loadLineage = () => {
    try {
      let result;

      if (objectId) {
        result = blobLineageTracker.getLineageByObjectId(objectId);
      } else if (blobId) {
        result = blobLineageTracker.getLineageByBlobId(blobId);
      } else {
        setError('Either objectId or blobId is required');
        return;
      }

      if (!result.success) {
        setError(result.error);
        setLineage(null);
        setStatistics(null);
        return;
      }

      setLineage(result.lineage);
      setError(null);

      // Load statistics
      if (result.lineage) {
        const stats = blobLineageTracker.getStatistics(result.lineage.objectId);
        setStatistics(stats);
      }

    } catch (err) {
      console.error('[BlobLineageViewer] Failed to load lineage:', err);
      setError(err.message);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    return date.toLocaleDateString();
  };

  const formatSize = (bytes) => {
    if (!bytes) return 'N/A';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  const getPoAStatusBadge = (status) => {
    const badges = {
      certified: { icon: '✅', text: 'Protected', className: 'poa-certified' },
      uncertified: { icon: '❌', text: 'Not Protected', className: 'poa-uncertified' },
      pending: { icon: '⏳', text: 'Saving...', className: 'poa-pending' },
      expired: { icon: '⚠️', text: 'Expired', className: 'poa-expired' },
      unknown: { icon: '❓', text: 'Unknown', className: 'poa-unknown' }
    };

    return badges[status] || badges.unknown;
  };

  const handleVersionClick = (version) => {
    setSelectedVersion(version.blobId === selectedVersion?.blobId ? null : version);
  };

  const handleClose = () => {
    setSelectedVersion(null);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="blob-lineage-modal-overlay" onClick={handleClose}>
      <div className="blob-lineage-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>Version History</h2>
          <div className="view-toggle">
            <button
              className={view === 'timeline' ? 'active' : ''}
              onClick={() => setView('timeline')}
            >
              Timeline
            </button>
            <button
              className={view === 'list' ? 'active' : ''}
              onClick={() => setView('list')}
            >
              List
            </button>
          </div>
          <button
            className="close-button"
            onClick={handleClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {error && (
            <div className="error-section">
              <div className="error-icon">⚠️</div>
              <div className="error-message">{error}</div>
            </div>
          )}

          {!error && lineage && (
            <>
              {/* Statistics */}
              {statistics && (
                <div className="stats-section">
                  <div className="stat-card">
                    <div className="stat-icon">📊</div>
                    <div className="stat-content">
                      <div className="stat-label">Total Versions</div>
                      <div className="stat-value">{statistics.totalVersions}</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">💾</div>
                    <div className="stat-content">
                      <div className="stat-label">Total Size</div>
                      <div className="stat-value">{formatSize(statistics.totalSize)}</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">🔒</div>
                    <div className="stat-content">
                      <div className="stat-label">Protected</div>
                      <div className="stat-value">{statistics.certifiedVersions}</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">📅</div>
                    <div className="stat-content">
                      <div className="stat-label">Age</div>
                      <div className="stat-value">{statistics.ageDays} days</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Version History */}
              <div className={`version-history ${view}`}>
                {view === 'timeline' ? (
                  <div className="timeline">
                    {lineage.versions.slice().reverse().map((version, index) => {
                      const badge = getPoAStatusBadge(version.poaStatus);
                      const isSelected = selectedVersion?.blobId === version.blobId;
                      const isCurrent = version.blobId === lineage.currentBlobId;

                      return (
                        <div
                          key={version.blobId}
                          className={`timeline-item ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
                          onClick={() => handleVersionClick(version)}
                        >
                          <div className="timeline-marker">
                            <div className="marker-dot"></div>
                            {index < lineage.versions.length - 1 && (
                              <div className="marker-line"></div>
                            )}
                          </div>

                          <div className="timeline-content">
                            <div className="version-header">
                              <div className="version-info">
                                <span className="version-number">v{version.version}</span>
                                {isCurrent && <span className="current-badge">Current</span>}
                                <span className={`poa-badge ${badge.className}`}>
                                  {badge.icon} {badge.text}
                                </span>
                              </div>
                              <span className="version-time">{formatTimestamp(version.timestamp)}</span>
                            </div>

                            <div className="version-details">
                              <div className="detail-row">
                                <span className="detail-label">Blob ID:</span>
                                <code className="detail-value blob-id">
                                  {version.blobId.substring(0, 16)}...
                                </code>
                              </div>

                              <div className="detail-row">
                                <span className="detail-label">Size:</span>
                                <span className="detail-value">{formatSize(version.size)}</span>
                              </div>

                              {version.description && (
                                <div className="detail-row">
                                  <span className="detail-label">Description:</span>
                                  <span className="detail-value">{version.description}</span>
                                </div>
                              )}

                              {isSelected && (
                                <div className="expanded-details">
                                  {version.transactionDigest && (
                                    <div className="detail-row">
                                      <span className="detail-label">Transaction:</span>
                                      <a
                                        href={`https://suiexplorer.com/txblock/${version.transactionDigest}?network=testnet`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="detail-link"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {version.transactionDigest.substring(0, 16)}...
                                      </a>
                                    </div>
                                  )}

                                  {version.parentBlobId && (
                                    <div className="detail-row">
                                      <span className="detail-label">Parent:</span>
                                      <code className="detail-value">
                                        {version.parentBlobId.substring(0, 16)}...
                                      </code>
                                    </div>
                                  )}

                                  {version.expiryTimestamp && (
                                    <div className="detail-row">
                                      <span className="detail-label">Expires:</span>
                                      <span className="detail-value">
                                        {new Date(version.expiryTimestamp).toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="version-list">
                    <table>
                      <thead>
                        <tr>
                          <th>Version</th>
                          <th>Blob ID</th>
                          <th>Size</th>
                          <th>Status</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineage.versions.slice().reverse().map((version) => {
                          const badge = getPoAStatusBadge(version.poaStatus);
                          const isCurrent = version.blobId === lineage.currentBlobId;

                          return (
                            <tr
                              key={version.blobId}
                              className={isCurrent ? 'current' : ''}
                              onClick={() => handleVersionClick(version)}
                            >
                              <td>
                                <span className="version-number">v{version.version}</span>
                                {isCurrent && <span className="current-badge-small">Current</span>}
                              </td>
                              <td>
                                <code className="blob-id">{version.blobId.substring(0, 16)}...</code>
                              </td>
                              <td>{formatSize(version.size)}</td>
                              <td>
                                <span className={`poa-badge-small ${badge.className}`}>
                                  {badge.icon} {badge.text}
                                </span>
                              </td>
                              <td>{formatTimestamp(version.timestamp)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {!error && !lineage && (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              <div className="empty-message">No version history available</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="close-footer-button" onClick={handleClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default BlobLineageViewer;
