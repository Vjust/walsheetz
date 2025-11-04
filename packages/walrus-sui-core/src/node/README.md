# Node Module

Node.js-specific entry point for @dreamlit/walrus-sui-core with CLI compatibility and direct endpoint access.

## Overview

This module provides Node.js-optimized services for server-side and CLI applications, using direct HTTP connections without proxy routing.

## Exports

```javascript
import {
  NodeWalrusService,
  suiService
} from '@dreamlit/walrus-sui-core/node';
```

### NodeWalrusService
Node.js Walrus service with direct endpoint access.

### suiService
Sui blockchain service for Node.js.

## Usage

### Server-side Operations

```javascript
import { NodeWalrusService, suiService } from '@dreamlit/walrus-sui-core/node';

// Store blob
const walrusService = new NodeWalrusService();
const result = await walrusService.storeBlob(data, { epochs: 5 });

// Query blockchain
const balance = await suiService.getBalance(address);
```

### CLI Application

```javascript
#!/usr/bin/env node
import { NodeWalrusService } from '@dreamlit/walrus-sui-core/node';

const service = new NodeWalrusService();

const blobId = process.argv[2];
const data = await service.readBlob(blobId);

console.log(JSON.stringify(data, null, 2));
```

### API Server

```javascript
import express from 'express';
import { NodeWalrusService, suiService } from '@dreamlit/walrus-sui-core/node';

const app = express();
const walrus = new NodeWalrusService();

app.post('/store', async (req, res) => {
  const result = await walrus.storeBlob(req.body);
  res.json(result);
});

app.listen(3000);
```

## Features

- Direct endpoint access (no proxy)
- CLI-compatible
- Server-side optimized
- Full blockchain integration

## Dependencies

**Internal:**
- `../blockchain/` - Blockchain services
- `@dreamlit/walrus` - Walrus storage

**External:**
- `@mysten/sui` - Sui SDK
- `undici` - Fetch polyfill (Node.js < 18)

## Related Modules

- [../browser/](../browser/) - Browser entry point
- [../blockchain/](../blockchain/) - Blockchain services
- [../cli/](../cli/) - CLI tools

## Notes

- Uses DirectTransport for better performance
- No CORS restrictions in Node.js
- Requires undici for Node.js < 18
- Ideal for servers, CLIs, and batch processing
