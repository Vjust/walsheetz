# Client Module

Core client classes for Walrus blob storage operations, connection management, and SDK integration.

## Overview

This module contains the fundamental client classes that handle blob storage/retrieval, connection state management, and integration with the @mysten/walrus SDK. These classes are used by the higher-level service implementations (BrowserWalrusService, NodeWalrusService).

## Exports

### WalrusBlobClient

Core blob client orchestrating store/retrieve operations with encoding, validation, and transport abstraction.

**Constructor:**
```javascript
const client = new WalrusBlobClient(endpoints, transport, connectionManager);
```

**Parameters:**
- `endpoints` - Walrus endpoint configuration (aggregator/publisher URLs)
- `transport` - Transport implementation (DirectTransport or ProxyTransport)
- `connectionManager` - WalrusConnectionManager instance

**Methods:**

#### `storeBlob(data, options)`
Store blob to Walrus with automatic encoding and compression.

```javascript
const result = await client.storeBlob(spreadsheetData, {
  epochs: 5,
  compressionThreshold: 1024 // Enable compression for data > 1KB
});

// Returns:
// {
//   success: true,
//   blobId: 'abc123...',
//   contentHash: 'sha256...',
//   size: 2048,
//   metadata: { originalSize, compressedSize, compression, uploadedAt, contentHash }
// }
```

#### `readBlob(blobId, options)`
Retrieve and decode blob from Walrus.

```javascript
const data = await client.readBlob('abc123...', {
  verifyHash: true // Verify content integrity
});
```

---

### WalrusConnectionManager

Manages connection state, tracks failures, and handles degraded mode for CORS issues.

**Constructor:**
```javascript
const manager = new WalrusConnectionManager();
```

**Methods:**

#### `recordSuccess()`
Record successful operation, reset failure count.

```javascript
manager.recordSuccess();
```

#### `recordFailure(error)`
Record failed operation, detect CORS errors, enter degraded mode if needed.

```javascript
try {
  await walrusOperation();
  manager.recordSuccess();
} catch (error) {
  manager.recordFailure(error); // Auto-detects CORS errors
}
```

#### `isCorsError(error)`
Check if error is CORS-related.

```javascript
const isCors = manager.isCorsError(error);
// true for: 'Failed to fetch', 'CORS', 'NetworkError', etc.
```

#### `addPendingSave(saveData)` / `clearPendingSaves()`
Queue management for degraded mode.

```javascript
manager.addPendingSave({ spreadsheetId, data, timestamp });
const pending = manager.pendingSaves; // Access queued saves
manager.clearPendingSaves(); // Clear queue
```

#### `getState()`
Get current connection state.

```javascript
const state = manager.getState();
// { isConnected, transientFailures, lastCheck, lastSuccessfulOperation }
```

---

### WalrusSdkClient

Wrapper for @mysten/walrus SDK client providing JSON blob write operations with encode → register → upload → certify flow.

**Constructor:**
```javascript
const sdkClient = new WalrusSdkClient({
  suiClient, // Optional SuiClient instance
  suiClientUrl, // Optional Sui RPC URL (uses proxy-aware URL from config)
  network // 'testnet' or 'mainnet' (defaults from config)
});
```

**Methods:**

#### `writeJsonBlob({ json, identifier, tags, epochs })`
Encode JSON data and create register transaction.

```javascript
const { encodedBlob, registerTx } = await sdkClient.writeJsonBlob({
  json: { spreadsheet: 'data' },
  identifier: 'walsheetz-v1.json',
  epochs: 50
});

// User signs registerTx with wallet
```

#### `completeUploadAndCertify(encodedBlob, signAndExecute)`
Complete upload and certification after register transaction is signed.

```javascript
const { blobId, certifyResult } = await sdkClient.completeUploadAndCertify(
  encodedBlob,
  signAndExecute // Wallet sign/execute function
);
```

#### `getSuiClient()` / `getWalrusClient()`
Access underlying clients.

```javascript
const suiClient = sdkClient.getSuiClient();
const walrusClient = sdkClient.getWalrusClient();
```

---

