import React, { useState, useEffect } from 'react';
import { logger, LogComponent } from '../../utils/Logger.js';
import './SaveStatusBanner.css';

/**
 * SaveStatusBanner Component
 *
 * Displays notification when data is saved locally (fallback mode) due to network issues.
 * Provides "Retry Save" button to attempt blockchain sync when connection is restored.
 *
 * Listens to events:
 * - save:fallback - When fallback save occurs
 * - save:retry-success - When a retry succeeds
 * - save:retry-failed - When a retry fails
 * - save:startup-retry-complete - When auto-retry on startup completes
 */
export function SaveStatusBanner() {
  const [fallbackSaves, setFallbackSaves] = useState([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState('');
  const [retryResults, setRetryResults] = useState({});

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

    const handleRetrySuccess = (event) => {
      const { localKey } = event.detail || {};
      if (!localKey) return;

      logger.info(LogComponent.UI_COMPONENT, 'retry_success_event', 'Retry success event received', { localKey });

      // Mark this save as successfully synced
      setRetryResults(prev => ({
        ...prev,
        [localKey]: 'success'
      }));

      // Remove from fallback saves list
      setFallbackSaves(prev => prev.filter(save => save.localKey !== localKey));

      // Show brief success message
      setRetryMessage(`✅ Save synced to blockchain`);

      // Clear message after 2 seconds
      setTimeout(() => {
        setRetryMessage('');
      }, 2000);
    };

    const handleRetryFailed = (event) => {
      const { localKey, error } = event.detail || {};
      if (!localKey) return;

      logger.warn(LogComponent.UI_COMPONENT, 'retry_failed_event', 'Retry failed event received', {
        localKey,
        error
      });

      // Mark this save as failed retry
      setRetryResults(prev => ({
        ...prev,
        [localKey]: 'failed'
      }));

      // Show error message
      setRetryMessage(`⏳ Retry attempt failed: ${error || 'Unknown error'}. Will retry next time.`);

      // Keep the message visible longer for errors
      setTimeout(() => {
        setRetryMessage('');
      }, 5000);
    };

    const handleStartupRetryComplete = (event) => {
      const { successCount, failureCount, total } = event.detail || {};

      logger.info(LogComponent.UI_COMPONENT, 'startup_retry_complete', 'Startup auto-retry complete', {
        successCount,
        failureCount,
        total
      });

      if (successCount > 0) {
        setRetryMessage(`✅ ${successCount} of ${total} saves synced during startup`);
      }

      if (failureCount > 0) {
        setRetryMessage(prev =>
          prev ? `${prev}; ${failureCount} still pending` : `⏳ ${failureCount} saves still pending`
        );
      }

      // Clear message after 4 seconds
      setTimeout(() => {
        setRetryMessage('');
      }, 4000);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('save:fallback', handleFallbackSave);
      window.addEventListener('save:retry-success', handleRetrySuccess);
      window.addEventListener('save:retry-failed', handleRetryFailed);
      window.addEventListener('save:startup-retry-complete', handleStartupRetryComplete);

      return () => {
        window.removeEventListener('save:fallback', handleFallbackSave);
        window.removeEventListener('save:retry-success', handleRetrySuccess);
        window.removeEventListener('save:retry-failed', handleRetryFailed);
        window.removeEventListener('save:startup-retry-complete', handleStartupRetryComplete);
      };
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
