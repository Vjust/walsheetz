/**
 * @dreamlit/walrus-sui-core/blockchain - Browser-Safe Exports
 *
 * This file exports only browser-compatible modules from the blockchain folder.
 * Node-only modules (walletManager) are excluded.
 */

// Browser-safe services
export { suiGraphQLService } from './sui-graphql-service.js';

// Support Services (browser-safe)
export { sponsorService } from './sponsor-service.js';
export { gasEstimator } from './gas-estimator.js';
export { versionControl } from './version-control.js';

// Management Services (browser-safe)
export { contractRegistry as suiContractRegistry } from './sui-contract-registry.js';

// Config (browser-safe)
export { getCurrentConfig } from './config.js';
