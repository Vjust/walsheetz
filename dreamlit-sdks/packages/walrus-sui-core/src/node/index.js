/**
 * @dreamlit/walrus-sui-core - Node.js/CLI Entry Point
 *
 * This entry point provides Node.js-compatible services without browser dependencies.
 * Use this for CLI tools, server-side applications, and Node.js scripts.
 *
 * Key differences from browser entry:
 * - NodeWalrusService instead of BrowserWalrusService (uses undici for fetch)
 * - No window/localStorage dependencies
 * - DirectTransport instead of ProxyTransport (no CORS)
 * - File system-based persistence
 */

// Node-compatible Walrus service
export { NodeWalrusService, nodeWalrusService } from './NodeWalrusService.js';

// Re-export CLI-safe blockchain services
export * from '../blockchain/index.js';

// Re-export transaction management (CLI-safe)
export * from '../transaction-management/index.js';

// Re-export data integrity (CLI-safe)
export * from '../data-integrity/index.js';

// Note: Browser-specific services (Browser*) are NOT exported from this entry point
// For browser usage, use the default import: import { ... } from '@dreamlit/walrus-sui-core'
