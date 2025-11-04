# Utils Module

Utility functions for spreadsheet SDK including ABI helpers, blob parsing, circuit breakers, configuration, event handling, and more.

## Overview

This module provides essential utility functions used throughout the spreadsheet SDK for various operations including blockchain interaction, data parsing, error handling, and telemetry.

## Exports

### AbiHelpers

Utilities for ABI (Application Binary Interface) detection and version compatibility.

```javascript
import { AbiHelpers } from '@dreamlit/spreadsheet-sdk/utils';

// Detect save version signature
const version = AbiHelpers.detectSaveVersionSignature(contractAbi);

// Build save arguments
const args = AbiHelpers.buildSaveVersionArgs(blobId, epochs, version);
```

---

### BlobParser

Parse and validate blob data.

```javascript
import { BlobParser } from '@dreamlit/spreadsheet-sdk/utils';

const parsed = BlobParser.parse(blobData);
const isValid = BlobParser.validate(parsed);
```

---

### CircuitBreaker

Circuit breaker pattern for fault tolerance.

```javascript
import { CircuitBreaker } from '@dreamlit/spreadsheet-sdk/utils';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  timeout: 60000
});

const result = await breaker.execute(async () => {
  return await unreliableOperation();
});
```

---

### ConfigLoader

Load and merge configuration from multiple sources.

```javascript
import { ConfigLoader } from '@dreamlit/spreadsheet-sdk/utils';

const config = await ConfigLoader.load({
  defaults: defaultConfig,
  env: process.env,
  file: './config.json'
});
```

---

### EventBus

Global event bus for application-wide events.

```javascript
import { EventBus } from '@dreamlit/spreadsheet-sdk/utils';

EventBus.on('spreadsheet:saved', (data) => {
  console.log('Saved:', data.blobId);
});

EventBus.emit('spreadsheet:saved', { blobId: 'abc' });
```

---

### ExplorerLinks

Generate blockchain explorer links.

```javascript
import { ExplorerLinks } from '@dreamlit/spreadsheet-sdk/utils';

const txLink = ExplorerLinks.transaction('0xtx123', 'testnet');
const blobLink = ExplorerLinks.blob('blob123', 'testnet');
const addressLink = ExplorerLinks.address('0xaddr', 'testnet');
```

---

### Logger

Structured logging utility.

```javascript
import { Logger } from '@dreamlit/spreadsheet-sdk/utils';

Logger.info('Operation started', { operation: 'save' });
Logger.error('Operation failed', { error });
Logger.debug('Debug info', { data });
```

---

### Telemetry

Analytics and telemetry tracking.

```javascript
import { Telemetry } from '@dreamlit/spreadsheet-sdk/utils';

Telemetry.track('spreadsheet_saved', {
  blobId: 'abc',
  size: 1024,
  duration: 156
});
```

---

### cellUtils

Utilities for spreadsheet cell operations.

```javascript
import { cellUtils } from '@dreamlit/spreadsheet-sdk/utils';

const cellRef = cellUtils.toCellReference(0, 0); // 'A1'
const coords = cellUtils.fromCellReference('B2'); // [1, 1]
const range = cellUtils.parseRange('A1:C3');
```

---

### devTools

Development tools and debugging utilities.

```javascript
import { devTools } from '@dreamlit/spreadsheet-sdk/utils';

// Enable dev mode
devTools.enable();

// Log performance
devTools.logPerformance('operation', duration);

// Inspect state
devTools.inspectState(spreadsheetData);
```

---

### templateData

Generate template spreadsheet data.

```javascript
import { templateData } from '@dreamlit/spreadsheet-sdk/utils';

const template = templateData.create('financial', {
  rows: 100,
  cols: 26
});
```

---

### testMode

Test mode utilities.

```javascript
import { testMode } from '@dreamlit/spreadsheet-sdk/utils';

testMode.enable();
testMode.mockWallet();
testMode.mockBlockchain();
```

## Usage Examples

### Circuit Breaker

```javascript
import { CircuitBreaker } from '@dreamlit/spreadsheet-sdk/utils';

const walrusBreaker = new CircuitBreaker({
  failureThreshold: 3,
  timeout: 30000,
  resetTimeout: 60000
});

async function saveToWalrus(data) {
  return await walrusBreaker.execute(async () => {
    return await walrusService.store(data);
  });
}
```

### Event Bus

```javascript
import { EventBus } from '@dreamlit/spreadsheet-sdk/utils';

// Subscribe
EventBus.on('save:start', () => console.log('Saving...'));
EventBus.on('save:success', ({ blobId }) => {
  console.log('Saved:', blobId);
});
EventBus.on('save:error', ({ error }) => {
  console.error('Save failed:', error);
});

// Emit
EventBus.emit('save:start');
EventBus.emit('save:success', { blobId: 'abc' });
```

### Explorer Links

```javascript
import { ExplorerLinks } from '@dreamlit/spreadsheet-sdk/utils';

// Generate links
const txUrl = ExplorerLinks.transaction(txDigest, 'testnet');
// https://suiscan.xyz/testnet/tx/0x...

const blobUrl = ExplorerLinks.blob(blobId, 'testnet');
// https://walrus-testnet.walrus.space/v1/abc...

// Open in new tab
window.open(txUrl, '_blank');
```

### Cell Utilities

```javascript
import { cellUtils } from '@dreamlit/spreadsheet-sdk/utils';

// Convert coordinates to cell reference
const ref = cellUtils.toCellReference(0, 0);    // 'A1'
const ref2 = cellUtils.toCellReference(1, 2);   // 'C2'

// Convert cell reference to coordinates
const [row, col] = cellUtils.fromCellReference('B3'); // [2, 1]

// Parse range
const range = cellUtils.parseRange('A1:D10');
// { start: [0, 0], end: [9, 3] }

// Iterate range
for (const cell of cellUtils.iterateRange('A1:C3')) {
  console.log(cell); // { row, col, ref }
}
```

### Telemetry

```javascript
import { Telemetry } from '@dreamlit/spreadsheet-sdk/utils';

// Track events
Telemetry.track('spreadsheet_opened', { id: spreadsheetId });
Telemetry.track('cell_edited', { cell: 'A1', value: 123 });
Telemetry.track('spreadsheet_saved', {
  blobId,
  size,
  duration,
  network: 'testnet'
});

// Track errors
Telemetry.trackError('save_failed', error, {
  context: { blobId, retryCount: 3 }
});
```

## Utility Categories

### Blockchain
- `AbiHelpers` - ABI operations
- `ExplorerLinks` - Explorer URLs

### Data Processing
- `BlobParser` - Blob parsing
- `cellUtils` - Cell operations
- `templateData` - Templates

### System
- `CircuitBreaker` - Fault tolerance
- `EventBus` - Event handling
- `Logger` - Logging
- `ConfigLoader` - Configuration

### Development
- `devTools` - Dev utilities
- `testMode` - Testing utilities
- `Telemetry` - Analytics

## Related Modules

- Used by all modules throughout SDK
- [../services/](../services/) - Services use utilities
- [../adapters/](../adapters/) - Adapters use utilities

## Notes

- Utilities provide common functionality
- Designed for reusability
- Include error handling
- Support both browser and Node.js
- Optimized for performance
