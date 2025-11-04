# @dreamlit/walrus-sui-core

Walrus + Sui blockchain integration core - CLI-compatible storage and blockchain operations.

## Features

- **Dual Environment Support**: Separate entry points for Node.js/CLI and browser environments
- **Blockchain Services**: Complete Sui blockchain interaction layer
- **Transaction Management**: Queueing, tracking, retry logic, offline support
- **Data Integrity**: PoA certification, blob lineage tracking
- **Wallet Management**: Browser wallet integration (browser entry only)
- **GraphQL Integration**: Sui GraphQL client for querying blockchain state
- **GRPC Support**: High-performance GRPC transaction execution

## Installation

```bash
npm install @dreamlit/walrus-sui-core @dreamlit/walrus
# or
bun add @dreamlit/walrus-sui-core @dreamlit/walrus
```

**Important**: This package has a **peer dependency** on `@dreamlit/walrus`. You must install both packages.

For Node.js/CLI usage with fetch support, also install `undici`:

```bash
npm install undici
# or
bun add undici
```

## Entry Points

This package provides **three entry points** for different environments:

### 1. Node.js/CLI Entry Point (Recommended for Server/CLI)

```javascript
import { nodeWalrusService, suiService } from '@dreamlit/walrus-sui-core/node';
// or
import { nodeWalrusService, suiService } from '@dreamlit/walrus-sui-core'; // Auto-detects Node.js
```

**Features**:
- NodeWalrusService (uses `undici` for fetch polyfill)
- No window/localStorage dependencies
- DirectTransport (no CORS proxy)
- CLI-safe blockchain services

### 2. Browser Entry Point (Browser-Only)

```javascript
import { browserSuiService, browserWalletManager } from '@dreamlit/walrus-sui-core/browser';
```

**Features**:
- Browser wallet integration (@mysten/wallet-standard)
- LocalStorage-based persistence
- ProxyTransport for CORS handling
- window-based event listeners

### 3. Submodule Exports (Environment-Agnostic)

```javascript
import { suiService } from '@dreamlit/walrus-sui-core/blockchain';
import { TransactionManager } from '@dreamlit/walrus-sui-core/transaction';
import { poaCertificationService } from '@dreamlit/walrus-sui-core/data-integrity';
```

## Usage

### Node.js/CLI Usage

```javascript
import { NodeWalrusService, suiService } from '@dreamlit/walrus-sui-core/node';

// Create Node-compatible Walrus service
const walrusService = new NodeWalrusService({ verbose: true });

// Store data to Walrus
const { blobId } = await walrusService.storeBlob({ myData: 'value' });

// Use blockchain services
const networkInfo = await suiService.getNetworkInfo();
console.log('Sui network:', networkInfo);
```

### Browser Usage

```javascript
import { browserWalletManager, browserSuiService } from '@dreamlit/walrus-sui-core/browser';
import { browserWalrusService } from '@dreamlit/walrus';

// Connect wallet
await browserWalletManager.connect();

// Store to Walrus
const { blobId } = await browserWalrusService.storeBlob(data);

// Record on Sui blockchain
await browserSuiService.storeSpreadsheetVersion({
  blobId,
  metadata: { /* ... */ }
});
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

## Peer Dependencies

This package requires `@dreamlit/walrus` as a peer dependency. Install both:

```bash
npm install @dreamlit/walrus-sui-core @dreamlit/walrus
```

**Why peer dependency?**
- Prevents version conflicts
- Allows consumers to control the Walrus version
- Reduces bundle size (shared dependency)

### Optional: undici for Node.js

For Node.js fetch support, install `undici`:

```bash
npm install undici
```

If `undici` is not installed, NodeWalrusService will warn but won't crash. Some features may not work without fetch polyfill.

## Environment Detection

The package automatically detects the environment:

```javascript
// In Node.js, this imports node/index.js
import { ... } from '@dreamlit/walrus-sui-core';

// In browser bundlers (webpack/vite), this imports index.js (browser version)
import { ... } from '@dreamlit/walrus-sui-core';
```

You can also explicitly import:

```javascript
// Force Node.js entry
import { ... } from '@dreamlit/walrus-sui-core/node';

// Force browser entry
import { ... } from '@dreamlit/walrus-sui-core/browser';
```

## License

MIT

## Author

Dreamlit
