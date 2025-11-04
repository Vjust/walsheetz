# Utils Module

Utility functions for Walrus SDK including data encoding/decoding, validation, blob operations, and event emission.

## Overview

This module provides essential utility functions for the Walrus SDK, handling data transformation, validation, blob range reading, grid streaming, PoA certificate reading, and event management.

## Exports

### DataEncoder

Encode/decode spreadsheet data with automatic compression.

**Functions:**

#### `encodeSpreadsheetData(data, options)`
Encode data with optional compression.

```javascript
import { encodeSpreadsheetData } from '@dreamlit/walrus';

const { data: encoded, isCompressed, originalSize, compressedSize } =
  await encodeSpreadsheetData(spreadsheetData, {
    compressionThreshold: 1024 // Compress if > 1KB
  });
```

#### `decodeSpreadsheetData(encodedData)`
Decode previously encoded data.

```javascript
import { decodeSpreadsheetData } from '@dreamlit/walrus';

const data = await decodeSpreadsheetData(encodedData);
```

#### `calculateContentHash(data)`
Calculate SHA-256 hash for data integrity.

```javascript
import { calculateContentHash } from '@dreamlit/walrus';

const hash = await calculateContentHash(blobData);
// Returns: 'sha256:abc123...'
```

---

### DataValidator

Validate data before storage.

**Function:** `validateDataForWalrus(data)`

```javascript
import { validateDataForWalrus } from '@dreamlit/walrus';

const validation = validateDataForWalrus(spreadsheetData);

if (!validation.valid) {
  console.error('Validation failed:', validation.error);
  console.log('Issues:', validation.issues);
} else {
  // Data is valid
  await storeBlob(spreadsheetData);
}
```

**Validates:**
- Data structure
- Required fields
- Data size limits
- Type correctness

---

### BlobRangeReader

Read specific byte ranges from blobs.

**Function:** `readBlobRange(blobId, options, transport, endpoints)`

```javascript
import { readBlobRange } from '@dreamlit/walrus';

const chunk = await readBlobRange(
  blobId,
  { start: 0, end: 1023 }, // First 1024 bytes
  transport,
  endpoints
);

// Returns Blob object
```

---

### GridStreamer

Stream blob data to grid format.

**Function:** `streamBlobToGrid(blobId, gridSize, transport, endpoints)`

```javascript
import { streamBlobToGrid } from '@dreamlit/walrus';

const grid = await streamBlobToGrid(
  blobId,
  { rows: 100, cols: 26 },
  transport,
  endpoints
);

// Returns grid data structure
```

---

### PoACertificateReader

Read and parse PoA (Proof of Availability) certificates.

**Function:** `getPoaCertificate(blobId, transport, endpoints)`

```javascript
import { getPoaCertificate } from '@dreamlit/walrus';

const certificate = await getPoaCertificate(blobId, transport, endpoints);

// Returns:
// {
//   blobId: 'abc123...',
//   epoch: 12345,
//   endEpoch: 12350,
//   storageNodes: ['node1', 'node2', ...],
//   certified: true
// }
```

---

### WalrusEventEmitter

Emit SDK events to global event bus.

**Functions:**

#### `emitOperationEvent(eventName, data)`
Emit operation-related events.

```javascript
import { emitOperationEvent } from '@dreamlit/walrus';

emitOperationEvent('store-success', {
  blobId: 'abc123',
  size: 1024,
  duration: 156
});
```

#### `emitConnectionChange(isConnected)`
Emit connection state changes.

```javascript
import { emitConnectionChange } from '@dreamlit/walrus';

emitConnectionChange(true); // Connected
emitConnectionChange(false); // Disconnected
```

**Events Emitted:**
- `store-success` / `store-failure`
- `read-success` / `read-failure`
- `connection-change`

## Usage Examples

### Data Encoding & Validation

```javascript
import {
  encodeSpreadsheetData,
  decodeSpreadsheetData,
  validateDataForWalrus,
  calculateContentHash
} from '@dreamlit/walrus';

// Validate data
const validation = validateDataForWalrus(data);
if (!validation.valid) {
  throw new Error(`Invalid data: ${validation.error}`);
}

// Encode with compression
const {
  data: encoded,
  isCompressed,
  originalSize,
  compressedSize
} = await encodeSpreadsheetData(data, {
  compressionThreshold: 1024
});

console.log(`Size: ${originalSize} → ${compressedSize} (${isCompressed ? 'compressed' : 'uncompressed'})`);

// Calculate hash
const hash = await calculateContentHash(encoded);

// Store encoded data
await storeBlob(encoded);

// Later: decode
const decoded = await decodeSpreadsheetData(encoded);
```

