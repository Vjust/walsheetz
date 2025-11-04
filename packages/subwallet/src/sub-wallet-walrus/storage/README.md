# Storage Module

Storage adapters for persisting sub-wallet data in different environments.

## Overview

Pluggable storage adapters for browser (localStorage/IndexedDB) and Node.js (filesystem) environments.

## Exports

### NodeFsStorageAdapter

Filesystem storage for Node.js/CLI.

```typescript
const storage = new NodeFsStorageAdapter('./wallets');
await storage.saveWallets(wallets);
const loaded = await storage.loadWallets();
```

### BrowserStorageAdapter

Browser storage (localStorage).

```typescript
const storage = new BrowserStorageAdapter('walrus-wallets');
await storage.saveWallets(wallets);
const loaded = await storage.loadWallets();
```

### IndexedDBStorageAdapter

IndexedDB storage for large datasets.

```typescript
const storage = new IndexedDBStorageAdapter('walrus-db');
await storage.saveWallets(wallets);
```

## Interface

```typescript
interface StorageAdapter {
  saveWallets(wallets: Wallet[]): Promise<void>;
  loadWallets(): Promise<Wallet[]>;
  deleteWallets(): Promise<void>;
  exists(): Promise<boolean>;
}
```

## Usage

```typescript
import { NodeFsStorageAdapter } from '@walrus/subwallet-sdk/storage';
import { SubWalletOrchestrator } from '@walrus/subwallet-sdk/core';

// Node.js
const storage = new NodeFsStorageAdapter('./my-wallets');

const orchestrator = new SubWalletOrchestrator({
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  storage
});

// Wallets automatically persist
const wallets = await orchestrator.createWallets(5);
```

## Adapter Comparison

| Adapter | Environment | Capacity | Performance |
|---------|-------------|----------|-------------|
| NodeFsStorageAdapter | Node.js/CLI | Unlimited | Fast |
| BrowserStorageAdapter | Browser | 5-10 MB | Fast |
| IndexedDBStorageAdapter | Browser | 50+ MB | Medium |

## Related Modules

- [../core/](../core/) - Uses storage adapters
- [../../cli/](../../cli/) - CLI storage

## Notes

- Adapters are pluggable
- All implement same interface
- Automatic serialization/deserialization
- Support for backup/restore
