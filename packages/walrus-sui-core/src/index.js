/**
 * @walsheetz/blockchain-integration - Sui Blockchain Interaction
 *
 * Complete Sui blockchain interaction layer including wallet management,
 * RPC client, atomic operations, and transaction handling.
 *
 * Dependencies:
 * - @walsheetz/shared (ConfigLoader, CircuitBreaker, Logger, EventBus)
 * - @mysten/sui.js
 * - @mysten/wallet-standard
 */

// Services
export { browserSuiService } from './services/BrowserSuiService.js';
export { browserWalletManager } from './services/BrowserWalletManager.js';
export { browserGrpcService } from './services/BrowserGrpcService.js';
export { AtomicOperationManager } from './services/AtomicOperationManager.js';
export { AtomicExecutionContext } from './services/AtomicExecutionContext.js';

// Adapters
export { BlockchainAdapter } from './adapters/BlockchainAdapter.js';
export {
  createBlockchainExecutionOp,
  createTxPrepOp,
  createWalrusStorageOp
} from './adapters/atomic/index.js';

// Utils
export { parseABI, extractFunctionSignature } from './utils/AbiHelpers.js';
export { getExplorerLink } from './utils/ExplorerLinks.js';

// Types are imported via TypeScript, not re-exported
