import React, { useState, useEffect } from 'react';
import { EventBus } from '../../utils/EventBus.js';
import { logger, LogComponent } from '../../utils/Logger.js';
import styles from './WalrusHealthCheckModal.css';

/**
 * Walrus Health Check Modal
 *
 * Displays when Walrus testnet is unhealthy and offers mainnet failover.
 * Allows user to switch network and retry save operation.
 */
export function WalrusHealthCheckModal({ onClose, onRetry, onNetworkSwitch }) {
  const [isOpen, setIsOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [networkSwitching, setNetworkSwitching] = useState(false);
  const [currentNetwork, setCurrentNetwork] = useState('testnet');

  useEffect(() => {
    // Listen for health check events
    const handleHealthChange = (event) => {
      const { detail } = event;

      logger.debug(LogComponent.UI_COMPONENT, 'health_check_event', 'Walrus health status changed', {
        status: detail.status
      });

      // If health is degraded, show modal
      if (detail.status && detail.status.degradationLevel >= 2) {
        setHealthStatus(detail.status);
        setIsOpen(true);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('walrus-health-change', handleHealthChange);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('walrus-health-change', handleHealthChange);
      }
    };
  }, []);

  const handleSwitchToMainnet = async () => {
    try {
      setNetworkSwitching(true);
      logger.info(LogComponent.UI_COMPONENT, 'network_switch_start', 'Switching to mainnet...');

      // Emit network switch event
      EventBus.emit('network:switch', {
        fromNetwork: currentNetwork,
        toNetwork: 'mainnet',
        reason: 'Walrus testnet degradation'
      });

      // Call the onNetworkSwitch callback if provided
      if (onNetworkSwitch) {
        await onNetworkSwitch('mainnet');
      }

      // Update current network display
      setCurrentNetwork('mainnet');

      logger.info(LogComponent.UI_COMPONENT, 'network_switch_complete', 'Switched to mainnet successfully');

      // Wait a moment for network to stabilize, then retry
      setTimeout(() => {
        handleRetry();
      }, 1000);
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'network_switch_error', 'Failed to switch to mainnet', {
        error: error.message
      });
      alert('Failed to switch to mainnet. Please try again.');
    } finally {
      setNetworkSwitching(false);
    }
  };

  const handleRetry = async () => {
    try {
      setIsRetrying(true);
      logger.info(LogComponent.UI_COMPONENT, 'retry_save_start', 'Retrying save on mainnet...');

      if (onRetry) {
        await onRetry();
      }

      setIsOpen(false);
      logger.info(LogComponent.UI_COMPONENT, 'retry_save_success', 'Save retry succeeded');
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'retry_save_error', 'Save retry failed', {
        error: error.message
      });
      alert('Save retry failed. Please check your connection and try again.');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDismiss = () => {
    logger.warn(LogComponent.UI_COMPONENT, 'health_check_dismissed', 'User dismissed Walrus health warning');
    setIsOpen(false);
    if (onClose) {
      onClose();
    }
  };

  if (!isOpen || !healthStatus) {
    return null;
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>⚠️ Walrus Service Issue</h2>
          <button className={styles.closeButton} onClick={handleDismiss}>×</button>
        </div>

        <div className={styles.content}>
          <p className={styles.message}>
            Walrus {currentNetwork} network is experiencing degraded service.
            Your unsaved work is in memory only and will be lost on page refresh.
          </p>

          <div className={styles.status}>
            <h3>Network Status</h3>
            <div className={styles.statusItem}>
              <span>Current Network:</span>
              <span className={styles.badge}>{currentNetwork}</span>
            </div>
            <div className={styles.statusItem}>
              <span>Degradation Level:</span>
              <span className={styles.badge}>{healthStatus.degradationLevel}</span>
            </div>
            {healthStatus.consecutiveFailures && (
              <div className={styles.statusItem}>
                <span>Consecutive Failures:</span>
                <span className={styles.badge}>{healthStatus.consecutiveFailures}</span>
              </div>
            )}
          </div>

          <div className={styles.recommendation}>
            <h3>Recommended Action</h3>
            <p>
              Switch to <strong>mainnet</strong> to continue saving your work securely.
              Mainnet provides stable access to Walrus storage and the Sui blockchain.
            </p>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={handleSwitchToMainnet}
            disabled={networkSwitching || isRetrying}
          >
            {networkSwitching ? '🔄 Switching to Mainnet...' : '🚀 Switch to Mainnet & Save'}
          </button>

          <button
            className={styles.secondaryButton}
            onClick={handleDismiss}
            disabled={networkSwitching || isRetrying}
          >
            Dismiss (Data will be lost on refresh)
          </button>
        </div>

        <div className={styles.footer}>
          <p className={styles.warning}>
            ⚠️ <strong>WARNING:</strong> Your changes are stored in RAM only.
            Click "Switch to Mainnet & Save" to persist your work.
          </p>
        </div>
      </div>
    </div>
  );
}

export default WalrusHealthCheckModal;
