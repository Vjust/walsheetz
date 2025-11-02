/**
 * PoA Renewal Manager Service
 * Monitors blob PoA certificates and manages renewal workflows
 */

import { eventBus } from "@/sdk/shared/utils/EventBus.js";
import { logger, LogComponent } from "@/sdk/shared/utils/Logger.js";

class PoARenewalManager {
  constructor() {
    // Map of blobId -> certificate status
    this.certificates = new Map();

    // Map of blobId -> expiry check interval ID
    this.expiryChecks = new Map();

    // Renewal warnings (blobId -> warning data)
    this.renewalWarnings = new Map();

    // Configuration
    this.config = {
      warningThresholdDays: 7, // Show warning 7 days before expiry
      criticalThresholdDays: 2, // Show critical warning 2 days before
      checkIntervalMs: 6 * 60 * 60 * 1000, // Check every 6 hours
      autoRenewEnabled: false, // Auto-renew feature flag
      defaultRenewDays: 30
    };

    // Storage key
    this.storageKey = 'poa_renewal_data';

    // Load from storage
    this.loadFromStorage();

    logger.info(LogComponent.UI, 'renewal_mgr_init', 'PoARenewalManager initialized', {
      certificateCount: this.certificates.size,
      warningCount: this.renewalWarnings.size
    });

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen for blob certification events
    eventBus.on('poa:certification:completed', (data) => {
      this.trackCertificate({
        blobId: data.blobId,
        status: 'certified',
        transactionDigest: data.transactionDigest,
        timestamp: Date.now()
      });
    });

    // Listen for PoA status updates
    eventBus.on('poa:status:updated', (data) => {
      if (data.certified && data.certificate) {
        this.trackCertificate({
          blobId: data.blobId,
          status: data.poaStatus,
          certificate: data.certificate,
          timestamp: Date.now()
        });
      }
    });

    // Listen for blob storage events to start monitoring
    eventBus.on('walrus:blob:stored', (data) => {
      this.startMonitoring(data.blobId);
    });
  }

  /**
   * Track a certificate
   * @param {Object} certData - Certificate data
   */
  trackCertificate(certData) {
    try {
      const {
        blobId,
        status,
        certificate = null,
        transactionDigest = null,
        timestamp = Date.now()
      } = certData;

      logger.debug(LogComponent.UI, 'renewal_track_cert', 'Tracking certificate', {
        blobId,
        status
      });

      // Get existing or create new entry
      let certEntry = this.certificates.get(blobId);

      if (!certEntry) {
        certEntry = {
          blobId,
          status,
          certificate,
          transactionDigest,
          firstCertified: timestamp,
          lastChecked: timestamp,
          lastRenewed: null,
          renewalCount: 0
        };
      } else {
        // Update existing
        certEntry.status = status;
        if (certificate) certEntry.certificate = certificate;
        if (transactionDigest) certEntry.transactionDigest = transactionDigest;
        certEntry.lastChecked = timestamp;
      }

      this.certificates.set(blobId, certEntry);

      // Check if renewal is needed
      this.checkRenewalStatus(blobId);

      // Save to storage
      this.saveToStorage();

      logger.info(LogComponent.UI, 'renewal_cert_tracked', 'Certificate tracked', {
        blobId,
        status
      });

    } catch (error) {
      logger.error(LogComponent.UI, 'renewal_track_error', 'Failed to track certificate', {
        error: error.message,
        certData
      });
    }
  }

  /**
   * Start monitoring a blob for expiry
   * @param {string} blobId - Blob ID to monitor
   */
  startMonitoring(blobId) {
    // Clear existing check if any
    this.stopMonitoring(blobId);

    logger.debug(LogComponent.UI, 'renewal_start_monitor', 'Starting expiry monitoring', {
      blobId,
      intervalHours: this.config.checkIntervalMs / (60 * 60 * 1000)
    });

    // Create interval for periodic checks
    const intervalId = setInterval(async () => {
      await this.checkCertificateStatus(blobId);
    }, this.config.checkIntervalMs);

    this.expiryChecks.set(blobId, intervalId);

    // Do initial check immediately
    this.checkCertificateStatus(blobId);
  }

  /**
   * Stop monitoring a blob
   * @param {string} blobId - Blob ID
   */
  stopMonitoring(blobId) {
    if (this.expiryChecks.has(blobId)) {
      clearInterval(this.expiryChecks.get(blobId));
      this.expiryChecks.delete(blobId);

      logger.debug(LogComponent.UI, 'renewal_stop_monitor', 'Stopped expiry monitoring', {
        blobId
      });
    }
  }

