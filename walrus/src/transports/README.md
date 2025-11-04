# Transports Module

HTTP transport layer for Walrus storage operations with support for direct connections and CORS proxy routing.

## Overview

This module provides transport implementations for communicating with Walrus aggregator and publisher endpoints. It handles HTTP requests, rate limiting, and environment-specific routing (direct in Node.js, proxy in browser when CORS is an issue).

## Exports

### Transport (Base Class)

Abstract base class defining the transport interface.

**Methods:**
```javascript
async putBlob(url, data, epochs) // Store blob
async getBlob(url) // Retrieve blob
```

---

### DirectTransport

Direct HTTP transport for Node.js environments or browsers without CORS restrictions.

**Constructor:**
```javascript
const transport = new DirectTransport(limiters);
```

**Parameters:**
- `limiters` - Optional rate limiter instances `{ walrusAgg, walrusPub }`

**Features:**
- Direct fetch() calls to Walrus endpoints
- No proxy intermediary
- Rate limiting support
- Blob metadata parsing
- Error handling with retries

**Methods:**

#### `putBlob(url, data, epochs)`
Store blob directly to Walrus publisher.

```javascript
const result = await transport.putBlob(publisherUrl, blobData, 5);
// { blobId: 'abc123...', metadata: {...} }
```

#### `getBlob(url)`
Retrieve blob directly from Walrus aggregator.

```javascript
const blob = await transport.getBlob(aggregatorUrl);
// Returns Response object
```

---

### ProxyTransport

CORS-aware transport that routes requests through API proxy in browser environments.

**Constructor:**
```javascript
const transport = new ProxyTransport(limiters);
```

**Parameters:**
- `limiters` - Optional rate limiter instances `{ walrusAgg, walrusPub }`

**Features:**
- Automatic proxy routing (`/api/walrus-agg-proxy`, `/api/walrus-pub-proxy`)
- CORS workaround for browser environments
- Rate limiting support
- Same API as DirectTransport

**Methods:**

#### `putBlob(url, data, epochs)`
Store blob via proxy.

```javascript
const result = await transport.putBlob(publisherUrl, blobData, 5);
// Automatically routes through /api/walrus-pub-proxy
```

#### `getBlob(url)`
Retrieve blob via proxy.

```javascript
const blob = await transport.getBlob(aggregatorUrl);
// Automatically routes through /api/walrus-agg-proxy
```

## Usage

### Direct Transport (Node.js)

```javascript
import { DirectTransport } from '@dreamlit/walrus';

const transport = new DirectTransport();

// Store blob
const result = await transport.putBlob(
  'https://publisher.walrus-testnet.walrus.space',
  blobData,
  5 // epochs
);

// Retrieve blob
const blob = await transport.getBlob(
  `https://aggregator.walrus-testnet.walrus.space/v1/${blobId}`
);
```

### Proxy Transport (Browser)

```javascript
import { ProxyTransport } from '@dreamlit/walrus/browser';

const transport = new ProxyTransport();

// Same API, but routes through proxy
const result = await transport.putBlob(publisherUrl, blobData, 5);
const blob = await transport.getBlob(aggregatorUrl);

// Proxy routing:
// publisherUrl -> /api/walrus-pub-proxy?url=...
// aggregatorUrl -> /api/walrus-agg-proxy?url=...
```

### With Rate Limiting

```javascript
import { ProxyTransport } from '@dreamlit/walrus/browser';
import RateLimiter from '@dreamlit/walrus';

const limiters = {
  walrusAgg: new RateLimiter({
    name: 'walrus-aggregator',
    maxRPS: 3,
    burst: 3,
    maxConcurrent: 2
  }),
  walrusPub: new RateLimiter({
    name: 'walrus-publisher',
    maxRPS: 1,
    burst: 1,
    maxConcurrent: 1
  })
};

const transport = new ProxyTransport(limiters);

// Rate limiting applied automatically
await transport.putBlob(publisherUrl, blobData, 5);
```

## API Comparison

| Feature | DirectTransport | ProxyTransport |
|---------|----------------|----------------|
| Environment | Node.js, CORS-free browsers | Browser with CORS issues |
| Routing | Direct to Walrus | Via `/api/walrus-*-proxy` |
| Rate Limiting | ✓ | ✓ |
| Error Handling | ✓ | ✓ |
| Metadata Parsing | ✓ | ✓ |

## Proxy Routing

ProxyTransport rewrites URLs:

```
Original: https://publisher.walrus-testnet.walrus.space/v1/store?epochs=5
Proxied:  /api/walrus-pub-proxy?url=https://publisher.walrus-testnet.walrus.space/v1/store?epochs=5

Original: https://aggregator.walrus-testnet.walrus.space/v1/abc123...
Proxied:  /api/walrus-agg-proxy?url=https://aggregator.walrus-testnet.walrus.space/v1/abc123...
```

## Dependencies

**Internal:**
- `../shared/RateLimiter` - Rate limiting

**External:**
- `fetch` API (built-in or polyfilled)

## Error Handling

Both transports throw errors for:
- Network failures
- HTTP errors (status >= 400)
- Rate limit exceeded
- Invalid responses

```javascript
try {
  await transport.putBlob(url, data, epochs);
} catch (error) {
  if (error.message.includes('Failed to fetch')) {
    // Network error
  } else if (error.status === 429) {
    // Rate limited
  }
}
```

## Related Modules

- [../client/](../client/) - Uses transports for blob operations
- [../browser/](../browser/) - Uses ProxyTransport
- [../shared/](../shared/) - RateLimiter implementation

## Notes

- ProxyTransport is used by BrowserWalrusService for CORS compatibility
- DirectTransport is used by NodeWalrusService for direct connections
- Rate limiting is optional but recommended for production
- Both transports support the same API for easy swapping
