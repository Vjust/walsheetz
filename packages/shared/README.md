# @dreamlit/shared

Shared utilities for Dreamlit Walrus SDK packages. This package provides common functionality used across all SDK packages, including logging, configuration, event handling, network utilities, and TypeScript types.

## Installation

```bash
bun add @dreamlit/shared
```

## Features

### Types

Common TypeScript types and utilities:

```typescript
import { Result, ok, err, AsyncResult } from '@dreamlit/shared/types'

async function fetchData(): AsyncResult<Data, Error> {
  try {
    const data = await fetch('/api/data')
    return ok(data)
  } catch (error) {
    return err(error)
  }
}
```

### Logging

Unified logging interface:

```typescript
import { createLogger } from '@dreamlit/shared/logging'

const logger = createLogger({
  level: 'info',
  prefix: 'my-service',
})

logger.info('Service started', { port: 3000 })
logger.error('Failed to connect', error, { retries: 3 })
```

### Events

Type-safe event emitter:

```typescript
import { createEventEmitter } from '@dreamlit/shared/events'

interface MyEvents {
  connected: { timestamp: number }
  error: { error: Error }
}

const emitter = createEventEmitter<MyEvents>()

emitter.on('connected', (data) => {
  console.log('Connected at', data.timestamp)
})

await emitter.emit('connected', { timestamp: Date.now() })
```

### Configuration

Configuration loading and validation:

```typescript
import { createEnvLoader, createValidator } from '@dreamlit/shared/config'

interface AppConfig {
  API_KEY: string
  PORT: number
}

const loader = createEnvLoader<AppConfig>({
  envPrefix: 'APP_',
  defaults: { PORT: 3000 },
  transformers: {
    PORT: (value) => parseInt(value, 10),
  },
})

const validator = createValidator<AppConfig>({
  required: ['API_KEY'],
  types: {
    PORT: (value) => typeof value === 'number',
  },
})

const config = loader.load()
const validation = validator.validate(config)
```

### Network

Retry logic, rate limiting, and concurrency control:

```typescript
import {
  retry,
  createRateLimiter,
  createConcurrencyLimiter,
  withTimeout,
} from '@dreamlit/shared/network'

// Retry with exponential backoff
const result = await retry(() => fetchData(), {
  maxAttempts: 3,
  initialDelay: 1000,
  backoffMultiplier: 2,
})

// Rate limiting
const limiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 1000,
})

await limiter.acquire()
await makeRequest()

// Concurrency limiting
const concurrency = createConcurrencyLimiter(5)

await concurrency.execute(() => heavyOperation())
```

## Package Exports

All submodules are exported via package exports:

- `@dreamlit/shared` - All exports
- `@dreamlit/shared/types` - TypeScript types and utilities
- `@dreamlit/shared/logging` - Logging utilities
- `@dreamlit/shared/events` - Event emitter
- `@dreamlit/shared/config` - Configuration management
- `@dreamlit/shared/network` - Network utilities

## Design Principles

- **Zero dependencies**: No external runtime dependencies
- **Tree-shakeable**: Modular exports for optimal bundle size
- **Type-safe**: Full TypeScript support with generated type definitions
- **Side-effect free**: Can be safely imported without side effects

## License

MIT
