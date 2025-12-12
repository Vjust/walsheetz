/**
 * @dreamlit/walrus - Node.js Entry Point
 *
 * Node.js-optimized entry point for Walrus storage operations.
 * Provides Node.js-specific implementations for batch and deduplication.
 */

// Main Node.js service
export { NodeWalrusService, nodeWalrusService } from './node/NodeWalrusService.js';

// Re-export all other modules (they're Node.js compatible)
export * from './index.js';