  /**
   * Check certificate status for a blob
   * @param {string} blobId - Blob ID
   */
  async checkCertificateStatus(blobId) {
    try {
      logger.debug(LogComponent.UI, 'renewal_check_status', 'Checking certificate status', {
        blobId
      });

      // Import services dynamically
      const { browserWalrusService } = await import("@/walrus/BrowserWalrusService.js");

      // Get current PoA certificate status
      const result = await browserWalrusService.getPoACertificate(blobId);

      if (!result.success) {
        logger.warn(LogComponent.UI, 'renewal_check_failed', 'Failed to check certificate', {
          blobId,
          error: result.error
        });
        return;
      }

      // Update tracking
      this.trackCertificate({
        blobId,
        status: result.poaStatus,
        certificate: result.certificate,
        timestamp: Date.now()
      });

      // Check renewal status
      this.checkRenewalStatus(blobId);

    } catch (error) {
      logger.error(LogComponent.UI, 'renewal_check_error', 'Error checking certificate status', {
        blobId,
        error: error.message
      });
    }
  }

  /**
   * Check if renewal is needed and emit warnings
   * @param {string} blobId - Blob ID
   */
  checkRenewalStatus(blobId) {
    try {
      const certEntry = this.certificates.get(blobId);
      if (!certEntry || !certEntry.certificate) return;

      const { certificate } = certEntry;

      // Extract expiry timestamp from certificate
      const expiryTimestamp = this.extractExpiryTimestamp(certificate);
      if (!expiryTimestamp) return;

      const now = Date.now();
      const timeUntilExpiry = expiryTimestamp - now;
      const daysUntilExpiry = timeUntilExpiry / (24 * 60 * 60 * 1000);

      logger.debug(LogComponent.UI, 'renewal_check', 'Checking renewal status', {
        blobId,
        daysUntilExpiry: Math.floor(daysUntilExpiry)
      });

      // Determine warning level
      let warningLevel = null;

      if (timeUntilExpiry <= 0) {
        warningLevel = 'expired';
      } else if (daysUntilExpiry <= this.config.criticalThresholdDays) {
        warningLevel = 'critical';
      } else if (daysUntilExpiry <= this.config.warningThresholdDays) {
        warningLevel = 'warning';
      }

      // Update or clear warning
      if (warningLevel) {
        const warning = {
          blobId,
          level: warningLevel,
          expiryTimestamp,
          daysUntilExpiry: Math.max(0, Math.floor(daysUntilExpiry)),
          checkedAt: Date.now()
        };

        this.renewalWarnings.set(blobId, warning);

        // Emit warning event
        eventBus.emit('poa:renewal:warning', warning);

        logger.warn(LogComponent.UI, 'renewal_warning', 'PoA renewal warning', {
          blobId,
          level: warningLevel,
          daysUntilExpiry: Math.floor(daysUntilExpiry)
        });

      } else {
        // Clear warning if exists
        if (this.renewalWarnings.has(blobId)) {
          this.renewalWarnings.delete(blobId);
        }
      }

      // Save changes
      this.saveToStorage();

    } catch (error) {
      logger.error(LogComponent.UI, 'renewal_check_error', 'Error checking renewal status', {
        blobId,
        error: error.message
      });
    }
  }

  /**
   * Extract expiry timestamp from certificate
   * @param {Object} certificate - PoA certificate object
   * @returns {number|null} Expiry timestamp or null
   */
  extractExpiryTimestamp(certificate) {
    // This would parse the actual certificate structure
    // For now, assume it has an expiryTimestamp field
    return certificate?.expiryTimestamp || null;
  }

