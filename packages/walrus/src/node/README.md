# Node Module

Node.js-specific Walrus service implementation with direct endpoint access and no CORS restrictions.

## Overview

This module provides a Node.js-optimized Walrus service implementation that uses direct HTTP connections without proxy routing, suitable for server-side and CLI applications.

## Exports

### NodeWalrusService

Node.js-specific Walrus service (when available - currently shares browser implementation).

**Note:** The current implementation uses the same service as BrowserWalrusService but with DirectTransport for direct endpoint access.

**Usage:**
```javascript
import { nodeWalrusService } from '@dreamlit/walrus/node';

// Use service directly
const result = await nodeWalrusService.storeBlob(data, { epochs: 5 });
const blob = await nodeWalrusService.readBlob(result.blobId);
```

## Features

- **Direct Connections:** No proxy routing, direct HTTP to Walrus endpoints
- **No CORS Issues:** Server-side execution bypasses browser CORS restrictions
- **Performance:** Lower latency without proxy intermediary
- **Compatible API:** Same interface as BrowserWalrusService

## Usage

### Basic Node.js Storage

```javascript
import { nodeWalrusService } from '@dreamlit/walrus/node';

async function main() {
  // Store data
  const data = {
    spreadsheet: 'My Data',
    cells: [[1, 2, 3], [4, 5, 6]]
  };

  const result = await nodeWalrusService.storeBlob(data, {
    epochs: 5
  });

  console.log('Stored at:', result.blobId);

  // Retrieve data
  const retrieved = await nodeWalrusService.readBlob(result.blobId);
  console.log('Retrieved:', retrieved);
}

main().catch(console.error);
```

### CLI Application

```javascript
#!/usr/bin/env node
import { nodeWalrusService } from '@dreamlit/walrus/node';
import fs from 'fs';

const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'store': {
    const data = JSON.parse(fs.readFileSync(arg, 'utf8'));
    const result = await nodeWalrusService.storeBlob(data, { epochs: 5 });
    console.log('Blob ID:', result.blobId);
    break;
  }

  case 'read': {
    const blob = await nodeWalrusService.readBlob(arg);
    console.log(JSON.stringify(blob, null, 2));
    break;
  }

  default:
    console.log('Usage: store <file> | read <blobId>');
}
```

### Server-side Integration

```javascript
import express from 'express';
import { nodeWalrusService } from '@dreamlit/walrus/node';

const app = express();
app.use(express.json());

// Store endpoint
app.post('/api/store', async (req, res) => {
  try {
    const result = await nodeWalrusService.storeBlob(req.body, {
      epochs: 5
    });

    res.json({
      success: true,
      blobId: result.blobId,
      contentHash: result.contentHash
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read endpoint
app.get('/api/read/:blobId', async (req, res) => {
  try {
    const data = await nodeWalrusService.readBlob(req.params.blobId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Walrus API server running on port 3000');
});
```

### With undici (Fetch Polyfill)

```javascript
// For Node.js < 18 (fetch not available)
import { fetch } from 'undici';
globalThis.fetch = fetch;

import { nodeWalrusService } from '@dreamlit/walrus/node';

// Now service can use fetch
const result = await nodeWalrusService.storeBlob(data);
```

## Differences from Browser

| Feature | Node Service | Browser Service |
|---------|-------------|-----------------|
| Transport | DirectTransport | ProxyTransport |
| CORS | No restrictions | Proxy required |
| Endpoints | Direct URLs | Proxied URLs |
| Performance | Lower latency | Higher latency (proxy) |
| Environment | Server/CLI | Browser |

## Configuration

Uses the same configuration as browser service:

```javascript
import { getCurrentConfig } from '@dreamlit/walrus';

const config = getCurrentConfig();
// {
//   walrus: {
//     aggregatorUrl: 'https://aggregator.walrus-testnet.walrus.space',
//     publisherUrl: 'https://publisher.walrus-testnet.walrus.space'
//   }
// }
```

## Dependencies

**Internal:**
- Same as browser service
- Uses `DirectTransport` instead of `ProxyTransport`

**External:**
- `fetch` API (Node.js 18+ or undici polyfill)

## Environment Setup

### Node.js 18+
```bash
# Fetch API built-in
node app.js
```

### Node.js < 18
```bash
# Install undici for fetch polyfill
npm install undici

# Use in code
import { fetch } from 'undici';
globalThis.fetch = fetch;
```

## Related Modules

- [../browser/](../browser/) - Browser service implementation
- [../client/](../client/) - Core client classes
- [../transports/](../transports/) - DirectTransport used

## Notes

- Node service uses DirectTransport for better performance
- No CORS proxy needed in server environments
- Compatible API with browser service for easy code sharing
- Supports all Node.js LTS versions (with fetch polyfill if needed)
- Ideal for CLI tools, serverside APIs, and batch processing