### Range Reading

```javascript
import { readBlobRange } from '@dreamlit/walrus';

// Read first 1KB
const header = await readBlobRange(
  blobId,
  { start: 0, end: 1023 },
  transport,
  endpoints
);

// Read specific range
const chunk = await readBlobRange(
  blobId,
  { start: 1024, end: 2047 },
  transport,
  endpoints
);

// Read last 1KB
const footer = await readBlobRange(
  blobId,
  { start: -1024, end: -1 },
  transport,
  endpoints
);
```

### Grid Streaming

```javascript
import { streamBlobToGrid } from '@dreamlit/walrus';

// Stream blob to spreadsheet grid
const grid = await streamBlobToGrid(
  blobId,
  { rows: 1000, cols: 26 },
  transport,
  endpoints
);

// Access grid data
const cellA1 = grid[0][0];
const cellB2 = grid[1][1];
```

### PoA Certificate

```javascript
import { getPoaCertificate } from '@dreamlit/walrus';

const cert = await getPoaCertificate(blobId, transport, endpoints);

console.log('Blob certified:', cert.certified);
console.log('Valid until epoch:', cert.endEpoch);
console.log('Storage nodes:', cert.storageNodes.length);

if (!cert.certified) {
  console.warn('Blob not yet certified');
}
```

### Event Emission

```javascript
import { emitOperationEvent, emitConnectionChange } from '@dreamlit/walrus';
import { eventBus } from '@dreamlit/walrus';

// Listen for events
eventBus.on('store-success', ({ blobId, size, duration }) => {
  console.log(`✓ Stored ${blobId} (${size} bytes) in ${duration}ms`);
});

eventBus.on('store-failure', ({ error, duration }) => {
  console.error(`✗ Store failed: ${error} (${duration}ms)`);
});

// Emit events from your code
try {
  const result = await storeBlob(data);
  emitOperationEvent('store-success', {
    blobId: result.blobId,
    size: result.size,
    duration: Date.now() - startTime
  });
} catch (error) {
  emitOperationEvent('store-failure', {
    error: error.message,
    duration: Date.now() - startTime
  });
}

// Connection state
emitConnectionChange(isConnected);
```

## API Reference

### encodeSpreadsheetData

```typescript
function encodeSpreadsheetData(
  data: any,
  options?: {
    compressionThreshold?: number; // Compress if size > threshold (bytes)
  }
): Promise<{
  data: Uint8Array;
  isCompressed: boolean;
  originalSize: number;
  compressedSize?: number;
}>;
```

### validateDataForWalrus

```typescript
function validateDataForWalrus(data: any): {
  valid: boolean;
  error?: string;
  issues?: string[];
};
```

### readBlobRange

```typescript
function readBlobRange(
  blobId: string,
  options: { start: number; end: number },
  transport: Transport,
  endpoints: Endpoints
): Promise<Blob>;
```

### getPoaCertificate

```typescript
function getPoaCertificate(
  blobId: string,
  transport: Transport,
  endpoints: Endpoints
): Promise<{
  blobId: string;
  epoch: number;
  endEpoch: number;
  storageNodes: string[];
  certified: boolean;
}>;
```

## Dependencies

**Internal:**
- `../shared/EventBus` - Event emission

**External:**
- Web Crypto API (for hashing)
- Compression API (for encoding)

## Related Modules

- [../client/](../client/) - Uses utilities for blob operations
- [../browser/](../browser/) - Uses utilities in service layer
- [../shared/](../shared/) - EventBus integration

## Notes

- DataEncoder automatically applies compression when beneficial
- DataValidator checks structure, types, and size limits
- BlobRangeReader supports negative offsets (from end of blob)
- GridStreamer is optimized for spreadsheet data structures
- PoA certificates verify blob availability on storage nodes
- Events are emitted to global EventBus for monitoring
