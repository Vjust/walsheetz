# Health Module

Health monitoring for Walrus endpoints with automatic health checks and degraded mode detection.

## Overview

This module provides health monitoring functionality for Walrus aggregator and publisher endpoints, detecting service availability and CORS issues to enable degraded mode operation.

## Exports

### HealthMonitor

Monitors Walrus endpoint health with periodic checks and connection state management.

**Constructor:**
```javascript
const monitor = new HealthMonitor(endpoints, transport, connectionManager);
```

**Parameters:**
- `endpoints` - Walrus endpoint configuration
- `transport` - Transport instance (Direct or Proxy)
- `connectionManager` - WalrusConnectionManager instance

**Methods:**

#### `start(intervalMs)`
Start periodic health checks.

```javascript
monitor.start(30000); // Check every 30 seconds
```

#### `stop()`
Stop health monitoring.

```javascript
monitor.stop();
```

#### `checkHealth()`
Perform immediate health check.

```javascript
const health = await monitor.checkHealth();
// Returns:
// {
//   aggregator: { healthy: true, responseTime: 123, error: null },
//   publisher: { healthy: true, responseTime: 456, error: null },
//   overall: 'healthy' | 'degraded' | 'unhealthy'
// }
```

**Health States:**
- `healthy` - All endpoints responding
- `degraded` - CORS issues detected, using proxy mode
- `unhealthy` - Endpoints not responding

## Usage

### Basic Health Monitoring

```javascript
import { HealthMonitor } from '@dreamlit/walrus';
import { WalrusConnectionManager } from '@dreamlit/walrus';
import { ProxyTransport } from '@dreamlit/walrus';

const endpoints = {
  aggregator: 'https://aggregator.walrus-testnet.walrus.space',
  publisher: 'https://publisher.walrus-testnet.walrus.space'
};

const transport = new ProxyTransport();
const connectionManager = new WalrusConnectionManager();

const monitor = new HealthMonitor(endpoints, transport, connectionManager);

// Start monitoring (checks every 30 seconds)
monitor.start(30000);

// Check health manually
const health = await monitor.checkHealth();
console.log('Aggregator:', health.aggregator.healthy ? '✓' : '✗');
console.log('Publisher:', health.publisher.healthy ? '✓' : '✗');
console.log('Overall status:', health.overall);
```

### With Event Handling

```javascript
import { HealthMonitor } from '@dreamlit/walrus';
import { eventBus } from '@dreamlit/walrus';

const monitor = new HealthMonitor(endpoints, transport, connectionManager);

// Listen for health check events
eventBus.on('health-check', ({ health }) => {
  if (health.overall === 'degraded') {
    console.warn('Degraded mode: CORS issues detected');
  } else if (health.overall === 'unhealthy') {
    console.error('Walrus endpoints unhealthy');
  }
});

monitor.start();
```

### Degraded Mode Detection

```javascript
import { HealthMonitor } from '@dreamlit/walrus';

const monitor = new HealthMonitor(endpoints, transport, connectionManager);

const health = await monitor.checkHealth();

if (health.overall === 'degraded') {
  // CORS issues detected
  console.log('Switching to proxy mode');

  // Connection manager automatically tracks degraded state
  if (connectionManager.isDegraded) {
    // Use proxy transport
    // Queue operations if needed
  }
}
```

### Manual Health Checks

```javascript
const monitor = new HealthMonitor(endpoints, transport, connectionManager);

// Check before critical operation
const health = await monitor.checkHealth();

if (health.aggregator.healthy && health.publisher.healthy) {
  // Proceed with operation
  await storeBlob(data);
} else {
  // Handle unhealthy state
  console.error('Walrus endpoints unavailable');

  if (health.aggregator.error) {
    console.error('Aggregator error:', health.aggregator.error);
  }
  if (health.publisher.error) {
    console.error('Publisher error:', health.publisher.error);
  }
}
```

### Response Time Monitoring

```javascript
const monitor = new HealthMonitor(endpoints, transport, connectionManager);

monitor.start(10000); // Check every 10 seconds

// Monitor response times
eventBus.on('health-check', ({ health }) => {
  console.log('Aggregator response time:', health.aggregator.responseTime, 'ms');
  console.log('Publisher response time:', health.publisher.responseTime, 'ms');

  if (health.aggregator.responseTime > 5000) {
    console.warn('Slow aggregator response');
  }
});
```

## Health Check Details

### Check Process
1. Sends HEAD request to aggregator endpoint
2. Sends HEAD request to publisher endpoint
3. Measures response times
4. Detects CORS errors
5. Updates connection manager state
6. Emits health-check event

### Degraded Mode Triggers
- `Failed to fetch` errors
- `NetworkError` errors
- `CORS` errors
- `ERR_NAME_NOT_RESOLVED` errors

### Health Check Result

```typescript
{
  aggregator: {
    healthy: boolean;
    responseTime: number; // milliseconds
    error: string | null;
  };
  publisher: {
    healthy: boolean;
    responseTime: number;
    error: string | null;
  };
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
}
```

## Dependencies

**Internal:**
- `../client/WalrusConnectionManager` - Connection state
- `../transports/Transport` - HTTP transport
- `../shared/EventBus` - Event emission

## Events

**Emitted Events:**
- `health-check` - Health check completed
  ```javascript
  {
    health: {
      aggregator: { healthy, responseTime, error },
      publisher: { healthy, responseTime, error },
      overall: 'healthy' | 'degraded' | 'unhealthy'
    }
  }
  ```

## Related Modules

- [../client/](../client/) - WalrusConnectionManager
- [../browser/](../browser/) - Uses HealthMonitor
- [../transports/](../transports/) - Transport implementations

## Notes

- Health monitoring starts automatically in BrowserWalrusService
- Checks run periodically in background (default: 30 seconds)
- CORS errors trigger degraded mode in connection manager
- Health checks use lightweight HEAD requests
- Monitor can be stopped/started as needed
