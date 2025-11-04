# @dreamlit/walrus

Walrus decentralized storage adapter for browser and Node.js environments.

## Features

- ✅ Store and retrieve data on Walrus decentralized storage
- ✅ Browser and Node.js support (with polyfills)
- ✅ Health monitoring and endpoint failover
- ✅ Automatic retry with exponential backoff
- ✅ Rate limiting and circuit breaker patterns
- ✅ Blob range reading and streaming
- ✅ PoA (Proof of Availability) certificate support
- ✅ TypeScript definitions

## Installation

```bash
npm install @dreamlit/walrus
# or
yarn add @dreamlit/walrus
# or
bun add @dreamlit/walrus
```

## Quick Start

### Browser Usage

```typescript
import { BrowserWalrusService } from '@dreamlit/walrus';

// Initialize service
const walrusService = new BrowserWalrusService();

// Store data
const blob = new Blob(['Hello Walrus!'], { type: 'text/plain' });
const result = await walrusService.store(blob, {
  epochs: 5
});
console.log('Stored at blob ID:', result.blobId);

// Retrieve data
const retrieved = await walrusService.read(result.blobId);
console.log('Retrieved:', await retrieved.text());
```

### Node.js Usage

```typescript
import { WalrusService } from '@dreamlit/walrus/node';

// Same API as browser
const walrusService = new WalrusService();
const result = await walrusService.store(
  Buffer.from('Hello from Node.js!'),
  { epochs: 5 }
);
```

## Configuration

The service reads configuration from `/app-config.json` by default:

```json
{
  "walrus": {
    "aggregatorUrl": "https://aggregator.walrus-testnet.walrus.space",
    "publisherUrl": "https://publisher.walrus-testnet.walrus.space",
    "network": "testnet",
    "rateLimitPerMinute": 60
  }
}
```

You can also provide config programmatically:

```typescript
import { WalrusConfigResolver } from '@dreamlit/walrus';

const config = new WalrusConfigResolver({
  aggregatorUrl: 'https://your-aggregator.com',
  publisherUrl: 'https://your-publisher.com'
});
```

## Advanced Usage

### Health Monitoring

```typescript
import { HealthMonitor } from '@dreamlit/walrus';

const monitor = new HealthMonitor();
await monitor.start();

monitor.on('health-check', (result) => {
  console.log('Health:', result.healthy);
});
```

### Custom Transport

```typescript
import { DirectTransport, ProxyTransport } from '@dreamlit/walrus';

// Use direct transport (default)
const directTransport = new DirectTransport(config);

// Or use proxy transport
const proxyTransport = new ProxyTransport(proxyUrl);
```

### Retry Queue

```typescript
import { RetryQueue } from '@dreamlit/walrus';

const queue = new RetryQueue({
  maxRetries: 3,
  backoffMultiplier: 2
});

await queue.enqueue(async () => {
  return await walrusService.store(blob);
});
```

## API Reference

### BrowserWalrusService / WalrusService

Main service class for interacting with Walrus storage.

#### Methods

- `store(data: Blob | Buffer, options?: StoreOptions): Promise<StoreResult>`
  - Store data on Walrus
  - Options: `{ epochs?: number }`
  - Returns: `{ blobId: string, metadata: object }`

- `read(blobId: string): Promise<Blob>`
  - Retrieve data from Walrus
  - Returns: Blob containing the stored data

- `getBlobMetadata(blobId: string): Promise<Metadata>`
  - Get metadata for a stored blob
  - Returns: Metadata including size, certifiedEpoch, etc.

- `connect(): Promise<boolean>`
  - Test connection to Walrus endpoints
  - Returns: true if connection successful

### WalrusBlobClient

Low-level client for direct Walrus API interactions.

### HealthMonitor

Monitors Walrus endpoint health and provides automatic failover.

### RetryQueue

Manages retry logic with exponential backoff.

## Node.js Compatibility

For Node.js environments, install the `undici` polyfill:

```bash
npm install undici
```

The package will automatically use `undici` for fetch operations in Node.js.

## TypeScript Support

The package includes TypeScript definitions:

```typescript
import type {
  StoreOptions,
  StoreResult,
  WalrusConfig
} from '@dreamlit/walrus';
```

## License

MIT

## Links

- [Walrus Documentation](https://docs.walrus.site)
- [Sui Documentation](https://docs.sui.io)
- [GitHub Repository](https://github.com/dreamlit/dreamlit-sdks)
