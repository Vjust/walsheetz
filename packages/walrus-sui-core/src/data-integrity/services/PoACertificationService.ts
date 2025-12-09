/**
 * PoA Certification Service
 * Handles Proof of Availability certificate requests and status tracking for Walrus blobs
 */

import { eventBus, logger, LogComponent } from "@dreamlit/walrus";

class PoACertificationService {
  private certificationRequests: Map<string, any>;
  private pollingIntervals: Map<string, NodeJS.Timeout>;
  private defaultPollInterval: number;
  private maxPollAttempts: number;
  private certificationHistory: Map<string, any[]>;

  constructor() {
    this.certificationRequests = new Map(); // blobId -> request status
    this.pollingIntervals = new Map(); // blobId -> interval ID
    this.defaultPollInterval = 5000; // 5 seconds
    this.maxPollAttempts = 60; // 5 minutes max polling
    this.certificationHistory = new Map(); // blobId -> history array

    // Initialize empty history (RAM-only)
    this.certificationHistory.clear();

    logger.info(LogComponent.UI, 'poa_service_init', 'PoACertificationService initialized');
  }

  /**
   * Request PoA certification for a blob
   * @param {string} blobId - Blob ID to certify
   * @param {Object} options - Certification options
   * @returns {Promise<Object>} Request result
   */
  async requestCertification(blobId: string, options: Record<string, any> = {}) {
    try {
      logger.info(LogComponent.UI, 'poa_request_cert', 'Requesting PoA certification', {
        blobId,
        durationDays: options.durationDays || 30
      });

      // Check if already certifying
      if (this.certificationRequests.has(blobId)) {
        const existing = this.certificationRequests.get(blobId);
        if (existing.status === 'pending' || existing.status === 'processing') {
          logger.warn(LogComponent.UI, 'poa_already_pending', 'Certification already in progress', {
            blobId
          });
          return {
            success: false,
            error: 'Certification already in progress for this blob',
            status: existing.status
          };
        }
      }

      // Set request status to pending IMMEDIATELY to prevent duplicates
      this.certificationRequests.set(blobId, {
        blobId,
        status: 'pending',
        startTime: Date.now(),
        options
      });

      // Import browser sui service dynamically
      const { browserSuiService } = await import("../../blockchain-integration/services/BrowserSuiService.js");

      // Emit event
      eventBus.emit('poa:certification:requested', {
        blobId,
        timestamp: Date.now(),
        options
      });

      // Update request status to processing
      this.certificationRequests.set(blobId, {
        ...this.certificationRequests.get(blobId),
        status: 'processing'
      });

      // Request certification via Sui service
      const result = await browserSuiService.certifyBlob(blobId, options);

      if (result.success) {
        // Update request status to completed
        this.certificationRequests.set(blobId, {
          ...this.certificationRequests.get(blobId),
          status: 'completed',
          transactionDigest: result.transactionDigest,
          completedTime: Date.now()
        });

        // Add to history
        this.addToHistory(blobId, {
          action: 'certified',
          timestamp: Date.now(),
          transactionDigest: result.transactionDigest,
          durationDays: result.durationDays
        });

        // Emit success event
        eventBus.emit('poa:certification:completed', {
          blobId,
          transactionDigest: result.transactionDigest,
          timestamp: Date.now()
        });

        logger.info(LogComponent.UI, 'poa_cert_success', 'Certification completed', {
          blobId,
          transactionDigest: result.transactionDigest
        });

        // Start polling to verify certification status
        this.startStatusPolling(blobId);

        return {
          success: true,
          blobId,
          transactionDigest: result.transactionDigest,
          status: 'completed'
        };
      } else {
        // Update request status to failed
        this.certificationRequests.set(blobId, {
          ...this.certificationRequests.get(blobId),
          status: 'failed',
          error: result.error,
          failedTime: Date.now()
        });

        // Emit error event
        eventBus.emit('poa:certification:failed', {
          blobId,
          error: result.error,
          timestamp: Date.now()
        });

        logger.error(LogComponent.UI, 'poa_cert_failed', 'Certification failed', {
          blobId,
          error: result.error
        });

        return {
          success: false,
          blobId,
          error: result.error,
          status: 'failed'
        };
      }

    } catch (error) {
      const err = error as Error;
      logger.error(LogComponent.UI, 'poa_request_error', 'Failed to request certification', {
        blobId,
        error: err.message
      });

      // Update request status
      if (this.certificationRequests.has(blobId)) {
        this.certificationRequests.set(blobId, {
          ...this.certificationRequests.get(blobId),
          status: 'failed',
          error: err.message
        });
      }

      // Emit error event
      eventBus.emit('poa:certification:failed', {
        blobId,
        error: err.message,
        timestamp: Date.now()
      });

      return {
        success: false,
        blobId,
        error: err.message,
        status: 'failed'
      };
    }
  }

  /**
   * Check certification status for a blob
   * @param {string} blobId - Blob ID to check
   * @returns {Promise<Object>} Status result
   */
  async checkCertificationStatus(blobId: string) {
    try {
      logger.debug(LogComponent.UI, 'poa_check_status', 'Checking certification status', {
        blobId
      });

      // Import browser walrus service dynamically
      const { browserWalrusService } = await import("@dreamlit/walrus");

      // Get PoA certificate status
      const result = await browserWalrusService.getPoACertificate(blobId);

      if (result.success) {
        const certResult = result as any;
        const status = {
          blobId,
          certified: certResult.poaStatus === 'certified',
          poaStatus: certResult.poaStatus,
          certificate: certResult.certificate,
          checkedAt: Date.now(),
          success: true
        };

        // Emit status update event
        eventBus.emit('poa:status:updated', status);

        return {
          success: true,
          blobId,
          certified: certResult.poaStatus === 'certified',
          poaStatus: certResult.poaStatus,
          certificate: certResult.certificate,
          checkedAt: Date.now()
        };
      } else {
        return {
          success: false,
          blobId,
          error: result.error || 'Failed to check PoA status',
          poaStatus: 'unknown'
        };
      }

    } catch (error) {
      const err = error as Error;
      logger.error(LogComponent.UI, 'poa_status_error', 'Failed to check status', {
        blobId,
        error: err.message
      });

      return {
        success: false,
        blobId,
        error: err.message,
        poaStatus: 'unknown'
      };
    }
  }

