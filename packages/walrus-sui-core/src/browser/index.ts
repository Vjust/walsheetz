/**
 * @dreamlit/walrus-sui-core/browser - Browser-Only Entry Point
 *
 * This entry point provides browser-specific services that require window/localStorage.
 * Do NOT use this entry point in Node.js/CLI environments.
 *
 * For Node.js/CLI usage, import from '@dreamlit/walrus-sui-core/node' instead.
 */

// Browser-specific services from blockchain-integration
export {
  browserSuiService,
  browserWalletManager,
  AtomicOperationManager,
  AtomicExecutionContext
} from '../blockchain-integration/index.js';

// Note: The blockchain-integration module contains Browser* services that:
// - Use window.localStorage for wallet state
// - Rely on browser wallet adapters (@mysten/wallet-standard)
// - Use window-based event listeners
// - Require DOM APIs

// CLI-safe modules are exported from the main entry point
