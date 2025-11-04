/**
 * @dreamlit/walrus-sui-core/blockchain - Sui Blockchain Services
 *
 * Core blockchain services for interacting with Sui network.
 */

// Core Services (singleton exports)
export { suiService } from './sui-service.js';
export { suiGraphQLService } from './sui-graphql-service.js';
export { suiGrpcService } from './sui-grpc-service.js';
export { walrusService } from './walrus-service.js';
export { walletManager } from './wallet-manager.js';

// Support Services (singleton exports)
export { sponsorService } from './sponsor-service.js';
export { gasEstimator } from './gas-estimator.js';
export { depositManager } from './deposit-manager.js';
export { versionControl } from './version-control.js';

// Management Services
export { eventStreamManager } from './event-stream-manager.js';
export { GraphQLEventSubscriber } from './graphql-event-subscriber.js';
export { contractRegistry as suiContractRegistry } from './sui-contract-registry.js';
export { transactionRunner as suiTransactionRunner } from './sui-transaction-runner.js';

// Builders & Bridges (singleton exports)
export { grpcTransactionBuilder } from './grpc-transaction-builder.js';
export { grpcService } from './grpc-service.js';
export { wsGrpcBridge as websocketGrpcBridge } from './websocket-grpc-bridge.js';

// Config
export { getCurrentConfig } from './config.js';
