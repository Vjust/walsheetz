/**
 * PoA Certification Modal Component
 * UI for initiating and tracking PoA certificate requests for Walrus blobs
 */

import React, { useState, useEffect } from 'react';
import { poaCertificationService } from '../../services/PoACertificationService.js';
import { EventBus } from '../../utils/EventBus.js';
import './PoACertificationModal.css';

export function PoACertificationModal({ blobId, isOpen, onClose, onSuccess, onError }) {
  const [status, setStatus] = useState('idle'); // idle, estimating, processing, completed, failed
  const [durationDays, setDurationDays] = useState(30);
  const [estimatedCost, setEstimatedCost] = useState(null);
  const [error, setError] = useState(null);
  const [transactionDigest, setTransactionDigest] = useState(null);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setStatus('idle');
      setError(null);
      setTransactionDigest(null);
      setProgress(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !blobId) return;

    // Estimate gas cost
    estimateGasCost();

    // Subscribe to events
    const handleCompleted = (data) => {
      if (data.blobId === blobId) {
        setStatus('completed');
        setTransactionDigest(data.transactionDigest);
        setProgress('Certification transaction confirmed');

        if (onSuccess) {
          onSuccess(data);
        }
      }
    };

    const handleFailed = (data) => {
      if (data.blobId === blobId) {
        setStatus('failed');
        setError(data.error || 'Certification failed');
        setProgress(null);

        if (onError) {
          onError(data);
        }
      }
    };

    const handleConfirmed = (data) => {
      if (data.blobId === blobId) {
        setProgress('Data saved successfully on blockchain');
      }
    };

    EventBus.on('poa:certification:completed', handleCompleted);
    EventBus.on('poa:certification:failed', handleFailed);
    EventBus.on('poa:certification:confirmed', handleConfirmed);

    return () => {
      EventBus.off('poa:certification:completed', handleCompleted);
      EventBus.off('poa:certification:failed', handleFailed);
      EventBus.on('poa:certification:confirmed', handleConfirmed);
    };
  }, [isOpen, blobId, onSuccess, onError]);

  const estimateGasCost = async () => {
    try {
      setStatus('estimating');
      setProgress('Estimating transaction cost...');

      // Simple estimation: ~0.01 SUI for certification transaction
      // In production, this would call the Sui client to get actual gas estimate
      const estimatedSUI = 0.01;
      const estimatedCostUSD = estimatedSUI * 0.50; // Assume $0.50 per SUI

      setEstimatedCost({
        sui: estimatedSUI,
        usd: estimatedCostUSD
      });

      setStatus('idle');
      setProgress(null);
    } catch (error) {
      console.error('[PoACertificationModal] Failed to estimate cost:', error);
      setStatus('idle');
      setProgress(null);
    }
  };

  const handleCertify = async () => {
    try {
      setStatus('processing');
      setError(null);
      setProgress('Requesting wallet approval...');

      const result = await poaCertificationService.requestCertification(blobId, {
        durationDays
      });

      if (result.success) {
        setProgress('Transaction submitted, confirming...');
        // Status updates will come via events
      } else {
        setStatus('failed');
        setError(result.error || 'Failed to save to blockchain');
        setProgress(null);

        if (onError) {
          onError(result);
        }
      }
    } catch (error) {
      console.error('[PoACertificationModal] Certification error:', error);
      setStatus('failed');
      setError(error.message || 'Failed to save to blockchain');
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
          <h2>Save to Blockchain</h2>
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

          {/* Duration Selection */}
          <div className="duration-section">
            <label htmlFor="duration-input">
              <span className="label-text">Storage Duration</span>
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
              <div className="success-message">Saved to blockchain successfully!</div>
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
                Your data is now stored on the blockchain
              </div>
            </div>
          )}

          {/* Info */}
          {status === 'idle' && (
            <div className="info-section">
              <h3>What does Save to Blockchain do?</h3>
              <p>
                Saving to blockchain guarantees that your data will be kept safe and available
                for the duration you choose. Without this, your data may be automatically deleted.
              </p>
              <ul>
                <li>Keeps your data safe and accessible</li>
                <li>Prevents automatic deletion</li>
                <li>Creates a blockchain record for your chosen duration</li>
                <li>Can be extended before it expires</li>
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
              onClick={handleCertify}
              disabled={status === 'processing' || status === 'estimating'}
            >
              {status === 'processing' ? (
                <>
                  <span className="button-spinner"></span>
                  Saving...
                </>
              ) : (
                'Save to Blockchain'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PoACertificationModal;
