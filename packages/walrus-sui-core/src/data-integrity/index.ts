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

// Interfaces (TypeScript types - consumers should import directly)
// Note: TypeScript consumers can import types from './interfaces/graphql/index.js'
// JavaScript consumers don't need these exports
