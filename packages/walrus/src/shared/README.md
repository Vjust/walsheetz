# Shared Module

Shared utilities, configuration management, logging, error handling, and event bus for the Walrus SDK.

## Overview

This module contains core utilities shared across the entire Walrus SDK, including configuration loading, structured logging, event bus, rate limiting, error definitions, and network locking.

## Exports

### ConfigLoader

Centralized configuration loader with environment-specific overrides and validation.

**Instance:** `configLoader` (singleton)

**Methods:**

#### `getConfig()`
Get current configuration with environment-specific overrides.

```javascript
import { configLoader } from '@dreamlit/walrus';

const config = await configLoader.getConfig();
// Returns: { walrus, sui, environment, ... }
```

#### `loadConfig(configPath)`
Load configuration from file (Node.js only).

```javascript
await configLoader.loadConfig('./custom-config.json');
```

---

### Logger

Structured logging with configurable levels and context.

**Methods:**

```javascript
import { logger } from '@dreamlit/walrus';

logger.debug('Debug message', { context: 'data' });
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', { error });
```

**Log Levels:** `debug`, `info`, `warn`, `error`

---

### EventBus

Global event bus for SDK-wide event handling.

**Methods:**

#### `on(eventName, handler)`
Subscribe to event.

```javascript
import { eventBus } from '@dreamlit/walrus';

eventBus.on('blob-stored', ({ blobId, size }) => {
  console.log(`Stored ${blobId}, size: ${size}`);
});
```

#### `off(eventName, handler)`
Unsubscribe from event.

```javascript
eventBus.off('blob-stored', myHandler);
```

#### `emit(eventName, data)`
Emit event.

```javascript
eventBus.emit('blob-stored', { blobId: 'abc', size: 1024 });
```

#### `once(eventName, handler)`
Subscribe to event once.

```javascript
eventBus.once('initialized', () => {
  console.log('SDK initialized');
});
```

**Standard Events:**
- `blob-stored` - Blob successfully stored
- `blob-retrieved` - Blob successfully retrieved
- `connection-change` - Connection state changed
- `health-check` - Health check completed
- `rate-limit` - Rate limit encountered

---

### RateLimiter

Token bucket rate limiter with burst support and concurrency control.

**Constructor:**
```javascript
const limiter = new RateLimiter({
  name: 'walrus-publisher',
  maxRPS: 1,           // Max requests per second
  burst: 1,            // Burst capacity
  maxConcurrent: 1     // Max concurrent requests
});
```

**Methods:**

#### `acquire()`
Acquire token, wait if rate limit exceeded.

```javascript
await limiter.acquire();
// Proceed with operation
```

#### `getStats()`
Get rate limiter statistics.

```javascript
const stats = limiter.getStats();
// { tokens, waiting, concurrent, totalRequests, totalWaited }
```

**Usage:**
```javascript
import RateLimiter from '@dreamlit/walrus';

const limiter = new RateLimiter({
  name: 'api',
  maxRPS: 10,
  burst: 20,
  maxConcurrent: 5
});

// Automatically rate limited
await limiter.acquire();
await apiCall();
```

---

### errors.js

Standardized error definitions for the Walrus SDK.

**Exports:**

```javascript
import {
  WalrusError,              // Base error class
  NetworkError,             // Network failures
  ValidationError,          // Data validation errors
  StorageError,             // Storage operation errors
  ConfigurationError,       // Configuration errors
  TimeoutError,             // Operation timeouts
  RateLimitError           // Rate limit exceeded
} from '@dreamlit/walrus';
```

**Usage:**
```javascript
throw new ValidationError('Invalid blob data', { field: 'size', max: 1024 });
throw new NetworkError('Failed to connect to publisher', { url });
throw new RateLimitError('Rate limit exceeded', { retryAfter: 1000 });
```

---

### StandardizedErrorHandler

Error handler with retry logic and user-friendly messages.

**Methods:**

#### `handleError(error, context)`
Handle error with context and retry logic.

```javascript
import { standardizedErrorHandler } from '@dreamlit/walrus';

try {
  await operation();
} catch (error) {
  const handled = standardizedErrorHandler.handleError(error, {
    operation: 'storeBlob',
    blobId: 'abc123'
  });

  if (handled.shouldRetry) {
    // Retry logic
  }

  console.log(handled.userMessage); // User-friendly message
}
```

---

### NetworkLock

Network-wide locking mechanism to prevent concurrent operations.

**Methods:**

#### `acquire(lockName)`
Acquire lock, wait if already locked.

