# Rate Limiting Implementation for WalSheetz

## Overview
Comprehensive rate limiting system implemented to prevent API spamming of Sui RPC and Walrus endpoints, with client-side throttling, backoff, deduplication, and caching.

## Components Implemented

### 1. Core RateLimiter Utility
- **Location**: `frontend/utils/RateLimiter.js` and `blockchain/utils/rateLimiter.js`
- **Features**:
  - Token bucket algorithm with configurable burst
  - Concurrency control
  - Exponential backoff with full jitter
  - Request deduplication by key
  - Short-TTL caching
  - Automatic 429/503 handling with Retry-After support

### 2. Configuration
- **Location**: `blockchain/config.js`
- **Settings**:
  ```javascript
  rateLimits: {
    sui: {
      maxRPS: 3,        // Max requests per second
      burst: 6,         // Burst capacity
      maxConcurrent: 4  // Max concurrent requests
    },
    walrusAggregator: {
      maxRPS: 3,
      burst: 3,
      maxConcurrent: 2
    },
    walrusPublisher: {
      maxRPS: 1,
      burst: 1,
      maxConcurrent: 1
    }
  }
  ```
- **Environment Variables**:
  - `RATE_LIMITER_ENABLED` (default: true)
  - `SUI_MAX_RPS`, `SUI_BURST`, `SUI_MAX_CONCURRENT`
  - `WALRUS_AGG_MAX_RPS`, `WALRUS_PUB_MAX_RPS`, etc.

### 3. Service Integrations

#### SuiService (`blockchain/sui-service.js`)
- Wrapped read methods: `getNetworkInfo`, `getBalance`, `getOwnedObjects`, `getUserSpreadsheets`
- Cache TTLs: 2-5 seconds for frequently accessed data
- Deduplication by address and filter parameters

#### BrowserWalrusService (`frontend/services/BrowserWalrusService.js`)
- Rate-limited `storeBlob` (publisher) and `retrieveBlob` (aggregator)
- Sequential redundancy retrieval to respect rate limits
- Cache TTLs: 5-10 seconds for blob retrieval

#### BlockchainAdapter (`frontend/adapters/BlockchainAdapter.js`)
- Write sequencing with per-spreadsheet mutex
- Debounced saves (750ms) to coalesce rapid edits
- Batch merging of up to 50 changes
- Queue management to prevent memory growth

#### WebSocket-gRPC Bridge (`blockchain/websocket-grpc-bridge.js`)
- Inbound throttling with queue length limits
- Per-client burst protection
- Transaction rate limiting for Move calls

### 4. Telemetry & Monitoring

#### RateLimiterStatus Component (`frontend/components/RateLimiterStatus.jsx`)
- Real-time metrics display
- Shows queue lengths, backoff status, cache hits
- Visual indicators for rate limit violations
- Expandable detail view with per-service metrics

## Key Features

### Token Bucket Algorithm
- Refills tokens at configured rate (maxRPS)
- Allows burst traffic up to burst limit
- Smooth traffic shaping over time

### Deduplication
- Identical concurrent requests share single Promise
- Prevents redundant API calls
- Tracks deduplication metrics

### Caching
- Short-TTL cache for read operations
- Configurable per-operation TTL
- Automatic cache expiration

### Exponential Backoff
- Base delay: 500ms
- Max delay: 30 seconds
- Full jitter to prevent thundering herd
- Honors Retry-After headers

### Write Sequencing
- Per-spreadsheet write mutex
- Debounced saves with coalescing
- Prevents overlapping version saves
- Merges multiple edits into single transaction

## Testing

### Unit Tests (`tests/unit/rateLimiter.test.js`)
- Token bucket behavior
- Concurrency limits
- Deduplication logic
- Cache expiration
- Backoff calculations
- Queue management

### Integration Tests (`tests/integration/rateLimiterIntegration.test.js`)
- Burst traffic handling
- 429 response recovery
- Sustained load performance
- Cache effectiveness

## Usage Examples

### Basic Rate Limited Call
```javascript
const limiter = new RateLimiter({
  name: 'api-limiter',
  maxRPS: 3,
  burst: 6,
  maxConcurrent: 4
});

const result = await limiter.schedule('unique-key', async () => {
  return await fetch('/api/endpoint');
}, { ttlMs: 5000 });
```

### Sequenced Saves in BlockchainAdapter
```javascript
// Rapid edits are automatically batched
await blockchainAdapter.saveToBlockchainSequenced(data1);
await blockchainAdapter.saveToBlockchainSequenced(data2);
await blockchainAdapter.saveToBlockchainSequenced(data3);
// Results in single batched save after debounce
```

## Metrics Available

- `totalRequests`: Total requests processed
- `successfulRequests`: Successful completions
- `failedRequests`: Failed requests
- `queuedRequests`: Current queue length
- `dedupedRequests`: Deduplicated requests
- `cacheHits`: Cache hit count
- `avgWaitMs`: Average queue wait time
- `backoffActive`: Currently in backoff
- `last429At`: Last rate limit timestamp

## Tuning Guidelines

### Initial Conservative Settings
- Sui reads: 3 RPS, burst 6
- Walrus reads: 3 RPS, burst 3  
- Walrus writes: 1 RPS, burst 1

### Monitoring & Adjustment
1. Monitor 429/503 responses in logs
2. Check average wait times (target < 200ms)
3. If no 429s under load, gradually increase RPS
4. Keep write rates conservative
5. Adjust burst for traffic patterns

## Implementation Benefits

1. **No API Spam**: Respects service rate limits
2. **Cost Efficiency**: Reduces redundant calls via deduplication and caching
3. **Reliability**: Automatic retry with backoff on failures
4. **Performance**: Batches writes, caches reads
5. **Observability**: Real-time metrics and logging
6. **Configurable**: Environment-based tuning
7. **Graceful Degradation**: Continues operating when services unavailable

## Future Enhancements

- [ ] Per-user rate limiting
- [ ] Adaptive rate adjustment based on error rates
- [ ] Distributed rate limiting across multiple instances
- [ ] Historical metrics persistence
- [ ] Alert thresholds for sustained backoffs