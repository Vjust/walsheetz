# Interfaces Module

TypeScript interfaces and type definitions for the spreadsheet SDK.

## Overview

This module contains TypeScript interface definitions for blockchain services, storage services, and data structures used throughout the SDK.

## Exports

### IBlockchainService

Interface for blockchain service implementations.

```typescript
interface IBlockchainService {
  connectWallet(): Promise<void>;
  getAddress(): string;
  signTransaction(tx: TransactionBlock): Promise<SignedTransaction>;
  executeTransaction(tx: TransactionBlock): Promise<TransactionResult>;
  getBalance(address: string): Promise<number>;
}
```

---

### IStorageService

Interface for storage service implementations.

```typescript
interface IStorageService {
  store(data: any, options: StorageOptions): Promise<StorageResult>;
  retrieve(blobId: string): Promise<any>;
  getMetadata(blobId: string): Promise<BlobMetadata>;
}
```

## Usage

Interfaces are used for type safety and dependency injection:

```typescript
import { IBlockchainService, IStorageService } from '@dreamlit/spreadsheet-sdk/interfaces';

class SpreadsheetService {
  constructor(
    private blockchain: IBlockchainService,
    private storage: IStorageService
  ) {}

  async save(data: any) {
    const { blobId } = await this.storage.store(data);
    const tx = await this.blockchain.createTransaction(blobId);
    return await this.blockchain.executeTransaction(tx);
  }
}
```

## Type Definitions

### StorageOptions

```typescript
interface StorageOptions {
  epochs?: number;
  deletable?: boolean;
  compressionThreshold?: number;
}
```

### StorageResult

```typescript
interface StorageResult {
  blobId: string;
  contentHash: string;
  size: number;
  metadata: BlobMetadata;
}
```

### BlobMetadata

```typescript
interface BlobMetadata {
  originalSize: number;
  compressedSize?: number;
  compression: string;
  uploadedAt: number;
  contentHash: string;
  hashAlgorithm: string;
}
```

## Related Modules

- [../adapters/](../adapters/) - Implement interfaces
- [../services/](../services/) - Use interfaces
- [../business/](../business/) - Type-safe business logic

## Notes

- Provides type safety across the SDK
- Enables dependency injection
- Facilitates testing with mocks
- Ensures consistent API contracts
