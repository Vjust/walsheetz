# Config Module

Configuration management, endpoint resolution, and blockchain configuration for the Walrus SDK.

## Overview

This module handles configuration loading, environment-specific settings, Walrus endpoint resolution with fallback logic, and blockchain configuration for Sui/Walrus integration.

## Exports

### BlockchainConfig

Central configuration management for blockchain and Walrus settings.

**Methods:**

####  `getCurrentConfig()`
Get current blockchain and Walrus configuration.

```javascript
import { getCurrentConfig } from '@dreamlit/walrus';

const config = getCurrentConfig();
// Returns:
// {
//   environment: 'testnet' | 'mainnet',
//   sui: { rpcUrl, graphqlUrl, network },
//   walrus: {
//     aggregatorUrl, publisherUrl, network,
//     features: { rateLimiterEnabled, sdkNetwork, epochsDefault }
//   }
// }
```

---

### WalrusConfigResolver

Resolve Walrus endpoints with validation and fallback support.

**Function:** `resolveWalrusEndpoints(config)`

Resolves aggregator and publisher endpoints from configuration.

```javascript
import { resolveWalrusEndpoints } from '@dreamlit/walrus';

const config = await configLoader.getConfig();
const endpoints = resolveWalrusEndpoints(config);

// Returns:
// {
//   aggregator: 'https://aggregator.walrus-testnet.walrus.space',
//   publisher: 'https://publisher.walrus-testnet.walrus.space',
//   network: 'testnet'
// }
```

**Features:**
- Environment-specific endpoint resolution
- Validation of required endpoints
- Fallback to default testnet endpoints
- Network detection (testnet/mainnet)

---

### endpointHelper

Utility functions for endpoint management and fallback logic.

**Function:** `withWalrusEndpoint(type, endpoints, operation)`

Execute operation with automatic endpoint fallback.

```javascript
import { withWalrusEndpoint } from '@dreamlit/walrus';

const result = await withWalrusEndpoint('publisher', endpoints, async (url) => {
  return await transport.putBlob(url, data, epochs);
});

// Automatically tries fallback endpoints if primary fails
```

**Parameters:**
- `type` - Endpoint type: `'aggregator'` or `'publisher'`
- `endpoints` - Endpoint configuration object
- `operation` - Async function that receives endpoint URL

**Features:**
- Automatic fallback to secondary endpoints
- Error aggregation across attempts
- Logging of fallback attempts

## Usage

### Basic Configuration

```javascript
import { getCurrentConfig } from '@dreamlit/walrus';

const config = getCurrentConfig();

console.log('Environment:', config.environment);
console.log('Sui RPC:', config.sui.rpcUrl);
console.log('Walrus Aggregator:', config.walrus.aggregatorUrl);
console.log('Walrus Publisher:', config.walrus.publisherUrl);
```

### Endpoint Resolution

```javascript
import { resolveWalrusEndpoints, getCurrentConfig } from '@dreamlit/walrus';

const config = getCurrentConfig();
const endpoints = resolveWalrusEndpoints(config);

// Use endpoints
const aggregatorUrl = `${endpoints.aggregator}/v1/${blobId}`;
const publisherUrl = `${endpoints.publisher}/v1/store?epochs=5`;
```

### With Fallback Logic

```javascript
import { withWalrusEndpoint } from '@dreamlit/walrus';

const endpoints = {
  aggregator: 'https://primary-aggregator.walrus.space',
  aggregatorFallback: 'https://secondary-aggregator.walrus.space'
};

try {
  const blob = await withWalrusEndpoint('aggregator', endpoints, async (url) => {
    const response = await fetch(`${url}/v1/${blobId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.blob();
  });

  console.log('Retrieved blob:', blob);
} catch (error) {
  console.error('All endpoints failed:', error);
}
```

### Environment-Specific Config

```javascript
import { getCurrentConfig } from '@dreamlit/walrus';

const config = getCurrentConfig();

// Testnet configuration
if (config.environment === 'testnet') {
  console.log('Using testnet endpoints');
  console.log('Aggregator:', config.walrus.aggregatorUrl);
  console.log('Publisher:', config.walrus.publisherUrl);
}

// Mainnet configuration
if (config.environment === 'mainnet') {
  console.log('Using mainnet endpoints');
  // Different endpoints for production
}
```

### Custom Configuration

```javascript
import { configLoader } from '@dreamlit/walrus';

// Override configuration
const customConfig = {
  walrus: {
    aggregatorUrl: 'https://custom-aggregator.example.com',
    publisherUrl: 'https://custom-publisher.example.com',
    network: 'testnet',
    features: {
      rateLimiterEnabled: true,
      epochsDefault: 100
    }
  },
  sui: {
    rpcUrl: 'https://custom-sui-rpc.example.com',
    network: 'testnet'
  }
};

await configLoader.loadConfig(customConfig);
```

## Configuration Schema

### Walrus Configuration

```typescript
{
  walrus: {
    aggregatorUrl: string;           // Aggregator endpoint
    publisherUrl: string;            // Publisher endpoint
    network: 'testnet' | 'mainnet';  // Network type
    features: {
      rateLimiterEnabled: boolean;   // Enable rate limiting
      sdkNetwork: string;            // SDK network (for @mysten/walrus)
      epochsDefault: number;         // Default storage epochs
    };
    rateLimits?: {
      walrusAggregator?: {
        maxRPS: number;              // Max requests per second
        burst: number;               // Burst capacity
        maxConcurrent: number;       // Max concurrent requests
      };
      walrusPublisher?: {
        maxRPS: number;
        burst: number;
        maxConcurrent: number;
      };
    };
  }
}
```

### Sui Configuration

```typescript
{
  sui: {
    rpcUrl: string;                  // Sui RPC endpoint
    graphqlUrl?: string;             // Sui GraphQL endpoint
    network: 'testnet' | 'mainnet';  // Network type
  }
}
```

## Default Endpoints

### Testnet
- **Aggregator:** `https://aggregator.walrus-testnet.walrus.space`
- **Publisher:** `https://publisher.walrus-testnet.walrus.space`
- **Sui RPC:** `https://fullnode.testnet.sui.io:443`

### Mainnet
- **Aggregator:** `https://aggregator.walrus.space`
- **Publisher:** `https://publisher.walrus.space`
- **Sui RPC:** `https://fullnode.mainnet.sui.io:443`

## Environment Variables

The SDK supports environment variable overrides:

```bash
WALRUS_AGGREGATOR_URL=https://custom-aggregator.example.com
WALRUS_PUBLISHER_URL=https://custom-publisher.example.com
SUI_RPC_URL=https://custom-sui-rpc.example.com
WALRUS_NETWORK=testnet
```

## Dependencies

**Internal:**
- `../shared/ConfigLoader` - Configuration loading
- `../shared/Logger` - Logging

## Related Modules

- [../client/](../client/) - Uses configuration for client initialization
- [../browser/](../browser/) - Uses configuration for service setup
- [../transports/](../transports/) - Uses endpoints for HTTP requests

## Notes

- Configuration is loaded once and cached
- Endpoint resolution validates required fields
- Fallback logic automatically tries secondary endpoints
- Environment variables override file-based configuration
- Default testnet endpoints are used if none specified
