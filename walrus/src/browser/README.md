# Browser Module

Browser-compatible Walrus storage client implementation with automatic failover and health monitoring.

## Overview

This module provides the main browser entry point for the Walrus SDK, offering a fully-featured storage client optimized for web environments. It handles CORS proxy routing, rate limiting, health monitoring, and automatic retry logic.

## Exports

### Classes

#### `BrowserWalrusService`
Main service class for browser-based Walrus operations.

**Features:**
- Automatic endpoint resolution and failover
- Rate limiting with configurable burst handling
- Health monitoring with CORS degraded mode detection
- Retry queue for failed operations
- Blob storage and retrieval
- PoA certificate reading
- Blob range reading and grid streaming

**Constructor:**
```javascript
const service = new BrowserWalrusService();
// Automatically initializes with config from BlockchainConfig
```

**Key Methods:**
```javascript
// Store blob
await service.storeBlob(data, { epochs: 5 });

// Read blob
const blob = await service.readBlob(blobId);

// Get PoA certificate
const cert = await service.getPoaCertificate(blobId);

// Read blob range
const chunk = await service.readBlobRange(blobId, { start: 0, end: 1023 });

// Stream to grid
await service.streamBlobToGrid(blobId, gridSize);
```

### Singletons

#### `browserWalrusService`
Pre-initialized singleton instance for immediate use.

```javascript
import { browserWalrusService } from '@dreamlit/walrus/browser';

const result = await browserWalrusService.storeBlob(myData);
```

## Dependencies

**Internal:**
- `../config/BlockchainConfig` - Configuration management
- `../config/WalrusConfigResolver` - Endpoint resolution
- `../transports/ProxyTransport` - HTTP transport with CORS proxy
- `../client/WalrusBlobClient` - Core blob operations
- `../client/WalrusConnectionManager` - Connection state management
- `../health/HealthMonitor` - Health monitoring
- `../retry/RetryQueue` - Retry logic
- `../utils/PoACertificateReader` - PoA certificate parsing
- `../utils/BlobRangeReader` - Range reading
- `../utils/GridStreamer` - Grid streaming

**External:**
- `@mysten/walrus` - Walrus SDK integration

## Usage

### Basic Storage

```javascript
import { BrowserWalrusService } from '@dreamlit/walrus/browser';

const service = new BrowserWalrusService();

// Store data
const data = { spreadsheet: 'data' };
const result = await service.storeBlob(data, {
  epochs: 5,
  deletable: true
});
console.log('Stored at:', result.blobId);

// Retrieve data
const blob = await service.readBlob(result.blobId);
const json = await blob.json();
```

### With Singleton

```javascript
import { browserWalrusService } from '@dreamlit/walrus/browser';

// Use pre-initialized instance
const result = await browserWalrusService.storeBlob(myData);
```

### Health Monitoring

```javascript
const service = new BrowserWalrusService();

// Health monitor starts automatically
// Check connection status
const isConnected = service._connectionManager.isConnected();
const isDegraded = service._connectionManager.isDegraded();
```

## Configuration

The browser service reads configuration from `BlockchainConfig`:

```javascript
{
  walrus: {
    aggregatorUrl: 'https://aggregator.walrus-testnet.walrus.space',
    publisherUrl: 'https://publisher.walrus-testnet.walrus.space',
    features: {
      rateLimiterEnabled: true,
      sdkNetwork: 'testnet'
    },
    rateLimits: {
      walrusAggregator: { maxRPS: 3, burst: 3, maxConcurrent: 2 },
      walrusPublisher: { maxRPS: 1, burst: 1, maxConcurrent: 1 }
    }
  }
}
```

## Architecture

```
BrowserWalrusService
├── ProxyTransport (CORS handling)
├── WalrusBlobClient (blob operations)
├── WalrusConnectionManager (connection state)
├── HealthMonitor (endpoint health)
└── RetryQueue (failed operations)
```

## Related Modules

- [../client/](../client/) - Core client classes
- [../transports/](../transports/) - Transport implementations
- [../health/](../health/) - Health monitoring
- [../retry/](../retry/) - Retry logic
- [../utils/](../utils/) - Utility functions

## Notes

- Rate limiting is disabled in test environments
- Health monitor starts automatically unless in test mode
- Uses ProxyTransport for CORS proxy routing in browser
- Singleton instance (`browserWalrusService`) is exported as default
