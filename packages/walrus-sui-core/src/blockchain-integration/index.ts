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
export { AtomicOperationManager } from './services/AtomicOperationManager.js';
export { AtomicExecutionContext } from './services/AtomicExecutionContext.js';

// Interfaces
export { IBlockchainService } from './interfaces/IBlockchainService.js';

// Adapters
export {
  createBlockchainExecutionOp,
  createTxPrepOp,
  createWalrusStorageOp,
  OperationHelpers,
} from './adapters/atomic/index.js';

// Utils
export {
  detectSaveVersionSignature,
  buildSaveVersionArgs,
  detectModuleVersion,
  checkSpreadsheetVersionCompatibility,
} from '@dreamlit/shared';

export {
  getSuiExplorerUrl,
  getSuivisionUrl,
  getWalrusExplorerUrl,
  getAllExplorerLinks,
  getExplorerDisplayName,
  getExplorerIcon,
} from '@dreamlit/shared';

// Types are imported via TypeScript, not re-exported
