/**
 * PoA Renewal Modal Component
 * UI for renewing PoA certificates for Walrus blobs
 */

import React, { useState, useEffect } from 'react';
import { poaRenewalManager } from '../../services/PoARenewalManager.js';
import { EventBus } from '@utils/helpers/EventBus.js';
import '../styles/PoACertificationModal.css'; // Reuse certification modal styles

export function PoARenewalModal({ blobId, certificate, isOpen, onClose, onSuccess, onError }) {
  const [status, setStatus] = useState('idle'); // idle, processing, completed, failed
  const [durationDays, setDurationDays] = useState(30);
  const [estimatedCost, setEstimatedCost] = useState(null);
  const [error, setError] = useState(null);
  const [transactionDigest, setTransactionDigest] = useState(null);
  const [progress, setProgress] = useState(null);
  const [expiryInfo, setExpiryInfo] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setStatus('idle');
      setError(null);
      setTransactionDigest(null);
      setProgress(null);
    } else {
      // Calculate expiry info when opening
      calculateExpiryInfo();
      estimateGasCost();
    }
  }, [isOpen, certificate]);

  useEffect(() => {
    if (!isOpen || !blobId) return;

    // Subscribe to events
    const handleCompleted = (data) => {
      if (data.blobId === blobId) {
        setStatus('completed');
        setTransactionDigest(data.transactionDigest);
        setProgress('Renewal transaction confirmed');

        if (onSuccess) {
          onSuccess(data);
        }
      }
    };

    const handleFailed = (data) => {
      if (data.blobId === blobId) {
        setStatus('failed');
        setError(data.error || 'Renewal failed');
        setProgress(null);

        if (onError) {
          onError(data);
        }
      }
    };

    EventBus.on('poa:renewal:completed', handleCompleted);
    EventBus.on('poa:renewal:failed', handleFailed);

    return () => {
      EventBus.off('poa:renewal:completed', handleCompleted);
      EventBus.off('poa:renewal:failed', handleFailed);
    };
  }, [isOpen, blobId, onSuccess, onError]);

  const calculateExpiryInfo = () => {
    if (!certificate) return;

    const expiryTimestamp = certificate.expiryTimestamp;
    if (!expiryTimestamp) return;

    const now = Date.now();
    const timeUntilExpiry = expiryTimestamp - now;
    const daysUntilExpiry = Math.floor(timeUntilExpiry / (24 * 60 * 60 * 1000));
    const isExpired = timeUntilExpiry <= 0;

    setExpiryInfo({
      expiryTimestamp,
      timeUntilExpiry,
      daysUntilExpiry: Math.max(0, daysUntilExpiry),
      isExpired,
      expiryDate: new Date(expiryTimestamp).toLocaleString()
    });
  };

  const estimateGasCost = () => {
    try {
      // Simple estimation: ~0.01 SUI for renewal transaction
      const estimatedSUI = 0.01;
      const estimatedCostUSD = estimatedSUI * 0.50; // Assume $0.50 per SUI

      setEstimatedCost({
        sui: estimatedSUI,
        usd: estimatedCostUSD
      });

    } catch (error) {
      console.error('[PoARenewalModal] Failed to estimate cost:', error);
    }
  };

  const handleRenew = async () => {
    try {
      setStatus('processing');
      setError(null);
      setProgress('Requesting wallet approval...');

      const result = await poaRenewalManager.requestRenewal(blobId, {
        durationDays
      });

      if (result.success) {
        setProgress('Transaction submitted, confirming...');
        // Status updates will come via events
      } else {
        setStatus('failed');
        setError(result.error || 'Failed to renew protection');
        setProgress(null);

        if (onError) {
          onError(result);
        }
      }
    } catch (error) {
      console.error('[PoARenewalModal] Renewal error:', error);
      setStatus('failed');
      setError(error.message || 'Failed to renew protection');
      setProgress(null);

      if (onError) {
        onError({ error: error.message });
      }
    }
  };

  const handleDurationChange = (e) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0 && value <= 365) {
      setDurationDays(value);
    }
  };

  const handleClose = () => {
    if (status !== 'processing') {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="poa-certification-modal-overlay" onClick={handleClose}>
      <div className="poa-certification-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Renew Blockchain Protection</h2>
          <button
            className="close-button"
            onClick={handleClose}
            disabled={status === 'processing'}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Blob Info */}
          <div className="blob-info-section">
            <div className="info-row">
              <span className="label">Blob ID:</span>
              <code className="value">{blobId?.substring(0, 32)}...</code>
            </div>
          </div>

          {/* Expiry Information */}
          {expiryInfo && (
            <div className={`cost-section ${expiryInfo.isExpired ? 'error-bg' : ''}`}>
              <div className="cost-label">
                {expiryInfo.isExpired ? '⚠️ Protection Expired' : 'Current Protection Status'}
              </div>
              <div className="cost-value">
                <span className="cost-sui">
                  {expiryInfo.isExpired
                    ? 'Expired'
                    : `${expiryInfo.daysUntilExpiry} days remaining`}
                </span>
              </div>
              <div className="cost-note">
                {expiryInfo.isExpired
                  ? 'Your data may be deleted at any time. Renew immediately!'
                  : `Expires on ${expiryInfo.expiryDate}`}
              </div>
            </div>
          )}

          {/* Duration Selection */}
          <div className="duration-section">
            <label htmlFor="duration-input">
              <span className="label-text">Extend Protection Duration</span>
              <span className="label-hint">(1-365 days)</span>
            </label>
            <div className="duration-input-group">
              <input
                id="duration-input"
                type="number"
                min="1"
                max="365"
                value={durationDays}
                onChange={handleDurationChange}
                disabled={status === 'processing' || status === 'completed'}
                className="duration-input"
              />
              <span className="duration-unit">days</span>
            </div>
          </div>

          {/* Cost Estimation */}
          {estimatedCost && (
            <div className="cost-section">
              <div className="cost-label">Estimated Transaction Cost</div>
              <div className="cost-value">
                <span className="cost-sui">~{estimatedCost.sui} SUI</span>
                <span className="cost-usd">(~${estimatedCost.usd.toFixed(2)} USD)</span>
              </div>
              <div className="cost-note">
                Actual cost may vary based on network conditions
              </div>
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div className="progress-section">
              <div className="progress-indicator">
                <div className="spinner"></div>
                <span className="progress-text">{progress}</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="error-section">
              <div className="error-icon">⚠️</div>
              <div className="error-message">{error}</div>
            </div>
          )}

          {/* Success */}
          {status === 'completed' && transactionDigest && (
            <div className="success-section">
              <div className="success-icon">✅</div>
              <div className="success-message">Protection renewed successfully!</div>
              <div className="transaction-info">
                <span className="label">Transaction:</span>
                <a
                  href={`https://suiexplorer.com/txblock/${transactionDigest}?network=testnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transaction-link"
                >
                  {transactionDigest.substring(0, 16)}...
                </a>
              </div>
              <div className="success-note">
                Your data protection has been extended for {durationDays} days
              </div>
            </div>
          )}

          {/* Info */}
          {status === 'idle' && (
            <div className="info-section">
              <h3>Why Renew Protection?</h3>
              <p>
                Blockchain protection ensures your data stays available and cannot be deleted.
                Without an active protection certificate, your data may be removed from storage.
              </p>
              <ul>
                <li>Extends your data's lifetime</li>
                <li>Prevents automatic deletion</li>
                <li>Can be renewed multiple times</li>
                <li>Verifiable on the blockchain</li>
              </ul>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="cancel-button"
            onClick={handleClose}
            disabled={status === 'processing'}
          >
            {status === 'completed' ? 'Close' : 'Cancel'}
          </button>

          {status !== 'completed' && (
            <button
              className="certify-button"
              onClick={handleRenew}
              disabled={status === 'processing'}
            >
              {status === 'processing' ? (
                <>
                  <span className="button-spinner"></span>
                  Renewing...
                </>
              ) : (
                'Renew Protection'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PoARenewalModal;
