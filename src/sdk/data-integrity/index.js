/**
 * @walsheetz/data-integrity - PoA & Blob Lineage
 *
 * Proof of Availability certification, blob lineage tracking, and data integrity services.
 *
 * Dependencies:
 * - @walsheetz/shared (Logger, EventBus)
 * - @walsheetz/blockchain-integration (BrowserSuiService)
 * - @walsheetz/walrus (BrowserWalrusService)
 */

// Services
export { poaCertificationService } from './services/PoACertificationService.js';
export { poaRenewalManager } from './services/PoARenewalManager.js';
export { blobLineageTracker } from './services/BlobLineageTracker.js';

// Interfaces
export type {
  IGraphQLResponse,
  IBlobRecord,
  IPoAStatus
} from './interfaces/graphql/index.js';