### WalrusSdkClientLoader

Lazy loader for WalrusSdkClient with config-aware initialization.

**Constructor:**
```javascript
const loader = new WalrusSdkClientLoader();
```

**Methods:**

#### `getClient()`
Get or create WalrusSdkClient instance.

```javascript
const client = await loader.getClient();
// Returns cached instance or creates new one
```

#### `reset()`
Reset cached client (useful for testing).

```javascript
loader.reset();
```

## Dependencies

**Internal:**
- `../utils/DataEncoder` - Encoding/decoding with compression
- `../utils/DataValidator` - Data validation
- `../utils/WalrusEventEmitter` - Event emission
- `../config/endpointHelper` - Endpoint fallback logic
- `../config/BlockchainConfig` - Configuration

**External:**
- `@mysten/walrus` - Walrus SDK
- `@mysten/sui/client` - Sui client

## Usage Examples

### Basic Blob Storage

```javascript
import { WalrusBlobClient, WalrusConnectionManager } from '@dreamlit/walrus';
import { DirectTransport } from '@dreamlit/walrus';

const endpoints = {
  aggregator: 'https://aggregator.walrus-testnet.walrus.space',
  publisher: 'https://publisher.walrus-testnet.walrus.space'
};

const transport = new DirectTransport();
const connectionManager = new WalrusConnectionManager();

const client = new WalrusBlobClient(endpoints, transport, connectionManager);

// Store
const result = await client.storeBlob({ data: 'my spreadsheet' }, { epochs: 5 });

// Retrieve
const data = await client.readBlob(result.blobId);
```

### Connection State Management

```javascript
const manager = new WalrusConnectionManager();

// Monitor connection
if (manager.isConnected) {
  console.log('Connected to Walrus');
} else if (manager.isDegraded) {
  console.log('Degraded mode (CORS issue), using proxy');
}

// Handle operation
try {
  await walrusOperation();
  manager.recordSuccess();
} catch (error) {
  manager.recordFailure(error);

  if (manager.isDegraded) {
    // Switch to proxy mode or queue operation
    manager.addPendingSave(saveData);
  }
}
```

### SDK Integration

```javascript
import { WalrusSdkClient } from '@dreamlit/walrus';

const sdkClient = new WalrusSdkClient({ network: 'testnet' });

// Prepare blob
const { encodedBlob, registerTx } = await sdkClient.writeJsonBlob({
  json: myData,
  epochs: 50
});

// User signs with wallet
const signedTx = await wallet.signAndExecuteTransactionBlock({
  transactionBlock: registerTx
});

// Complete upload
const { blobId, certifyResult } = await sdkClient.completeUploadAndCertify(
  encodedBlob,
  wallet.signAndExecuteTransactionBlock
);

console.log('Stored at:', blobId);
```

## Architecture

```
WalrusBlobClient
├── validateDataForWalrus() - Validate data structure
├── encodeSpreadsheetData() - Encode + compress
├── calculateContentHash() - SHA-256 integrity
├── transport.putBlob() - Store via transport
└── connectionManager.recordSuccess/Failure()

WalrusConnectionManager
├── isConnected (boolean)
├── transientFailures (number)
├── isDegraded (boolean - CORS mode)
└── pendingSaves (array - degraded mode queue)
```

## Events

The client emits events via `WalrusEventEmitter`:

- `store-success` - Blob stored successfully
- `store-failure` - Blob storage failed
- `read-success` - Blob retrieved successfully
- `read-failure` - Blob retrieval failed
- `connection-change` - Connection state changed

## Related Modules

- [../browser/](../browser/) - Browser service implementation
- [../transports/](../transports/) - Transport layer
- [../utils/](../utils/) - Utility functions
- [../config/](../config/) - Configuration
- [../health/](../health/) - Health monitoring

## Notes

- WalrusBlobClient automatically handles encoding, compression, and validation
- WalrusConnectionManager detects CORS errors and enables degraded mode
- WalrusSdkClient provides atomic operations (register → upload → certify)
- Content hash is calculated using SHA-256 for integrity verification
- Compression is applied automatically when data exceeds threshold
