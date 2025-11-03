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
// Note: BlockchainAdapter.js is a test file only, not a real implementation
// The actual BlockchainAdapter is in @dreamlit/spreadsheet-sdk
// export { BlockchainAdapter } from './adapters/BlockchainAdapter.js';
export {
  createBlockchainExecutionOp,
  createTxPrepOp,
  createWalrusStorageOp
} from './adapters/atomic/index.js';

// Utils
export {
  detectSaveVersionSignature,
  buildSaveVersionArgs,
  detectModuleVersion,
  checkSpreadsheetVersionCompatibility
} from './utils/AbiHelpers.js';

export {
  getSuiExplorerUrl,
  getSuivisionUrl,
  getWalrusExplorerUrl,
  getAllExplorerLinks,
  getExplorerDisplayName,
  getExplorerIcon
} from './utils/ExplorerLinks.js';

// Types are imported via TypeScript, not re-exported
