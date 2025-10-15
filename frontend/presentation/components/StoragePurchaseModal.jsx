/**
 * Storage Purchase & Renewal Modal Component
 * UI for managing Walrus storage duration and renewal
 */

import React, { useState, useEffect } from 'react'
import { getCurrentConfig } from '../../blockchain/config.js'
import './StoragePurchaseModal.css'

export function StoragePurchaseModal({ isOpen, onClose, onSave, chunkMetadata, walrusConnected }) {
  const [epochs, setEpochs] = useState(50)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('idle') // idle, saving, completed, failed

  useEffect(() => {
    if (!isOpen) {
      setStatus('idle')
      setError(null)
    }
  }, [isOpen])

  // Calculate expiry estimate from epochs
  const calculateExpiryEstimate = (epochCount) => {
    const config = getCurrentConfig()
    const epochSeconds = config.walrus?.features?.epochSeconds || 60 * 60 * 24 * 2 // 2 days per epoch
    const totalSeconds = epochCount * epochSeconds
    const days = Math.ceil(totalSeconds / (60 * 60 * 24))
    return { days, seconds: totalSeconds }
  }

  // Format timestamp to readable date
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    try {
      return new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return 'N/A'
    }
  }

  // Validate and set epochs
  const handleEpochChange = (e) => {
    const value = parseInt(e.target.value)
    const config = getCurrentConfig()
    const maxEpochs = config.walrus?.features?.epochMax || 200
    const minEpochs = 1

    if (!isNaN(value) && value >= minEpochs && value <= maxEpochs) {
      setEpochs(value)
      setError(null)
    }
  }

  // Handle save preference
  const handleSavePreference = async () => {
    try {
      if (!walrusConnected) {
        setError('Walrus connection required to save preferences')
        return
      }

      if (epochs < 1) {
        setError('Epochs must be at least 1')
        return
      }

      setStatus('saving')
      setError(null)

      // Call parent handler
      if (onSave) {
        await onSave(epochs)
      }

      setStatus('completed')
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      console.error('[StoragePurchaseModal] Failed to save preference:', err)
      setStatus('failed')
      setError(err.message || 'Failed to save preference')
    }
  }

  if (!isOpen) {
    return null
  }

  const config = getCurrentConfig()
  const maxEpochs = config.walrus?.features?.epochMax || 200
  const expiryEstimate = calculateExpiryEstimate(epochs)
  const currentExpiryDate = chunkMetadata?.expiryTimestamp
    ? formatDate(chunkMetadata.expiryTimestamp)
    : null

  return (
    <div className="storage-purchase-modal-overlay" onClick={onClose}>
      <div className="storage-purchase-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>Manage Storage Duration</h2>
          <button
            className="close-button"
            onClick={onClose}
            disabled={status === 'saving'}
            aria-label="Close"
          >
            x
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Current Storage Info */}
          {chunkMetadata && (
            <div className="current-storage-section">
              <h3>Current Storage</h3>
              <div className="info-row">
                <span className="label">Epochs Purchased:</span>
                <span className="value">{chunkMetadata.epochsPurchased || 'N/A'}</span>
              </div>
              {currentExpiryDate && (
                <div className="info-row">
                  <span className="label">Expires:</span>
                  <span className="value">{currentExpiryDate}</span>
                </div>
              )}
              {chunkMetadata.renewalCount !== undefined && (
                <div className="info-row">
                  <span className="label">Renewal Count:</span>
                  <span className="value">{chunkMetadata.renewalCount}</span>
                </div>
              )}
            </div>
          )}

          {/* Epoch Selection */}
          <div className="epoch-selection-section">
            <label htmlFor="epoch-input">
              <span className="label-text">Select Storage Duration</span>
              <span className="label-hint">(1-{maxEpochs} epochs)</span>
            </label>
            <div className="epoch-input-group">
              <input
                id="epoch-input"
                type="number"
                min="1"
                max={maxEpochs}
                value={epochs}
                onChange={handleEpochChange}
                disabled={status === 'saving'}
                className="epoch-input"
              />
              <span className="epoch-unit">epochs</span>
            </div>
            <input
              type="range"
              min="1"
              max={maxEpochs}
              value={epochs}
              onChange={handleEpochChange}
              disabled={status === 'saving'}
              className="epoch-slider"
            />
          </div>

          {/* Expiry Preview */}
          <div className="expiry-preview-section">
            <div className="preview-row">
              <span className="label">Estimated Duration:</span>
              <span className="value">{expiryEstimate.days} days</span>
            </div>
            <div className="preview-note">
              Actual expiry date calculated based on current epoch time
            </div>
          </div>

          {/* Walrus Connection Status */}
          {!walrusConnected && (
            <div className="warning-section">
              <div className="warning-icon">!</div>
              <div className="warning-message">
                Walrus connection required to save preferences
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="error-section">
              <div className="error-icon">!</div>
              <div className="error-message">{error}</div>
            </div>
          )}

          {/* Progress */}
          {status === 'saving' && (
            <div className="progress-section">
              <div className="progress-indicator">
                <div className="spinner"></div>
                <span className="progress-text">Saving preference...</span>
              </div>
            </div>
          )}

          {/* Success */}
          {status === 'completed' && (
            <div className="success-section">
              <div className="success-icon">✓</div>
              <div className="success-message">Preference saved successfully!</div>
            </div>
          )}

          {/* Info */}
          {status === 'idle' && (
            <div className="info-section">
              <h3>Storage Duration</h3>
              <p>
                Select how long your spreadsheet data will be stored on Walrus. Your preference
                will be applied to all future saves.
              </p>
              <ul>
                <li>Longer duration = longer data retention</li>
                <li>Preferences persist per spreadsheet</li>
                <li>Can be changed anytime before expiry</li>
                <li>Consider renewal before expiry to maintain access</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="cancel-button"
            onClick={onClose}
            disabled={status === 'saving'}
          >
            {status === 'completed' ? 'Close' : 'Cancel'}
          </button>

          {status !== 'completed' && (
            <button
              className="save-preference-button"
              onClick={handleSavePreference}
              disabled={status === 'saving' || !walrusConnected}
            >
              {status === 'saving' ? (
                <>
                  <span className="button-spinner"></span>
                  Saving...
                </>
              ) : (
                'Save Preference'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default StoragePurchaseModal
