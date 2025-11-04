# Blockchain Module

Core Sui blockchain services for @dreamlit/walrus-sui-core, providing comprehensive blockchain interaction capabilities.

## Overview

This module contains 20+ service implementations for interacting with the Sui blockchain network, including RPC clients, GraphQL services, gRPC support, wallet management, transaction execution, gas estimation, and more.

## Exports

### Core Services

#### `suiService`
Main Sui RPC client singleton for blockchain operations.

```javascript
import { suiService } from '@dreamlit/walrus-sui-core/blockchain';

const balance = await suiService.getBalance(address);
const tx = await suiService.executeTransaction(txBlock);
```

#### `suiGraphQLService`
GraphQL client for querying Sui blockchain state.

```javascript
import { suiGraphQLService } from '@dreamlit/walrus-sui-core/blockchain';

const objects = await suiGraphQLService.queryObjects(filter);
const events = await suiGraphQLService.queryEvents(eventFilter);
```

#### `suiGrpcService`
High-performance gRPC client for Sui operations.

```javascript
import { suiGrpcService } from '@dreamlit/walrus-sui-core/blockchain';

const stream = await suiGrpcService.subscribeToEvents(filter);
```

####  `walrusService`
Walrus blockchain integration service.

```javascript
import { walrusService } from '@dreamlit/walrus-sui-core/blockchain';

const blobInfo = await walrusService.getBlobInfo(blobId);
```

#### `walletManager`
Wallet connection and management service.

```javascript
import { walletManager } from '@dreamlit/walrus-sui-core/blockchain';

await walletManager.connect();
const address = walletManager.getAddress();
const signed = await walletManager.signTransaction(tx);
```

---

### Support Services

#### `sponsorService`
Transaction sponsorship and gas payment management.

```javascript
import { sponsorService } from '@dreamlit/walrus-sui-core/blockchain';

const sponsoredTx = await sponsorService.sponsorTransaction(txBlock, wallets);
```

#### `gasEstimator`
Gas cost estimation for transactions.

```javascript
import { gasEstimator } from '@dreamlit/walrus-sui-core/blockchain';

const estimate = await gasEstimator.estimateGas(txBlock);
console.log('Estimated gas:', estimate.totalGas);
```

#### `depositManager`
Manage storage deposits for Walrus operations.

```javascript
import { depositManager } from '@dreamlit/walrus-sui-core/blockchain';

const deposit = await depositManager.calculateDeposit(blobSize, epochs);
await depositManager.ensureSufficientDeposit(address, deposit);
```

#### `versionControl`
Smart contract version management and compatibility.

```javascript
import { versionControl } from '@dreamlit/walrus-sui-core/blockchain';

const version = await versionControl.getCurrentVersion(packageId);
const isCompatible = versionControl.isCompatible(version, '1.0.0');
```

---

### Management Services

#### `eventStreamManager`
Real-time blockchain event streaming.

```javascript
import { eventStreamManager } from '@dreamlit/walrus-sui-core/blockchain';

eventStreamManager.subscribe('BlobStored', (event) => {
  console.log('Blob stored:', event.blobId);
});

eventStreamManager.start();
```

#### `GraphQLEventSubscriber`
GraphQL-based event subscription class.

```javascript
import { GraphQLEventSubscriber } from '@dreamlit/walrus-sui-core/blockchain';

const subscriber = new GraphQLEventSubscriber();
await subscriber.subscribe(eventFilter, handler);
```

#### `suiContractRegistry`
Smart contract registry and ABI management.

```javascript
import { suiContractRegistry } from '@dreamlit/walrus-sui-core/blockchain';

const contract = suiContractRegistry.getContract('WalrusStorage');
const abi = suiContractRegistry.getABI(contractId);
```

#### `suiTransactionRunner`
Transaction execution with retry logic and error handling.

```javascript
import { suiTransactionRunner } from '@dreamlit/walrus-sui-core/blockchain';

const result = await suiTransactionRunner.execute(txBlock, {
  maxRetries: 3,
  onProgress: (status) => console.log(status)
});
```

---

### Builders & Bridges

#### `grpcTransactionBuilder`
Build gRPC-compatible transactions.

```javascript
import { grpcTransactionBuilder } from '@dreamlit/walrus-sui-core/blockchain';

const grpcTx = await grpcTransactionBuilder.build(txBlock);
```

#### `grpcService`
Core gRPC service implementation.

```javascript
import { grpcService } from '@dreamlit/walrus-sui-core/blockchain';

const response = await grpcService.call('executeTransaction', params);
```

#### `websocketGrpcBridge`
WebSocket to gRPC bridge for browser environments.

```javascript
import { websocketGrpcBridge } from '@dreamlit/walrus-sui-core/blockchain';

websocketGrpcBridge.connect();
const stream = websocketGrpcBridge.streamEvents(filter);
```

---

### Configuration

#### `getCurrentConfig()`
Get current blockchain configuration.

```javascript
import { getCurrentConfig } from '@dreamlit/walrus-sui-core/blockchain';

const config = getCurrentConfig();
// { sui: { rpcUrl, graphqlUrl, network }, walrus: {...} }
```

## Usage Examples

### Basic Blockchain Operations

```javascript
import { suiService, walletManager } from '@dreamlit/walrus-sui-core/blockchain';

// Connect wallet
await walletManager.connect();
const address = walletManager.getAddress();

// Check balance
const balance = await suiService.getBalance(address);
console.log('Balance:', balance);

// Get objects
const objects = await suiService.getOwnedObjects(address);
```