  /**
   * Request renewal for a blob
   * @param {string} blobId - Blob ID to renew
   * @param {Object} options - Renewal options
   * @returns {Promise<Object>} Renewal result
   */
  async requestRenewal(blobId, options = {}) {
    try {
      const { durationDays = this.config.defaultRenewDays } = options;

      logger.info(LogComponent.UI, 'renewal_request', 'Requesting PoA renewal', {
        blobId,
        durationDays
      });

      // Import services
      const { browserSuiService } = await import("@/sdk/services/blockchain/BrowserSuiService.js");

      // Execute renewal transaction (same as initial certification)
      const result = await browserSuiService.certifyBlob(blobId, {
        durationDays
      });

      if (result.success) {
        // Update tracking
        const certEntry = this.certificates.get(blobId);
        if (certEntry) {
          certEntry.lastRenewed = Date.now();
          certEntry.renewalCount = (certEntry.renewalCount || 0) + 1;
          certEntry.transactionDigest = result.transactionDigest;
          this.certificates.set(blobId, certEntry);
        }

        // Clear warning
        this.renewalWarnings.delete(blobId);

        // Save changes
        this.saveToStorage();

        // Emit success event
        eventBus.emit('poa:renewal:completed', {
          blobId,
          transactionDigest: result.transactionDigest,
          durationDays,
          timestamp: Date.now()
        });

        logger.info(LogComponent.UI, 'renewal_success', 'PoA renewal completed', {
          blobId,
          transactionDigest: result.transactionDigest
        });

        return {
          success: true,
          blobId,
          transactionDigest: result.transactionDigest,
          durationDays
        };

      } else {
        logger.error(LogComponent.UI, 'renewal_failed', 'PoA renewal failed', {
          blobId,
          error: result.error
        });

        // Emit failure event
        eventBus.emit('poa:renewal:failed', {
          blobId,
          error: result.error,
          timestamp: Date.now()
        });

        return {
          success: false,
          blobId,
          error: result.error
        };
      }

    } catch (error) {
      logger.error(LogComponent.UI, 'renewal_request_error', 'Error requesting renewal', {
        blobId,
        error: error.message
      });

      return {
        success: false,
        blobId,
        error: error.message
      };
    }
  }

  /**
   * Get renewal warnings
   * @param {string} level - Filter by warning level (optional)
   * @returns {Array} Array of warnings
   */
  getRenewalWarnings(level = null) {
    const warnings = Array.from(this.renewalWarnings.values());

    if (level) {
      return warnings.filter((w) => w.level === level);
    }

    return warnings;
  }

  /**
   * Get certificate info
   * @param {string} blobId - Blob ID
   * @returns {Object|null} Certificate info or null
   */
  getCertificateInfo(blobId) {
    return this.certificates.get(blobId) || null;
  }

  /**
   * Get all monitored certificates
   * @returns {Array} Array of certificate entries
   */
  getAllCertificates() {
    return Array.from(this.certificates.values());
  }

  /**
   * Update configuration
   * @param {Object} updates - Config updates
   */
  updateConfig(updates) {
    Object.assign(this.config, updates);
    this.saveToStorage();

    logger.info(LogComponent.UI, 'renewal_config_updated', 'Configuration updated', updates);
  }

  /**
   * Get configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Dismiss warning for a blob
   * @param {string} blobId - Blob ID
   */
  dismissWarning(blobId) {
    if (this.renewalWarnings.has(blobId)) {
      this.renewalWarnings.delete(blobId);
      this.saveToStorage();

      logger.debug(LogComponent.UI, 'renewal_warning_dismissed', 'Warning dismissed', {
        blobId
      });
    }
  }

  /**
   * Load from RAM (no localStorage - RAM-only mode)
   * Note: Renewal tracking is session-scoped. Renewals will be re-queried from blockchain on each page load.
   */
  loadFromStorage() {
    logger.info(LogComponent.UI, 'renewal_init', 'Renewal data initialized in RAM (no persistence)', {
      note: 'Renewal tracking is transient; data persists only in memory for current session'
    });
    // No localStorage - start with empty maps
    // On next page load, renewals will be fetched from blockchain as needed
  }

  /**
   * Save to RAM (no localStorage - RAM-only mode)
   * Note: Renewal tracking is session-scoped and not persisted.
   */
  saveToStorage() {
    logger.debug(LogComponent.UI, 'renewal_memory_tracked', 'Renewal data tracked in memory', {
      note: 'Not persisted; will be refreshed from blockchain on next page load',
      currentCertificateCount: this.certificates.size,
      currentWarningCount: this.renewalWarnings.size
    });
    // No localStorage write - data exists in RAM only
  }

  /**
   * Cleanup - stop all monitoring and save
   */
  cleanup() {
    // Stop all monitoring
    for (const blobId of this.expiryChecks.keys()) {
      this.stopMonitoring(blobId);
    }

    // Save data
    this.saveToStorage();

    logger.info(LogComponent.UI, 'renewal_cleanup', 'PoARenewalManager cleaned up');
  }
}

// Export singleton instance
export const poaRenewalManager = new PoARenewalManager();

// Global access
if (typeof window !== 'undefined') {
  window.poaRenewalManager = poaRenewalManager;

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    poaRenewalManager.cleanup();
  });
}

export default poaRenewalManager;