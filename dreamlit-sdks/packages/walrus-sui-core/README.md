# @dreamlit/walrus-sui-core

Walrus + Sui blockchain integration core - CLI-compatible storage and blockchain operations.

## Features

- **Blockchain Services**: Complete Sui blockchain interaction layer
- **Transaction Management**: Queueing, tracking, retry logic, offline support
- **Data Integrity**: PoA certification, blob lineage tracking
- **Wallet Management**: Browser wallet integration
- **GraphQL Integration**: Sui GraphQL client for querying blockchain state
- **GRPC Support**: High-performance GRPC transaction execution

## Installation

```bash
npm install @dreamlit/walrus-sui-core
# or
bun add @dreamlit/walrus-sui-core
```

## Usage

### Basic Blockchain Operations

```javascript
import { suiService, walletManager } from '@dreamlit/walrus-sui-core/blockchain';

// Connect wallet
await walletManager.connect();

// Get wallet address
const address = walletManager.getCurrentAddress();

// Execute transaction
const result = await suiService.executeTransaction(txBlock);
```

### Transaction Management

```javascript
import { TransactionManager, transactionTracker } from '@dreamlit/walrus-sui-core/transaction';

const txManager = new TransactionManager();

// Track transaction
await txManager.executeWithTracking(async () => {
  // Your transaction logic
});

// Get transaction status
const status = transactionTracker.getStatus(txId);
```

### Data Integrity

```javascript
import { poaCertificationService, blobLineageTracker } from '@dreamlit/walrus-sui-core/data-integrity';

// Get PoA certificate
const cert = await poaCertificationService.getCertificate(blobId);

// Track blob lineage
const lineage = await blobLineageTracker.getLineage(blobId);
```

### Full Integration (Storage + Blockchain)

```javascript
import { browserWalrusService } from '@dreamlit/walrus';
import { suiService, TransactionManager } from '@dreamlit/walrus-sui-core';

// Store data to Walrus
const { blobId } = await browserWalrusService.storeBlob(data);

// Record on blockchain
const txManager = new TransactionManager();
await txManager.executeWithTracking(async () => {
  await suiService.recordBlobId(blobId);
});
```

## Package Structure

```
@dreamlit/walrus-sui-core/
├── blockchain/          # Core blockchain services
│   ├── sui-service.js
│   ├── sui-graphql-service.js
│   ├── wallet-manager.js
│   └── ...
├── blockchain-integration/  # Browser-specific integration
│   ├── services/
│   └── adapters/
├── transaction-management/  # Transaction handling
│   ├── services/
│   └── queue/
└── data-integrity/     # PoA and lineage
    ├── services/
    └── interfaces/
```

## Dependencies

- `@dreamlit/walrus`: Core Walrus storage adapter
- `@mysten/sui`: Sui SDK
- `@mysten/graphql-transport`: GraphQL transport for Sui

## CLI Usage

This package is designed to work in both browser and Node.js environments:

```javascript
// Node.js CLI script
import { suiService } from '@dreamlit/walrus-sui-core/blockchain';

const result = await suiService.queryObject(objectId);
console.log(result);
```

## License

MIT

## Author

Dreamlit
