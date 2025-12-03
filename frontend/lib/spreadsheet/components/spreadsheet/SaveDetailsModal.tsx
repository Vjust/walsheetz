/**
 * Save Details Modal Component
 * Displays Walrus blob and Sui transaction details with explorer links
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  getSuiExplorerUrl,
  getSuivisionUrl,
  getWalrusExplorerUrl,
  getExplorerDisplayName,
  getExplorerIcon
} from '../../utils/ExplorerLinks.js';
import { browserWalrusService } from '@dreamlit/walrus';
import './SaveDetailsModal.css';

export function SaveDetailsModal({
  isOpen,
  onClose,
  saveInfo,
  network = 'testnet',
  storageAdapter = null,
  onExpiryUpdate = null
}) {
  const [activeTab, setActiveTab] = useState('walrus'); // 'walrus' or 'blockchain'
  const [copiedField, setCopiedField] = useState(null);
  const [isRenewing, setIsRenewing] = useState(false);
  const [renewalError, setRenewalError] = useState(null);

  // Calculate time until expiry
  const getTimeUntilExpiry = useCallback(() => {
    if (!saveInfo?.expiryTimestamp) return null;
    const now = Date.now();
    const timeLeft = saveInfo.expiryTimestamp - now;

    if (timeLeft < 0) return 'Expired';

    const daysLeft = Math.floor(timeLeft / (86400000));
    const hoursLeft = Math.floor((timeLeft % (86400000)) / (3600000));

    if (daysLeft > 0) {
      return `${daysLeft}d ${hoursLeft}h`;
    } else {
      return `${hoursLeft}h`;
    }
  }, [saveInfo?.expiryTimestamp]);

  // Format timestamp for display
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleString();
  };

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  // Copy to clipboard helper
  const copyToClipboard = useCallback(async (text, fieldName) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, []);

  // Handle blob storage renewal
  const handleRenewStorage = useCallback(async () => {
    if (!saveInfo?.blobId) {
      setRenewalError('Blob ID is missing');
      return;
    }

    setIsRenewing(true);
    setRenewalError(null);

    try {
      const result = await browserWalrusService.extendBlobStorage(saveInfo.blobId, 10);

      if (result.success) {
        // 1. Persist to StorageAdapter (session storage)
        if (storageAdapter && result.expiryTimestamp) {
          storageAdapter.setWalrusBlobExpiry(saveInfo.blobId, {
            timestamp: result.expiryTimestamp,
            epochs: result.remainingEpochs || result.additionalEpochs || 10,
            endEpoch: result.endEpoch
          });
          console.log('✅ Blob expiry persisted to StorageAdapter');
        }

        // 2. Update parent state (via Header -> useSpreadsheet)
        if (onExpiryUpdate && result.expiryTimestamp) {
          onExpiryUpdate({
            expiryTimestamp: result.expiryTimestamp,
            endEpoch: result.endEpoch
          });
          console.log('✅ Parent lastSaveInfo updated');
        }

        // 3. Emit event for devtools/telemetry
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('blob:expiry-extended', {
            detail: {
              blobId: saveInfo.blobId,
              oldExpiry: saveInfo.expiryTimestamp,
              newExpiry: result.expiryTimestamp,
              endEpoch: result.endEpoch,
              additionalEpochs: result.additionalEpochs || 10
            }
          }));
          console.log('✅ blob:expiry-extended event emitted');
        }

        setRenewalError(null);

        // Calculate new time remaining for success message
        const timeLeft = result.expiryTimestamp - Date.now();
        const daysLeft = Math.floor(timeLeft / 86400000);
        const hoursLeft = Math.floor((timeLeft % 86400000) / 3600000);

        alert(`✅ Storage extended successfully!\n\nNew expiry: ${daysLeft}d ${hoursLeft}h\nBlob will be available for ${daysLeft} more days.`);

      } else {
        setRenewalError(result.error || 'Failed to extend storage');
        console.error('❌ Renewal failed:', result.error);
      }
    } catch (error) {
      console.error('❌ Error renewing storage:', error);
      setRenewalError(error.message || 'An error occurred while renewing storage');
    } finally {
      setIsRenewing(false);
    }
  }, [saveInfo?.blobId, saveInfo?.expiryTimestamp, storageAdapter, onExpiryUpdate]);

  // Close modal on escape key
  useEffect(() => {
    const handleEscapeKey = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !saveInfo) {
    return null;
  }

  const timeUntilExpiry = getTimeUntilExpiry();
  const isExpiryApproaching = saveInfo.expiryTimestamp &&
    (saveInfo.expiryTimestamp - Date.now()) < (7 * 86400000); // Less than 7 days

  return (
    <div className="save-details-modal-overlay" onClick={onClose}>
      <div className="save-details-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>Save Details</h2>
          <button
            className="close-button"
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'walrus' ? 'active' : ''}`}
            onClick={() => setActiveTab('walrus')}
          >
            🦭 Walrus Storage
          </button>
          <button
            className={`tab-button ${activeTab === 'blockchain' ? 'active' : ''}`}
            onClick={() => setActiveTab('blockchain')}
          >
            🔗 Blockchain
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {activeTab === 'walrus' && (
            <div className="tab-content walrus-content">
              {/* Expiry Warning */}
              {isExpiryApproaching && (
                <div className="expiry-warning">
                  <div className="warning-icon">⚠️</div>
                  <div className="warning-content">
                    <div className="warning-title">Storage Expiring Soon</div>
                    <div className="warning-message">
                      This blob will expire in {timeUntilExpiry}. Consider extending the storage.
                    </div>
                  </div>
                </div>
              )}

              {/* Blob ID */}
              <div className="info-section">
                <div className="section-title">Blob ID</div>
                <div className="info-row with-copy">
                  <code className="info-value blob-id">{saveInfo.blobId || 'N/A'}</code>
                  <button
                    className="copy-button"
                    onClick={() => copyToClipboard(saveInfo.blobId, 'blobId')}
                    title="Copy Blob ID"
                  >
                    {copiedField === 'blobId' ? '✓' : '📋'}
                  </button>
                </div>
              </div>

              {/* Content Hash */}
              {saveInfo.contentHash && (
                <div className="info-section">
                  <div className="section-title">Content Hash</div>
                  <div className="info-row with-copy">
                    <code className="info-value">{saveInfo.contentHash}</code>
                    <button
                      className="copy-button"
                      onClick={() => copyToClipboard(saveInfo.contentHash, 'contentHash')}
                      title="Copy Content Hash"
                    >
                      {copiedField === 'contentHash' ? '✓' : '📋'}
                    </button>
                  </div>
                </div>
              )}

              {/* Storage Status */}
              <div className="info-section">
                <div className="section-title">Storage Status</div>
                <div className="info-value">
                  <span className={`status-badge ${saveInfo.storageStatus}`}>
                    {saveInfo.storageStatus === 'newly_created' ? '✨ Newly Created' : '📦 Already Certified'}
                  </span>
                </div>
              </div>

              {/* Expiry Information */}
              <div className="info-section">
                <div className="section-title">Expiry</div>
                <div className="info-value">{formatTimestamp(saveInfo.expiryTimestamp)}</div>
                {timeUntilExpiry && (
                  <div className="info-subtext">Expires in {timeUntilExpiry}</div>
                )}
              </div>

              {/* Explorer Link */}
              <div className="info-section">
                <div className="section-title">View on Explorer</div>
                <a
                  href={getWalrusExplorerUrl(saveInfo.blobId, network)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="explorer-link walrus-link"
                >
                  {getExplorerIcon('walrus')} {getExplorerDisplayName('walrus')}
                  <span className="external-icon">↗</span>
                </a>
              </div>

              {/* Renewal Button */}
              {isExpiryApproaching && (
                <div className="renewal-section">
                  <button
                    className="renewal-button"
                    onClick={handleRenewStorage}
                    disabled={isRenewing}
                  >
                    {isRenewing ? 'Extending...' : 'Extend Storage'}
                  </button>
                  {renewalError && (
                    <div className="renewal-error">{renewalError}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'blockchain' && (
            <div className="tab-content blockchain-content">
              {/* Transaction Digest */}
              <div className="info-section">
                <div className="section-title">Transaction Digest</div>
                <div className="info-row with-copy">
                  <code className="info-value tx-digest">{saveInfo.transactionDigest || 'N/A'}</code>
                  <button
                    className="copy-button"
                    onClick={() => copyToClipboard(saveInfo.transactionDigest, 'txDigest')}
                    title="Copy Transaction Digest"
                  >
                    {copiedField === 'txDigest' ? '✓' : '📋'}
                  </button>
                </div>
              </div>

              {/* Timestamp */}
              <div className="info-section">
                <div className="section-title">Saved At</div>
                <div className="info-value">{formatTimestamp(saveInfo.timestamp)}</div>
              </div>

              {/* Storage Strategy */}
              {saveInfo.storageStrategy && (
                <div className="info-section">
                  <div className="section-title">Storage Strategy</div>
                  <div className="info-value">
                    <span className="strategy-badge">{saveInfo.storageStrategy}</span>
                  </div>
                </div>
              )}

              {/* Method */}
              {saveInfo.method && (
                <div className="info-section">
                  <div className="section-title">Save Method</div>
                  <div className="info-value">{saveInfo.method}</div>
                </div>
              )}

              {/* Explorer Links */}
              <div className="info-section">
                <div className="section-title">View on Explorers</div>
                <div className="explorer-links">
                  <a
                    href={getSuiExplorerUrl(saveInfo.transactionDigest, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="explorer-link sui-explorer-link"
                  >
                    {getExplorerIcon('suiExplorer')} {getExplorerDisplayName('suiExplorer')}
                    <span className="external-icon">↗</span>
                  </a>
                  <a
                    href={getSuivisionUrl(saveInfo.transactionDigest, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="explorer-link suivision-link"
                  >
                    {getExplorerIcon('suivision')} {getExplorerDisplayName('suivision')}
                    <span className="external-icon">↗</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="close-footer-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default SaveDetailsModal;
