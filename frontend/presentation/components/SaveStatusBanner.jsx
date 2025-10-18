import React, { useState, useEffect } from 'react';
import { logger, LogComponent } from '../../utils/Logger.js';
import './SaveStatusBanner.css';

/**
 * SaveStatusBanner Component
 *
 * Displays notification when data is saved locally (fallback mode) due to network issues.
 * Provides "Retry Save" button to attempt blockchain sync when connection is restored.
 */
export function SaveStatusBanner() {
  const [fallbackSaves, setFallbackSaves] = useState([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState('');

  useEffect(() => {
    const handleFallbackSave = (event) => {
      const detail = event.detail || {};
      logger.info(LogComponent.UI_COMPONENT, 'fallback_notification', 'Displaying fallback save notification', {
        message: detail.message,
        localKey: detail.localKey
      });

      setFallbackSaves(prev => {
        // Avoid duplicates
        const isDuplicate = prev.some(save => save.localKey === detail.localKey);
        if (isDuplicate) return prev;

        return [...prev, {
          id: detail.localKey || `fallback-${Date.now()}`,
          localKey: detail.localKey,
          message: detail.message || 'Network disconnected - saved locally',
          warning: detail.warning || 'Data will sync to blockchain when connection is restored',
          timestamp: detail.timestamp || Date.now()
        }];
      });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('save:fallback', handleFallbackSave);
      return () => window.removeEventListener('save:fallback', handleFallbackSave);
    }
  }, []);

  const handleRetryAllSaves = async () => {
    try {
      setIsRetrying(true);
      setRetryMessage('Attempting to sync saves to blockchain...');

      logger.info(LogComponent.UI_COMPONENT, 'retry_fallback_saves', `Retrying ${fallbackSaves.length} fallback save(s)...`);

      // Find all fallback keys in localStorage
      const fallbackKeys = Object.keys(localStorage).filter(key =>
        key.startsWith('walsheetz_fallback_')
      );

      if (fallbackKeys.length === 0) {
        logger.info(LogComponent.UI_COMPONENT, 'no_fallback_saves', 'No fallback saves found to retry');
        setFallbackSaves([]);
        setRetryMessage('');
        return;
      }

      // Trigger retry event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('save:retry-fallbacks', {
          detail: {
            fallbackKeys: fallbackKeys,
            count: fallbackKeys.length
          }
        }));
      }

      // Wait a moment for saves to process
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if saves were cleared (retry succeeded)
      const remainingKeys = Object.keys(localStorage).filter(key =>
        key.startsWith('walsheetz_fallback_')
      );

      if (remainingKeys.length === 0) {
        setRetryMessage('✅ All saves synced to blockchain successfully!');
        logger.info(LogComponent.UI_COMPONENT, 'retry_success', 'All fallback saves synced successfully');

        // Auto-clear banner after 3 seconds
        setTimeout(() => {
          setFallbackSaves([]);
          setRetryMessage('');
        }, 3000);
      } else {
        setRetryMessage(`⏳ Still syncing... (${remainingKeys.length} pending)`);
        logger.info(LogComponent.UI_COMPONENT, 'retry_partial', 'Some saves still pending', {
          remaining: remainingKeys.length
        });
      }
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'retry_error', 'Error retrying fallback saves', {
        error: error.message
      });
      setRetryMessage('❌ Retry failed - please try again');
    } finally {
      setIsRetrying(false);
      // Clear message after 5 seconds if there's an error
      setTimeout(() => setRetryMessage(''), 5000);
    }
  };

  const handleDismiss = (id) => {
    setFallbackSaves(prev => prev.filter(save => save.id !== id));
  };

  const handleDismissAll = () => {
    setFallbackSaves([]);
    setRetryMessage('');
  };

  if (fallbackSaves.length === 0) {
    return null;
  }

  const firstSave = fallbackSaves[0];

  return (
    <div className="save-status-banner-container">
      <div className="save-status-banner warning">
        <div className="banner-content">
          <div className="banner-message">
            <span className="banner-icon">⚠️</span>
            <div className="message-text">
              <div className="main-message">
                {firstSave.message}
              </div>
              {fallbackSaves.length > 1 && (
                <div className="count-info">
                  +{fallbackSaves.length - 1} more unsaved change{fallbackSaves.length > 2 ? 's' : ''}
                </div>
              )}
              <div className="warning-text">
                {firstSave.warning}
              </div>
            </div>
          </div>

          <div className="banner-actions">
            <button
              className="retry-button"
              onClick={handleRetryAllSaves}
              disabled={isRetrying}
              title="Attempt to sync locally-saved data to blockchain"
            >
              {isRetrying ? '🔄 Retrying...' : '🚀 Retry Save'}
            </button>
            <button
              className="dismiss-button"
              onClick={handleDismissAll}
              disabled={isRetrying}
              title="Dismiss this notification"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>

        {retryMessage && (
          <div className="retry-status-message">
            {retryMessage}
          </div>
        )}
      </div>
    </div>
  );
}

export default SaveStatusBanner;