```javascript
import { networkLock } from '@dreamlit/walrus';

await networkLock.acquire('save-operation');
try {
  await saveOperation();
} finally {
  networkLock.release('save-operation');
}
```

#### `release(lockName)`
Release lock.

```javascript
networkLock.release('save-operation');
```

---

### LogConfig

Logging configuration management.

**Methods:**

```javascript
import { logConfig } from '@dreamlit/walrus';

// Set log level
logConfig.setLevel('debug'); // 'debug' | 'info' | 'warn' | 'error'

// Enable/disable logging
logConfig.setEnabled(true);

// Get current config
const config = logConfig.getConfig();
```

## Usage Examples

### Complete Configuration & Logging Setup

```javascript
import { configLoader, logger, logConfig } from '@dreamlit/walrus';

// Configure logging
logConfig.setLevel('info');

// Load config
const config = await configLoader.getConfig();

logger.info('SDK initialized', {
  environment: config.environment,
  walrusNetwork: config.walrus.network
});
```

### Event-Driven Architecture

```javascript
import { eventBus } from '@dreamlit/walrus';

// Subscribe to events
eventBus.on('blob-stored', ({ blobId, size }) => {
  console.log(`✓ Blob ${blobId} stored (${size} bytes)`);
});

eventBus.on('connection-change', ({ isConnected }) => {
  console.log(`Connection: ${isConnected ? 'online' : 'offline'}`);
});

// Emit events
eventBus.emit('blob-stored', { blobId: 'abc', size: 1024 });
```

### Rate Limiting

```javascript
import RateLimiter from '@dreamlit/walrus';

const publisherLimiter = new RateLimiter({
  name: 'publisher',
  maxRPS: 1,
  burst: 1,
  maxConcurrent: 1
});

const aggregatorLimiter = new RateLimiter({
  name: 'aggregator',
  maxRPS: 3,
  burst: 3,
  maxConcurrent: 2
});

// Rate-limited operations
async function storeBlob(data) {
  await publisherLimiter.acquire();
  return await transport.putBlob(data);
}

async function readBlob(blobId) {
  await aggregatorLimiter.acquire();
  return await transport.getBlob(blobId);
}
```

### Error Handling

```javascript
import { NetworkError, standardizedErrorHandler } from '@dreamlit/walrus';

async function robustOperation() {
  try {
    await walrusOperation();
  } catch (error) {
    if (error instanceof NetworkError) {
      console.error('Network error:', error.message);
    }

    const handled = standardizedErrorHandler.handleError(error, {
      operation: 'store',
      maxRetries: 3
    });

    if (handled.shouldRetry) {
      // Implement retry logic
      await delay(handled.retryAfter);
      return robustOperation();
    }

    throw handled;
  }
}
```

### Network Locking

```javascript
import { networkLock } from '@dreamlit/walrus';

async function criticalOperation(userId) {
  const lockName = `user-${userId}-save`;

  await networkLock.acquire(lockName);

  try {
    // Only one save per user at a time
    await saveUserData(userId);
  } finally {
    networkLock.release(lockName);
  }
}
```

## Dependencies

None (all self-contained utilities)

## Architecture

```
shared/
├── ConfigLoader - Environment-aware config management
├── Logger - Structured logging
├── EventBus - Global event system
├── RateLimiter - Token bucket rate limiting
├── errors.js - Error definitions
├── StandardizedErrorHandler - Error handling + retry logic
├── NetworkLock - Distributed locking
└── LogConfig - Logging configuration
```

## Events Reference

| Event | Data | Description |
|-------|------|-------------|
| `blob-stored` | `{ blobId, size, contentHash }` | Blob successfully stored |
| `blob-retrieved` | `{ blobId, size }` | Blob successfully retrieved |
| `connection-change` | `{ isConnected, isDegraded }` | Connection state changed |
| `health-check` | `{ status, endpoints }` | Health check completed |
| `rate-limit` | `{ limiter, waited }` | Rate limit encountered |

## Related Modules

- All modules use shared utilities
- [../client/](../client/) - Uses ConfigLoader, Logger, errors
- [../browser/](../browser/) - Uses EventBus, RateLimiter
- [../transports/](../transports/) - Uses RateLimiter

## Notes

- ConfigLoader supports environment variables and file-based config
- Logger automatically includes timestamps and context
- EventBus is global singleton - use for cross-module communication
- RateLimiter uses token bucket algorithm with burst support
- StandardizedErrorHandler provides user-friendly error messages
- NetworkLock prevents race conditions in concurrent operations
