/**
 * Progressive Enhancement Service for WalSheetz
 * Provides graceful degradation when blockchain services are unavailable
 */

import { logger, LogComponent, ErrorCategory } from "@/sdk/shared/utils/Logger.js";

class ProgressiveEnhancementService {
  constructor() {
    this.serviceStatus = {
      blockchain: true,
      walrus: true,
      collaboration: true,
      lastCheck: Date.now(),
      degradationLevel: 0, // 0 = full functionality, 1 = partial, 2 = offline-only
      fallbackMode: false
    };

    this.healthCheckInterval = null;
    this.startHealthMonitoring();

    logger.info(LogComponent.PERFORMANCE, 'progressive_enhancement_init', 'Progressive Enhancement Service initialized');
  }

  // Start monitoring service health
  startHealthMonitoring() {
    // Check every 2 minutes (reduced frequency)
    this.healthCheckInterval = setInterval(() => {
      this.checkServicesHealth();
    }, 120000);

    // Initial check
    this.checkServicesHealth();
  }

  // Stop monitoring
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // Check the health of all services
  async checkServicesHealth() {
    const health = {
      blockchain: await this.checkBlockchainHealth(),
      walrus: await this.checkWalrusHealth(),
      collaboration: await this.checkCollaborationHealth(),
      timestamp: Date.now()
    };

    const previousStatus = { ...this.serviceStatus };
    this.serviceStatus = {
      ...health,
      lastCheck: Date.now(),
      degradationLevel: this.calculateDegradationLevel(health),
      fallbackMode: this.shouldEnterFallbackMode(health)
    };

    // Log status changes
    if (JSON.stringify(previousStatus) !== JSON.stringify(this.serviceStatus)) {
      logger.info(LogComponent.PERFORMANCE, 'service_health_changed', 'Service health status changed', {
        previous: previousStatus,
        current: this.serviceStatus,
        timestamp: Date.now()
      });

      // Emit event for UI updates
      this.emitHealthChangeEvent(this.serviceStatus);
    }

    return this.serviceStatus;
  }