### Transaction Execution

```javascript
import {
  suiService,
  gasEstimator,
  suiTransactionRunner
} from '@dreamlit/walrus-sui-core/blockchain';
import { TransactionBlock } from '@mysten/sui/transactions';

// Build transaction
const txBlock = new TransactionBlock();
txBlock.moveCall({
  target: `${packageId}::module::function`,
  arguments: [/* args */]
});

// Estimate gas
const estimate = await gasEstimator.estimateGas(txBlock);
console.log('Estimated gas:', estimate.totalGas);

// Execute with retry
const result = await suiTransactionRunner.execute(txBlock, {
  maxRetries: 3,
  signer: walletManager
});

console.log('Transaction:', result.digest);
```

### Event Monitoring

```javascript
import { eventStreamManager } from '@dreamlit/walrus-sui-core/blockchain';

// Subscribe to events
eventStreamManager.subscribe('BlobStored', (event) => {
  console.log('New blob:', event.blobId);
  console.log('Size:', event.size);
  console.log('Epochs:', event.epochs);
});

eventStreamManager.subscribe('BlobCertified', (event) => {
  console.log('Blob certified:', event.blobId);
});

// Start streaming
eventStreamManager.start();
```

### GraphQL Queries

```javascript
import { suiGraphQLService } from '@dreamlit/walrus-sui-core/blockchain';

// Query objects
const objects = await suiGraphQLService.queryObjects({
  owner: address,
  filter: { type: 'WalrusBlob' }
});

// Query events
const events = await suiGraphQLService.queryEvents({
  eventType: 'BlobStored',
  sender: address,
  fromCheckpoint: 12345
});

// Get transaction details
const tx = await suiGraphQLService.getTransaction(digest);
```

### Sponsored Transactions

```javascript
import { sponsorService, walletManager } from '@dreamlit/walrus-sui-core/blockchain';

// Build transaction
const txBlock = new TransactionBlock();
// ... add calls ...

// Sponsor transaction (sponsor pays gas)
const sponsoredTx = await sponsorService.sponsorTransaction(
  txBlock,
  [walletManager.getAddress()], // Worker wallets
  sponsorWallet // Sponsor wallet
);

// Execute
const result = await walletManager.signAndExecute(sponsoredTx);
```

### Contract Interaction

```javascript
import { suiContractRegistry, suiService } from '@dreamlit/walrus-sui-core/blockchain';

// Get contract ABI
const contract = suiContractRegistry.getContract('WalrusStorage');

// Call contract function
const txBlock = new TransactionBlock();
txBlock.moveCall({
  target: `${contract.packageId}::${contract.module}::store_blob`,
  arguments: [blobId, epochs]
});

const result = await suiService.executeTransaction(txBlock);
```

## Service Categories

### RPC Services
- `suiService` - Standard RPC operations
- `suiGraphQLService` - GraphQL queries
- `suiGrpcService` - gRPC high-performance

### Wallet & Auth
- `walletManager` - Wallet connection and signing
- `sponsorService` - Transaction sponsorship

### Transaction Management
- `suiTransactionRunner` - Execute with retry
- `grpcTransactionBuilder` - Build gRPC transactions
- `gasEstimator` - Gas cost estimation

### Storage & Deposits
- `depositManager` - Walrus deposit management
- `walrusService` - Walrus blockchain integration

### Events & Monitoring
- `eventStreamManager` - Real-time event streaming
- `GraphQLEventSubscriber` - GraphQL event subscriptions
- `websocketGrpcBridge` - WebSocket bridge

### Configuration & Registry
- `suiContractRegistry` - Contract ABI registry
- `versionControl` - Version compatibility
- `config` - Blockchain configuration

## Dependencies

**Internal:**
- `../data-integrity/` - Data integrity services
- `../transaction-management/` - Transaction management
- `../blockchain-integration/` - Integration adapters

**External:**
- `@mysten/sui` - Sui SDK
- `@mysten/graphql-transport` - GraphQL transport
- `graphql`, `graphql-request` - GraphQL client

## Architecture

```
blockchain/
├── Core Layer
│   ├── suiService (RPC)
│   ├── suiGraphQLService (GraphQL)
│   └── suiGrpcService (gRPC)
├── Wallet Layer
│   ├── walletManager
│   └── sponsorService
├── Transaction Layer
│   ├── suiTransactionRunner
│   ├── grpcTransactionBuilder
│   └── gasEstimator
├── Storage Layer
│   ├── depositManager
│   └── walrusService
└── Event Layer
    ├── eventStreamManager
    ├── GraphQLEventSubscriber
    └── websocketGrpcBridge
```

## Related Modules

- [../blockchain-integration/](../blockchain-integration/) - Browser integration
- [../transaction-management/](../transaction-management/) - Transaction queue
- [../data-integrity/](../data-integrity/) - PoA and lineage tracking
- [../browser/](../browser/) - Browser entry point
- [../node/](../node/) - Node.js entry point

## Notes

- All services exported as singletons for easy import
- GraphQL provides more efficient queries than RPC
- gRPC offers highest performance for streaming
- Event streaming runs in background after start()
- Wallet manager handles both browser and programmatic wallets
- Sponsor service enables gasless transactions for users
- Version control ensures contract compatibility
- Deposit manager calculates required Walrus deposits
