# Adapters Module

Adapter implementations for blockchain and storage integration in @dreamlit/spreadsheet-sdk.

## Overview

This module provides adapter pattern implementations that connect the spreadsheet SDK to Walrus storage and Sui blockchain services.

## Exports

### BlockchainAdapter

Adapter for Sui blockchain operations including atomic transactions, wallet management, and transaction tracking.

```javascript
import { BlockchainAdapter } from '@dreamlit/spreadsheet-sdk/adapters';

const adapter = new BlockchainAdapter({
  walrusService,
  suiService,
  walletManager
});

// Atomic save operation
const result = await adapter.atomicSaveToWalrusAndBlockchain(
  spreadsheetData,
  metadata
);
```

**Features:**
- Atomic operations (Walrus storage + blockchain transaction)
- Wallet connection management
- Transaction progress tracking
- Rollback on failure
- Explorer link generation

**Methods:**
- `atomicSaveToWalrusAndBlockchain()` - Atomic save operation
- `loadFromWalrus()` - Load spreadsheet from Walrus
- `getWalletAddress()` - Get connected wallet address
- `connectWallet()` - Connect browser wallet
- `signTransaction()` - Sign blockchain transaction

---

### StorageAdapter

Adapter for Walrus storage operations.

```javascript
import { StorageAdapter } from '@dreamlit/spreadsheet-sdk/adapters';

const adapter = new StorageAdapter(walrusService);

// Store data
const { blobId } = await adapter.store(spreadsheetData, { epochs: 5 });

// Retrieve data
const data = await adapter.retrieve(blobId);
```

**Methods:**
- `store(data, options)` - Store to Walrus
- `retrieve(blobId)` - Retrieve from Walrus
- `getMetadata(blobId)` - Get blob metadata

## Usage

### Blockchain Integration

```javascript
import { BlockchainAdapter } from '@dreamlit/spreadsheet-sdk/adapters';
import {
  browserWalrusService,
  browserSuiService,
  browserWalletManager
} from '@dreamlit/walrus-sui-core/browser';

const blockchainAdapter = new BlockchainAdapter({
  walrusService: browserWalrusService,
  suiService: browserSuiService,
  walletManager: browserWalletManager
});

// Connect wallet
await blockchainAdapter.connectWallet();

// Atomic save
const result = await blockchainAdapter.atomicSaveToWalrusAndBlockchain(
  spreadsheetData,
  {
    title: 'My Spreadsheet',
    epochs: 5
  }
);

console.log('Saved:', result.blobId);
console.log('Transaction:', result.txDigest);
```

### Storage Only

```javascript
import { StorageAdapter } from '@dreamlit/spreadsheet-sdk/adapters';
import { browserWalrusService } from '@dreamlit/walrus/browser';

const storageAdapter = new StorageAdapter(browserWalrusService);

// Store
const { blobId } = await storageAdapter.store(data, { epochs: 5 });

// Retrieve
const retrieved = await storageAdapter.retrieve(blobId);
```

## Dependencies

**Internal:**
- Uses `@dreamlit/walrus` for storage
- Uses `@dreamlit/walrus-sui-core` for blockchain

## Related Modules

- [../services/](../services/) - Services use adapters
- [../business/](../business/) - Business logic uses adapters
- [../components/](../components/) - Components use adapters

## Notes

- BlockchainAdapter provides atomic operations with automatic rollback
- StorageAdapter focuses solely on Walrus storage
- Adapters abstract away implementation details
- Used throughout the SDK for consistent interfaces