  /**
   * Start polling certification status
   * @param {string} blobId - Blob ID to poll
   */
  startStatusPolling(blobId: string) {
    // Clear existing polling if any
    this.stopStatusPolling(blobId);

    let attempts = 0;

    logger.debug(LogComponent.UI, 'poa_start_polling', 'Starting status polling', {
      blobId,
      interval: this.defaultPollInterval
    });

    const intervalId = setInterval(async () => {
      attempts++;

      try {
        const status = await this.checkCertificationStatus(blobId);

        if (status.success && status.certified) {
          // Certification confirmed, stop polling
          logger.info(LogComponent.UI, 'poa_polling_success', 'Certification confirmed', {
            blobId,
            attempts
          });

          this.stopStatusPolling(blobId);

          // Emit confirmation event
          eventBus.emit('poa:certification:confirmed', {
            blobId,
            attempts,
            timestamp: Date.now()
          });
        } else if (attempts >= this.maxPollAttempts) {
          // Max attempts reached, stop polling
          logger.warn(LogComponent.UI, 'poa_polling_timeout', 'Polling timed out', {
            blobId,
            attempts
          });

          this.stopStatusPolling(blobId);

          // Emit timeout event
          eventBus.emit('poa:certification:timeout', {
            blobId,
            attempts,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        const err = error as Error;
        logger.error(LogComponent.UI, 'poa_polling_error', 'Polling error', {
          blobId,
          attempt: attempts,
          error: err.message
        });
      }
    }, this.defaultPollInterval);

    this.pollingIntervals.set(blobId, intervalId);
  }

  /**
   * Stop polling certification status
   * @param {string} blobId - Blob ID to stop polling
   */
  stopStatusPolling(blobId: string) {
    if (this.pollingIntervals.has(blobId)) {
      clearInterval(this.pollingIntervals.get(blobId));
      this.pollingIntervals.delete(blobId);

      logger.debug(LogComponent.UI, 'poa_stop_polling', 'Stopped status polling', {
        blobId
      });
    }
  }

  /**
   * Get certification history for a blob
   * @param {string} blobId - Blob ID
   * @returns {Array} History entries
   */
  getCertificationHistory(blobId: string) {
    return this.certificationHistory.get(blobId) || [];
  }

  /**
   * Add entry to certification history
   * @param {string} blobId - Blob ID
   * @param {Object} entry - History entry
   */
  addToHistory(blobId: string, entry: Record<string, any>) {
    if (!this.certificationHistory.has(blobId)) {
      this.certificationHistory.set(blobId, []);
    }

    const history = this.certificationHistory.get(blobId);
    history.push({
      ...entry,
      id: `${blobId}-${Date.now()}`
    });

    // Keep only last 50 entries
    if (history.length > 50) {
      history.shift();
    }

    this.certificationHistory.set(blobId, history);

    // Save to localStorage
    this.saveHistoryToStorage();

    logger.debug(LogComponent.UI, 'poa_history_added', 'Added to certification history', {
      blobId,
      action: entry.action
    });
  }

  /**
   * Get current request status
   * @param {string} blobId - Blob ID
   * @returns {Object|null} Request status
   */
  getRequestStatus(blobId: string) {
    return this.certificationRequests.get(blobId) || null;
  }

  /**
   * Clear request status
   * @param {string} blobId - Blob ID
   */
  clearRequestStatus(blobId: string) {
    this.certificationRequests.delete(blobId);
    this.stopStatusPolling(blobId);
  }

  /**
   * Load certification history from localStorage
   */
  loadHistoryFromStorage() {
    try {
      const stored = localStorage.getItem('poa_certification_history');
      if (stored) {
        const historyArray = JSON.parse(stored);
        this.certificationHistory = new Map(historyArray);

        logger.debug(LogComponent.UI, 'poa_history_loaded', 'Loaded certification history', {
          blobCount: this.certificationHistory.size
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.warn(LogComponent.UI, 'poa_history_load_error', 'Failed to load history', {
        error: err.message
      });
    }
  }

  /**
   * Save certification history to localStorage
   */
  saveHistoryToStorage() {
    try {
      const historyArray = Array.from(this.certificationHistory.entries());
      localStorage.setItem('poa_certification_history', JSON.stringify(historyArray));
    } catch (error) {
      const err = error as Error;
      logger.warn(LogComponent.UI, 'poa_history_save_error', 'Failed to save history', {
        error: err.message
      });
    }
  }

  /**
   * Cleanup - stop all polling and clear resources
   */
  cleanup() {
    // Stop all polling
    for (const blobId of this.pollingIntervals.keys()) {
      this.stopStatusPolling(blobId);
    }

    // Save history
    this.saveHistoryToStorage();

    logger.info(LogComponent.UI, 'poa_cleanup', 'PoA Certification Service cleaned up');
  }
}

// Export class for testing
export { PoACertificationService };

// Export singleton instance
export const poaCertificationService = new PoACertificationService();

// Global access
if (typeof window !== 'undefined') {
  (window as any).poaCertificationService = poaCertificationService;

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    poaCertificationService.cleanup();
  });
}

export default poaCertificationService;