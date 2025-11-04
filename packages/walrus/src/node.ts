/**
 * @dreamlit/walrus - Node.js Entry Point
 *
 * Node.js-optimized entry point for Walrus storage operations.
 * This export provides the same API as the browser version but with
 * Node.js-compatible implementations (fetch polyfill, etc.)
 */

// Note: For now, we're re-exporting the browser implementation
// In the future, create NodeWalrusService that:
// - Uses undici/node-fetch instead of browser fetch
// - Removes window global dependencies
// - Provides file system storage instead of localStorage

// Main service
export { BrowserWalrusService as WalrusService } from './browser/BrowserWalrusService.js';

// Re-export all other modules (they're Node.js compatible)
export * from './index.js';
