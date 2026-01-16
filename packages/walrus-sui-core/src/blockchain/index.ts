/**
 * @dreamlit/walrus-sui-core/blockchain - Sui Blockchain Services
 *
 * Core blockchain services for interacting with Sui network.
 */

// Core Services (singleton exports)
export { suiService } from './sui-service.js';
export { suiGraphQLService } from './sui-graphql-service.js';
export { nodeWalrusService as walrusService } from '@dreamlit/walrus/node';
export { walletManager } from './wallet-manager.js';

// Support Services (singleton exports)
export { sponsorService } from './sponsor-service.js';
export { gasEstimator } from './gas-estimator.js';
export { depositManager } from './deposit-manager.js';
export { versionControl } from './version-control.js';

// Management Services
export { contractRegistry as suiContractRegistry } from './sui-contract-registry.js';
export { transactionRunner as suiTransactionRunner } from './sui-transaction-runner.js';

// Builders
// Config
export { getCurrentConfig } from './config.js';