  // Check blockchain service health
  async checkBlockchainHealth() {
    try {
      // Try to make a simple RPC call to test connectivity
      const response = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getLatestCheckpointSequenceNumber',
          params: []
        }),
        signal: AbortSignal.timeout(5000)
      });

      return response.ok;
    } catch (error) {
      logger.debug(LogComponent.PERFORMANCE, 'blockchain_health_check_failed', 'Blockchain health check failed', {
        error: error.message
      });
      return false;
    }
  }

  // Check Walrus service health
  async checkWalrusHealth() {
    try {
      const response = await fetch('https://publisher.walrus-testnet.walrus.space/v1/api', {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      logger.debug(LogComponent.STORAGE_SERVICE, 'walrus_health_check_failed', 'Walrus health check failed', {
        error: error.message
      });
      return false;
    }
  }

  // Check collaboration service health
  async checkCollaborationHealth() {
    // For now, assume collaboration works if blockchain works
    return this.serviceStatus?.blockchain || true;
  }

  // Calculate degradation level based on service availability
  calculateDegradationLevel(health) {
    const { blockchain, walrus, collaboration } = health;

    if (blockchain && walrus && collaboration) {
      return 0; // Full functionality
    } else if (blockchain && walrus) {
      return 1; // Partial (no collaboration)
    } else if (blockchain) {
      return 2; // Limited (blockchain only)
    } else {
      return 3; // Offline mode
    }
  }

  // Determine if we should enter fallback mode
  shouldEnterFallbackMode(health) {
    const degradationLevel = this.calculateDegradationLevel(health);
    return degradationLevel >= 2; // Enter fallback at level 2 or higher
  }

  // Get current service status
  getServiceStatus() {
    return { ...this.serviceStatus };
  }

  // Get degradation level description
  getDegradationDescription() {
    const descriptions = {
      0: 'Full functionality - All services operational',
      1: 'Partial functionality - Collaboration disabled, basic operations available',
      2: 'Limited functionality - Blockchain only, local storage fallback',
      3: 'Offline mode - Local storage only, sync when services available'
    };

    return descriptions[this.serviceStatus.degradationLevel] || 'Unknown status';
  }

  // Get available features based on current status
  getAvailableFeatures() {
    const features = {
      createSpreadsheet: false,
      saveToBlockchain: false,
      loadFromBlockchain: false,
      collaboration: false,
      versionHistory: false,
      localStorage: true,
      offlineMode: true
    };

    const { blockchain, walrus, collaboration: collab } = this.serviceStatus;

    if (blockchain) {
      features.createSpreadsheet = true;
      features.loadFromBlockchain = true;
      features.versionHistory = true;
    }

    if (blockchain && walrus) {
      features.saveToBlockchain = true;
    }

    if (collab && blockchain) {
      features.collaboration = true;
    }

    return features;
  }

  // Get user-friendly status message
  getStatusMessage() {
    const messages = {
      0: '✅ All services operational',
      1: '⚠️ Collaboration disabled - Core features available',
      2: '🔶 Limited mode - Blockchain only',
      3: '🔴 Offline mode - Working locally'
    };

    return messages[this.serviceStatus.degradationLevel] || '⚪ Status unknown';
  }

  // Check if operation is supported in current mode
  isOperationSupported(operation) {
    const features = this.getAvailableFeatures();

    switch (operation) {
      case 'create_spreadsheet':
        return features.createSpreadsheet;
      case 'save_blockchain':
        return features.saveToBlockchain;
      case 'load_blockchain':
        return features.loadFromBlockchain;
      case 'collaboration':
        return features.collaboration;
      case 'version_history':
        return features.versionHistory;
      case 'local_save':
        return features.localStorage;
      default:
        return true;
    }
  }

  // Get fallback message for unsupported operations
  getFallbackMessage(operation) {
    const messages = {
      create_spreadsheet: 'Cannot create blockchain spreadsheet. Working in local mode.',
      save_blockchain: 'Cannot save to blockchain. Changes saved locally and will sync when services are available.',
      load_blockchain: 'Cannot load from blockchain. Using local data.',
      collaboration: 'Collaboration features unavailable. Working in single-user mode.',
      version_history: 'Version history unavailable. Using local version control.'
    };

    return messages[operation] || 'Feature temporarily unavailable';
  }

  // Execute operation with progressive enhancement
  async executeWithFallback(operation, primaryFn, fallbackFn, context = {}) {
    const isSupported = this.isOperationSupported(operation);

    if (isSupported) {
      try {
        logger.debug(LogComponent.PERFORMANCE, 'operation_with_fallback', 'Attempting primary operation', {
          operation,
          ...context
        });

        const result = await primaryFn();

        if (result.success) {
          return result;
        } else {
          throw new Error(result.error || 'Operation failed');
        }
      } catch (error) {
        logger.warn(LogComponent.PERFORMANCE, 'primary_operation_failed', 'Primary operation failed, attempting fallback', {
          operation,
          error: error.message,
          ...context
        });

        // Fall back to secondary function
        if (fallbackFn) {
          try {
            const fallbackResult = await fallbackFn();
            return {
              ...fallbackResult,
              fallback: true,
              fallbackReason: error.message
            };
          } catch (fallbackError) {
            logger.error(LogComponent.PERFORMANCE, 'fallback_operation_failed', 'Both primary and fallback operations failed', {
              operation,
              primaryError: error.message,
              fallbackError: fallbackError.message,
              ...context
            });

            return {
              success: false,
              error: fallbackError.message,
              fallback: true,
              primaryError: error.message
            };
          }
        } else {
          return {
            success: false,
            error: error.message,
            fallback: false
          };
        }
      }
    } else {
      // Operation not supported, use fallback immediately
      logger.info(LogComponent.PERFORMANCE, 'operation_not_supported', 'Operation not supported in current mode', {
        operation,
        degradationLevel: this.serviceStatus.degradationLevel,
        ...context
      });

      if (fallbackFn) {
        try {
          const fallbackResult = await fallbackFn();
          return {
            ...fallbackResult,
            fallback: true,
            reason: 'Service degradation'
          };
        } catch (fallbackError) {
          return {
            success: false,
            error: fallbackError.message,
            fallback: true,
            reason: 'Service degradation'
          };
        }
      } else {
        return {
          success: false,
          error: this.getFallbackMessage(operation),
          fallback: true,
          reason: 'Service degradation'
        };
      }
    }
  }

  // Emit health change event for UI updates
  emitHealthChangeEvent(status) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('service-health-change', {
        detail: { status, timestamp: Date.now() }
      }));
    }
  }

  // Force a health check
  async forceHealthCheck() {
    return await this.checkServicesHealth();
  }

  // Enable/disable fallback mode manually
  setFallbackMode(enabled) {
    this.serviceStatus.fallbackMode = enabled;
    logger.info(LogComponent.PERFORMANCE, 'fallback_mode_changed', 'Fallback mode changed', {
      enabled,
      degradationLevel: this.serviceStatus.degradationLevel
    });

    this.emitHealthChangeEvent(this.serviceStatus);
  }

  // Get recovery time estimate (placeholder)
  getRecoveryEstimate() {
    // In a real implementation, this could check service uptime stats
    const estimates = {
      0: 'All services operational',
      1: 'Collaboration may be restored within minutes',
      2: 'Full functionality expected within 30 minutes',
      3: 'Services expected to be restored within 1 hour'
    };

    return estimates[this.serviceStatus.degradationLevel] || 'Recovery time unknown';
  }

  // Cleanup
  destroy() {
    this.stopHealthMonitoring();
    logger.info(LogComponent.PERFORMANCE, 'progressive_enhancement_destroyed', 'Progressive Enhancement Service destroyed');
  }
}

// Create singleton instance
export const progressiveEnhancementService = new ProgressiveEnhancementService();

// Global access for debugging
if (typeof window !== 'undefined') {
  window.walSheetzProgressiveEnhancement = progressiveEnhancementService;
}

export default progressiveEnhancementService;