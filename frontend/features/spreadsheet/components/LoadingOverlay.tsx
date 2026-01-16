import React, { useState, useEffect } from 'react';
import './LoadingOverlay.css';

export function LoadingOverlay({
  isVisible,
  message,
  details,
  onCancel,
  progress,
  steps,
  currentStep,
  type = 'default', // default, blockchain, wallet, storage, warning, error
  showProgress = false,
  autoProgress = false,
  error = null,
  errorType = null
}) {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    if (isVisible && autoProgress && !progress) {
      // Simulate progress for operations without explicit progress
      const interval = setInterval(() => {
        setAnimatedProgress(prev => {
          if (prev >= 90) return prev; // Don't reach 100% automatically
          return prev + Math.random() * 15;
        });
      }, 500);

      return () => clearInterval(interval);
    }
  }, [isVisible, autoProgress, progress]);

  useEffect(() => {
    if (progress !== undefined) {
      setAnimatedProgress(progress);
    }
  }, [progress]);

  if (!isVisible) return null;

  const getSpinnerIcon = () => {
    // Show error states first
    if (error || type === 'error') {
      return 'X';
    }
    if (type === 'warning') {
      return '!';
    }

    switch (type) {
      case 'blockchain':
        return 'B';
      case 'wallet':
        return 'W';
      case 'storage':
        return 'S';
      case 'network':
        return 'N';
      default:
        return '';
    }
  };

  const getTypeColor = () => {
    // Error states take precedence
    if (error || type === 'error') {
      return '#F44336';
    }
    if (type === 'warning') {
      return '#FF9800';
    }

    switch (type) {
      case 'blockchain':
        return '#4CAF50';
      case 'wallet':
        return '#FF9800';
      case 'storage':
        return '#2196F3';
      case 'network':
        return '#9C27B0';
      default:
        return '#607D8B';
    }
  };

  const handleBackdropClick = (event) => {
    if (event.target.classList.contains('loading-overlay') && !onCancel) {
      event.stopPropagation();
    }
  };

  return (
    <div className="loading-overlay" onMouseDown={handleBackdropClick}>
      <div className="loading-backdrop" onClick={onCancel} />
      <div className="loading-card" style={{ '--type-color': getTypeColor() }}>
        <div className="loading-content">
          <div className="loading-spinner">
            <div className="spinner-icon" style={{ color: getTypeColor() }}>
              {getSpinnerIcon()}
            </div>
            <div className="spinner" style={{ borderColor: getTypeColor() }}></div>
          </div>

          <div className="loading-text">
            <h3 className="loading-message">
              {error ? 'Error' : message || 'Loading...'}
            </h3>
            {error && <p className="loading-error" style={{ color: getTypeColor() }}>{error}</p>}
            {details && !error && <p className="loading-details">{details}</p>}
          </div>

          {onCancel && (
            <button
              className="loading-cancel-button"
              onClick={onCancel}
              title="Cancel operation"
            >
              x
            </button>
          )}
        </div>

        {/* Step Progress */}
        {steps && steps.length > 0 && (
          <div className="loading-steps">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`step-item ${index < (currentStep || 0) ? 'completed' : index === (currentStep || 0) ? 'active' : 'pending'}`}
              >
                <div className="step-icon">
                  {index + 1}
                </div>
                <div className="step-text">{step}</div>
              </div>
            ))}
          </div>
        )}

        {/* Progress Bar */}
        {showProgress && (
          <div className="loading-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${animatedProgress}%`,
                  backgroundColor: getTypeColor()
                }}
              ></div>
            </div>
            <div className="progress-text">
              {Math.round(animatedProgress)}%
            </div>
          </div>
        )}

        {/* Type-specific messages */}
        <div className="loading-type-info">
          {error && errorType === 'wallet_required' && (
            <div className="type-info error-info">
              <small>Connect your wallet to access blockchain features and save data securely</small>
            </div>
          )}
          {error && errorType === 'save_failed' && (
            <div className="type-info error-info">
              <small>Save failed: {details || error || 'Unknown error'}. Your changes are saved locally - try again or check your wallet/network connection.</small>
            </div>
          )}
          {error && errorType === 'first_save_failed' && (
            <div className="type-info error-info">
              <div style={{ marginBottom: '8px' }}>
                <strong>First save failed:</strong> {error}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>
                <strong>Recovery steps:</strong>
                <ol style={{ margin: '4px 0', paddingLeft: '20px', textAlign: 'left' }}>
                  {error.includes('Wallet') && <li>Reconnect your Sui wallet</li>}
                  {error.includes('Walrus') && <li>Check network connection</li>}
                  {error.includes('configuration') && <li>Refresh the page</li>}
                  {!error.includes('Wallet') && !error.includes('Walrus') && !error.includes('configuration') && (
                    <li>Check console for error details</li>
                  )}
                  <li>Click "Save" again to retry</li>
                </ol>
              </div>
            </div>
          )}
          {error && errorType === 'walrus_unavailable' && (
            <div className="type-info error-info">
              <small>Walrus storage is temporarily unavailable. Check your network connection and try again in a few moments.</small>
            </div>
          )}
          {error && errorType === 'error' && errorType !== 'wallet_required' && errorType !== 'save_failed' && errorType !== 'first_save_failed' && errorType !== 'walrus_unavailable' && (
            <div className="type-info error-info">
              <small>An unexpected error occurred. Please try again.</small>
            </div>
          )}
          {type === 'warning' && !error && (
            <div className="type-info warning-info">
              <small>{details || 'Please review the warning message above'}</small>
            </div>
          )}
          {!error && type === 'blockchain' && (
            <div className="type-info">
              <small>This operation requires blockchain confirmation and may take 10-30 seconds</small>
            </div>
          )}
          {!error && type === 'wallet' && (
            <div className="type-info">
              <small>Please approve the transaction in your wallet</small>
            </div>
          )}
          {!error && type === 'storage' && (
            <div className="type-info">
              <small>Uploading data to decentralized storage...</small>
            </div>
          )}
          {!error && type === 'network' && (
            <div className="type-info">
              <small>Connecting to blockchain network...</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
