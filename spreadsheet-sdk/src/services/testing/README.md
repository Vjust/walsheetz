# Testing Module

Testing utilities and mocks for spreadsheet SDK development and testing.

## Overview

This module provides testing utilities, mock implementations, and test mode adapters for developing and testing spreadsheet applications.

## Exports

### TestModeAdapter

Adapter for running spreadsheet in test mode with mocked services.

```javascript
import { TestModeAdapter } from '@dreamlit/spreadsheet-sdk/services/testing';

const adapter = new TestModeAdapter({
  mockWallet: true,
  mockBlockchain: true,
  mockStorage: true
});

// Use in tests
const result = await adapter.mockSave(data);
```

---

### mockWalletConnection

Mock wallet connection for testing without actual wallet.

```javascript
import { mockWalletConnection } from '@dreamlit/spreadsheet-sdk/services/testing';

const wallet = mockWalletConnection({
  address: '0x123...',
  connected: true
});

// Use in tests
await wallet.connect();
const address = wallet.getAddress();
const signed = await wallet.signTransaction(tx);
```

## Usage

### Test Mode Setup

```javascript
import { TestModeAdapter } from '@dreamlit/spreadsheet-sdk/services/testing';

describe('Spreadsheet Tests', () => {
  let testAdapter;

  beforeEach(() => {
    testAdapter = new TestModeAdapter({
      mockWallet: true,
      mockBlockchain: true,
      mockStorage: true
    });
  });

  it('should save spreadsheet', async () => {
    const result = await testAdapter.mockSave(spreadsheetData);
    expect(result.blobId).toBeDefined();
    expect(result.txDigest).toBeDefined();
  });
});
```

### Mock Wallet Testing

```javascript
import { mockWalletConnection } from '@dreamlit/spreadsheet-sdk/services/testing';

describe('Wallet Integration', () => {
  it('should connect wallet', async () => {
    const wallet = mockWalletConnection({
      address: '0xtest123',
      connected: false
    });

    await wallet.connect();
    expect(wallet.isConnected()).toBe(true);
    expect(wallet.getAddress()).toBe('0xtest123');
  });

  it('should sign transaction', async () => {
    const wallet = mockWalletConnection({ connected: true });
    const tx = new TransactionBlock();

    const signed = await wallet.signTransaction(tx);
    expect(signed.signature).toBeDefined();
  });
});
```

### Integration Testing

```javascript
import { TestModeAdapter, mockWalletConnection } from '@dreamlit/spreadsheet-sdk/services/testing';

describe('Spreadsheet Integration', () => {
  let adapter;
  let wallet;

  beforeEach(() => {
    wallet = mockWalletConnection({ connected: true });
    adapter = new TestModeAdapter({
      wallet,
      mockBlockchain: true,
      mockStorage: true
    });
  });

  it('should perform atomic save', async () => {
    const result = await adapter.atomicSave(data, metadata);

    expect(result.blobId).toMatch(/^blob_/);
    expect(result.txDigest).toMatch(/^0x/);
    expect(result.success).toBe(true);
  });
});
```

## Mock Implementations

### Mock Wallet

```javascript
const mockWallet = {
  address: '0x123...',
  connected: true,
  connect: async () => { /* mock */ },
  disconnect: () => { /* mock */ },
  signTransaction: async (tx) => ({ signature: '0xabc...' }),
  signAndExecute: async (tx) => ({ digest: '0xdef...' }),
  getAddress: () => '0x123...',
  isConnected: () => true
};
```

### Mock Storage

```javascript
const mockStorage = {
  store: async (data) => ({
    blobId: 'blob_123',
    contentHash: 'hash_abc',
    size: 1024
  }),
  retrieve: async (blobId) => ({ /* mock data */ }),
  getMetadata: async (blobId) => ({ /* mock metadata */ })
};
```

### Mock Blockchain

```javascript
const mockBlockchain = {
  executeTransaction: async (tx) => ({
    digest: '0xtx_123',
    status: 'success'
  }),
  getBalance: async (address) => 1000000000,
  getObject: async (objectId) => ({ /* mock object */ })
};
```

## Test Utilities

### Fast Mode

Disable delays and animations for faster tests:

```javascript
testAdapter.enableFastMode();
```

### Mock Data Generation

Generate test spreadsheet data:

```javascript
const testData = testAdapter.generateTestData({
  rows: 10,
  cols: 5,
  seed: 'test123'
});
```

### Assertion Helpers

```javascript
expect(result).toBeValidSpreadsheet();
expect(blobId).toBeValidBlobId();
expect(txDigest).toBeValidTransactionDigest();
```

## Configuration

```javascript
const testConfig = {
  mockWallet: true,              // Use mock wallet
  mockBlockchain: true,          // Use mock blockchain
  mockStorage: true,             // Use mock storage
  fastMode: true,                // Disable delays
  logLevel: 'error',             // Reduce logging
  autoCleanup: true              // Auto cleanup after tests
};

const adapter = new TestModeAdapter(testConfig);
```

## Related Modules

- [../../adapters/](../../adapters/) - Real implementations
- [../../business/](../../business/) - Business logic to test
- [../../components/](../../components/) - Components to test

## Notes

- Mocks provide deterministic test behavior
- TestModeAdapter simplifies test setup
- Fast mode speeds up test execution
- Mocks are compatible with real interfaces
- Useful for unit and integration testing
