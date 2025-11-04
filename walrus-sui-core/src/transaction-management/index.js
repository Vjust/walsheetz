/**
 * @walsheetz/transaction-management - Transaction Handling
 *
 * Transaction queuing, tracking, retry logic, and offline support.
 *
 * Dependencies:
 * - @walsheetz/shared (Logger, EventBus, IndexedDBCache)
 * - @walsheetz/blockchain-integration (BrowserSuiService)
 */

// Services - export both class and singleton
export { TransactionManager, transactionManager } from './services/TransactionManager.js';
export { transactionTracker } from './services/TransactionTracker.js';
export { offlineModeService, getOfflineModeService } from './services/OfflineModeService.js';

// Queue - export class (no singleton exists)
export { OfflineQueueManager } from './queue/OfflineQueueManager.js';

// Utils - export singleton
export { transactionExperienceManager } from './utils/TransactionExperience.js';
