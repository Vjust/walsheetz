# Retry Module

Retry queue management for failed Walrus operations with automatic retry logic and exponential backoff.

## Overview

This module provides a retry queue for handling failed Walrus operations, automatically retrying them with configurable backoff strategies and maximum retry limits.

## Exports

### RetryQueue

Manages queue of failed operations with automatic retry processing.

**Constructor:**
```javascript
const queue = new RetryQueue(maxSize);
```

**Parameters:**
- `maxSize` - Maximum queue size (default: 50)

**Methods:**

#### `add(operation, options)`
Add failed operation to retry queue.

```javascript
queue.add(
  async () => await storeBlob(data),
  {
    maxRetries: 3,
    backoff: 'exponential', // or 'linear', 'constant'
    initialDelay: 1000,     // ms
    maxDelay: 30000         // ms
  }
);
```

#### `start()`
Start processing retry queue.

```javascript
queue.start();
```

#### `stop()`
Stop processing retry queue.

```javascript
queue.stop();
```

#### `clear()`
Clear all pending retries.

```javascript
queue.clear();
```

#### `getStats()`
Get queue statistics.

```javascript
const stats = queue.getStats();
// { pending: 5, completed: 12, failed: 2, totalRetries: 8 }
```

## Usage

### Basic Retry Queue

```javascript
import { RetryQueue } from '@dreamlit/walrus';

const queue = new RetryQueue(50);
queue.start();

// Add failed operation
try {
  await storeBlob(data);
} catch (error) {
  queue.add(
    async () => await storeBlob(data),
    { maxRetries: 3 }
  );
}
```

### With Exponential Backoff

```javascript
const queue = new RetryQueue();

queue.add(
  async () => await walrusOperation(),
  {
    maxRetries: 5,
    backoff: 'exponential',
    initialDelay: 1000,  // 1s → 2s → 4s → 8s → 16s
    maxDelay: 30000
  }
);
```

### With Custom Retry Logic

```javascript
const queue = new RetryQueue();

queue.add(
  async () => {
    const result = await storeBlob(largeData);
    if (!result.blobId) {
      throw new Error('No blobId returned');
    }
    return result;
  },
  {
    maxRetries: 3,
    backoff: 'linear',
    initialDelay: 2000,  // 2s → 4s → 6s
    onRetry: (attempt, error) => {
      console.log(`Retry attempt ${attempt}:`, error.message);
    },
    onSuccess: (result) => {
      console.log('Operation succeeded:', result);
    },
    onFailure: (error) => {
      console.error('All retries failed:', error);
    }
  }
);
```

### Queue Management

```javascript
const queue = new RetryQueue(100);

// Start processing
queue.start();

// Add operations
for (const data of failedOperations) {
  queue.add(async () => await storeBlob(data));
}

// Monitor queue
setInterval(() => {
  const stats = queue.getStats();
  console.log(`Queue: ${stats.pending} pending, ${stats.completed} completed`);

  if (stats.pending === 0) {
    queue.stop();
  }
}, 5000);

// Clear queue if needed
if (shouldCancel) {
  queue.clear();
}
```

### Priority Queue

```javascript
const queue = new RetryQueue();

// Add high-priority operation (processed first)
queue.add(
  async () => await criticalOperation(),
  { priority: 'high', maxRetries: 5 }
);

// Add normal priority operation
queue.add(
  async () => await normalOperation(),
  { maxRetries: 3 }
);
```

## Configuration Options

```typescript
interface RetryOptions {
  maxRetries?: number;           // Max retry attempts (default: 3)
  backoff?: 'exponential' | 'linear' | 'constant'; // Backoff strategy
  initialDelay?: number;         // Initial delay in ms (default: 1000)
  maxDelay?: number;             // Max delay in ms (default: 30000)
  priority?: 'high' | 'normal' | 'low'; // Queue priority
  onRetry?: (attempt: number, error: Error) => void; // Retry callback
  onSuccess?: (result: any) => void;                 // Success callback
  onFailure?: (error: Error) => void;                // Failure callback
}
```

## Backoff Strategies

### Exponential Backoff
Delays double with each retry: 1s → 2s → 4s → 8s → 16s

```javascript
{
  backoff: 'exponential',
  initialDelay: 1000,
  maxDelay: 30000
}
```

### Linear Backoff
Delays increase linearly: 1s → 2s → 3s → 4s → 5s

```javascript
{
  backoff: 'linear',
  initialDelay: 1000
}
```

### Constant Backoff
Same delay for all retries: 1s → 1s → 1s → 1s

```javascript
{
  backoff: 'constant',
  initialDelay: 1000
}
```

## Queue Statistics

```typescript
{
  pending: number;      // Operations waiting to be retried
  processing: number;   // Operations currently being retried
  completed: number;    // Successfully completed operations
  failed: number;       // Permanently failed operations
  totalRetries: number; // Total retry attempts made
  avgRetries: number;   // Average retries per operation
}
```

## Dependencies

**Internal:**
- `../shared/Logger` - Logging
- `../shared/EventBus` - Event emission

## Events

**Emitted Events:**
- `retry-added` - Operation added to queue
- `retry-started` - Retry attempt started
- `retry-success` - Operation succeeded
- `retry-failed` - Operation permanently failed
- `queue-empty` - Queue emptied

## Related Modules

- [../browser/](../browser/) - Uses RetryQueue
- [../client/](../client/) - Operations may be queued for retry

## Notes

- Queue processes operations sequentially to avoid overload
- Exponential backoff is recommended for transient failures
- Queue persists across page reloads if using localStorage (optional)
- Maximum queue size prevents memory issues
- Failed operations are logged for debugging
