/**
 * OfflineQueueManager
 *
 * Manages queuing of operations when offline and processing when online.
 * Extracted from SpreadsheetEngine.js (Phase 4 refactoring).
 *
 * Responsibilities:
 * - Monitor network online/offline status
 * - Queue operations when offline or when they fail
 * - Process queue when online with retry logic
 * - Trim queue to prevent memory bloat
 */

import { logger, LogComponent } from '../../utils/Logger.js';

/**
 * Manager for offline operation queueing and processing
 */
export class OfflineQueueManager {
  /**
   * Create a new OfflineQueueManager
   * @param {Object} options - Configuration options
   * @param {Function} options.onProcessItem - Callback to process a queue item (async)
   */
  constructor({ onProcessItem }) {
    // Offline queue for disconnected saves
    this.offlineQueue = [];
    this.isOnline = navigator.onLine;
    this.offlineQueueProcessingTimer = null;
    this.maxOfflineQueueSize = 50; // Maximum items in offline queue
    this.offlineRetryInterval = 30000; // 30 seconds retry interval

    // Callback to process queue items
    this.onProcessItem = onProcessItem;

    // Event handler references for cleanup
    this.onlineHandler = null;
    this.offlineHandler = null;

    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'offline_queue_init',
      'OfflineQueueManager initialized', {
        isOnline: this.isOnline
      });
  }

  /**
   * Setup online/offline event listeners and start processing if online
   */
  setupListeners() {
    const handleOnline = () => {
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'network_online', 'Network connection restored');
      this.isOnline = true;
      this.processOfflineQueue();
    };

    const handleOffline = () => {
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'network_offline', 'Network connection lost');
      this.isOnline = false;
      // Clear any existing queue processing timer
      if (this.offlineQueueProcessingTimer) {
        clearInterval(this.offlineQueueProcessingTimer);
        this.offlineQueueProcessingTimer = null;
      }
    };

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Store references for cleanup
    this.onlineHandler = handleOnline;
    this.offlineHandler = handleOffline;

    // Setup periodic queue processing
    if (this.isOnline) {
      this.startOfflineQueueProcessing();
    }
  }

  /**
   * Add a save operation to the offline queue
   */
  addToOfflineQueue(operation) {
    // Prevent queue from growing too large
    if (this.offlineQueue.length >= this.maxOfflineQueueSize) {
      // Remove oldest items to make room
      const toRemove = this.offlineQueue.length - this.maxOfflineQueueSize + 1;
      this.offlineQueue.splice(0, toRemove);
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'offline_queue_trimmed',
        `Offline queue trimmed, removed ${toRemove} oldest items`);
    }

    const queueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      operation,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: 3
    };

    this.offlineQueue.push(queueItem);

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'offline_queue_add', 'Operation added to offline queue', {
      queueId: queueItem.id,
      operation: operation.type,
      queueSize: this.offlineQueue.length
    });

    // Start processing if we're online
    if (this.isOnline && !this.offlineQueueProcessingTimer) {
      this.startOfflineQueueProcessing();
    }
  }

  /**
   * Start processing the offline queue
   */
  startOfflineQueueProcessing() {
    if (this.offlineQueueProcessingTimer) {
      return; // Already processing
    }

    this.offlineQueueProcessingTimer = setInterval(() => {
      this.processOfflineQueue();
    }, this.offlineRetryInterval);

    // Process immediately
    this.processOfflineQueue();
  }

  /**
   * Process items in the offline queue
   */
  async processOfflineQueue() {
    if (!this.isOnline || this.offlineQueue.length === 0) {
      return;
    }

    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'offline_queue_processing',
      `Processing offline queue with ${this.offlineQueue.length} items`);

    // Process items one by one
    const itemsToProcess = [...this.offlineQueue];

    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];

      try {
        // Delegate to callback for actual processing
        await this.onProcessItem(item);

        // Remove successfully processed item from queue
        const index = this.offlineQueue.findIndex(q => q.id === item.id);
        if (index !== -1) {
          this.offlineQueue.splice(index, 1);
          logger.info(LogComponent.SPREADSHEET_ENGINE, 'offline_queue_success',
            'Offline queue item processed successfully', { queueId: item.id });
        }
      } catch (error) {
        // Increment retry count
        item.retryCount++;

        if (item.retryCount >= item.maxRetries) {
          // Remove item that has exceeded retry limit
          const index = this.offlineQueue.findIndex(q => q.id === item.id);
          if (index !== -1) {
            this.offlineQueue.splice(index, 1);
            logger.error(LogComponent.SPREADSHEET_ENGINE, 'offline_queue_failed',
              'Offline queue item failed permanently', {
                queueId: item.id,
                retryCount: item.retryCount,
                error: typeof error === 'string' ? error : error.message || 'Unknown error'
              });
          }
        } else {
          logger.warn(LogComponent.SPREADSHEET_ENGINE, 'offline_queue_retry',
            'Offline queue item failed, will retry', {
              queueId: item.id,
              retryCount: item.retryCount,
              error: typeof error === 'string' ? error : error.message || 'Unknown error'
            });
        }
      }
    }

    // Stop processing if queue is empty
    if (this.offlineQueue.length === 0 && this.offlineQueueProcessingTimer) {
      clearInterval(this.offlineQueueProcessingTimer);
      this.offlineQueueProcessingTimer = null;
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'offline_queue_empty', 'Offline queue processing stopped - queue empty');
    }
  }

  /**
   * Get current queue size
   */
  getQueueSize() {
    return this.offlineQueue.length;
  }

  /**
   * Check if currently online
   */
  getIsOnline() {
    return this.isOnline;
  }

  /**
   * Cleanup - stop timers and remove event listeners
   */
  cleanup() {
    // Clear timer
    if (this.offlineQueueProcessingTimer) {
      clearInterval(this.offlineQueueProcessingTimer);
      this.offlineQueueProcessingTimer = null;
    }

    // Remove event listeners
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
    if (this.offlineHandler) {
      window.removeEventListener('offline', this.offlineHandler);
      this.offlineHandler = null;
    }

    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'offline_queue_cleanup',
      'OfflineQueueManager cleaned up');
  }
}
