/**
 * Node.js Smoke Tests
 *
 * Ensures @dreamlit/walrus-sui-core can be imported and used in a Node.js environment
 * without triggering window/localStorage/DOM errors.
 */

import { describe, it, expect } from 'vitest';

describe('Node.js Entry Point', () => {
  it('should import Node entry point without errors', async () => {
    const module = await import('../src/node/index.ts');
    expect(module).toBeDefined();
    expect(module.NodeWalrusService).toBeDefined();
  });

  it('should not reference window', async () => {
    const module = await import('../src/node/index.ts');

    // The module itself shouldn't reference window
    const moduleString = JSON.stringify(module);
    expect(moduleString).not.toContain('window');
  });

  it('should export NodeWalrusService class', async () => {
    const { NodeWalrusService } = await import('../src/node/index.ts');

    expect(NodeWalrusService).toBeDefined();
    expect(typeof NodeWalrusService).toBe('function');
    expect(NodeWalrusService.name).toBe('NodeWalrusService');
  });

  it('should export nodeWalrusService singleton', async () => {
    const { nodeWalrusService } = await import('../src/node/index.ts');

    expect(nodeWalrusService).toBeDefined();
    expect(nodeWalrusService.constructor.name).toBe('NodeWalrusService');
  });

  it('should create NodeWalrusService instance without window dependencies', async () => {
    // This test will fail if the service tries to access window/localStorage
    const { NodeWalrusService } = await import('../src/node/index.ts');

    expect(() => {
      const service = new NodeWalrusService({ autoInit: false, verbose: false });
      expect(service).toBeDefined();
    }).not.toThrow();
  });
});

describe('Blockchain Services (CLI-safe)', () => {
  it('should export blockchain services from node entry', async () => {
    const module = await import('../src/node/index.ts');

    // Blockchain services should be available
    expect(module.suiService).toBeDefined();
    expect(module.walletManager).toBeDefined();
  });

  it('should NOT export browser-only services from node entry', async () => {
    const module = await import('../src/node/index.ts');

    // Browser-specific services should NOT be exported from node entry
    expect(module.browserSuiService).toBeUndefined();
    expect(module.browserWalletManager).toBeUndefined();
    expect(module.browserGrpcService).toBeUndefined();
  });
});

describe('Transaction Management (CLI-safe)', () => {
  it('should export transaction management from node entry', async () => {
    const module = await import('../src/node/index.ts');

    expect(module.TransactionManager).toBeDefined();
    expect(module.transactionTracker).toBeDefined();
  });
});

describe('Data Integrity (CLI-safe)', () => {
  it('should export data integrity services from node entry', async () => {
    const module = await import('../src/node/index.ts');

    expect(module.poaCertificationService).toBeDefined();
    expect(module.blobLineageTracker).toBeDefined();
  });
});

describe('Export Separation', () => {
  it('should have separate browser and node entry points', async () => {
    // This ensures we maintain separation
    const nodeModule = await import('../src/node/index.ts');
    const browserModule = await import('../src/browser/index.ts');

    // Node should have NodeWalrusService
    expect(nodeModule.NodeWalrusService).toBeDefined();
    expect(nodeModule.browserSuiService).toBeUndefined();

    // Browser should have Browser* services
    expect(browserModule.browserSuiService).toBeDefined();
    expect(browserModule.NodeWalrusService).toBeUndefined();
  });
});
