# Debug & Logging Guide

Comprehensive guide to debugging and logging in WalSheetz.

## Table of Contents

- [Logging System](#logging-system)
- [Log Levels](#log-levels)
- [Using the Logger](#using-the-logger)
- [Debug Scripts](#debug-scripts)
- [VSCode Debugging](#vscode-debugging)
- [Common Debugging Scenarios](#common-debugging-scenarios)
- [Troubleshooting](#troubleshooting)

---

## Logging System

WalSheetz uses a centralized logging system defined in `packages/shared/src/logging/index.ts` and `scripts/utils/logger.js`.

### Features

- **Structured Logging**: JSON-formatted metadata for easy parsing
- **Log Levels**: DEBUG, INFO, WARN, ERROR, CRITICAL
- **Context Support**: Child loggers with inherited context
- **Timestamp Formatting**: ISO 8601 timestamps
- **Color-coded Output**: Terminal-friendly ANSI colors
- **Environment-aware**: Auto-detects TTY for color support
- **Throttling**: Built-in log throttling to prevent spam

---

## Log Levels

### Available Levels

| Level | Numeric Value | Use Case | Example |
|-------|---------------|----------|---------|
| **DEBUG** | 0 | Detailed diagnostic info | Variable values, function entries |
| **INFO** | 1 | General informational messages | Service started, request completed |
| **WARN** | 2 | Warning conditions | Deprecated usage, recoverable errors |
| **ERROR** | 3 | Error conditions | Failed operations, exceptions |
| **CRITICAL** | 4 | Critical failures | System crashes, unrecoverable errors |

### Setting Log Level

```bash
# Environment variable (scripts/bridge)
export BRIDGE_LOG_LEVEL=DEBUG
export LOG_LEVEL=INFO

# In code
const logger = createLogger('ComponentName', { logLevel: 'DEBUG' });
```

---

## Using the Logger

### Node/Bun Scripts

```javascript
import { createLogger } from './utils/logger.js';

const logger = createLogger('MyScript', {
  logLevel: 'INFO',      // Minimum level to log
  useColors: true,       // Enable ANSI colors
  useEmojis: true,       // Enable emoji indicators
  timestamps: true       // Include timestamps
});

// Basic logging
logger.debug('Detailed debug info');
logger.info('Informational message');
logger.warn('Warning message');
logger.error('Error occurred');
logger.critical('Critical failure');

// With metadata
logger.info('User logged in', {
  userId: '12345',
  timestamp: Date.now(),
  ip: '192.168.1.1'
});

// Throttled logging (prevents spam)
logger.throttleWarn('high-frequency-event', 'This happens often', {
  count: eventCount
}, 30000); // Log at most once per 30 seconds
```

### Package Code (TypeScript)

```typescript
import { createLogger } from '@dreamlit/shared/logging';

const logger = createLogger('ServiceName');

class MyService {
  constructor() {
    logger.info('Service initialized');
  }

  async doSomething() {
    logger.debug('Starting operation');

    try {
      // ... operation
      logger.info('Operation completed successfully', {
        duration: Date.now() - start
      });
    } catch (error) {
      logger.error('Operation failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}
```

### Frontend Code

```javascript
// Import the shared logger
import { createLogger } from '@dreamlit/shared/logging';

const logger = createLogger('ComponentName');

// In React components
function MyComponent() {
  useEffect(() => {
    logger.info('Component mounted');

    return () => {
      logger.debug('Component unmounting');
    };
  }, []);

  const handleAction = () => {
    logger.debug('Action triggered', { action: 'save' });
    // ... handle action
  };

  return <div>...</div>;
}
```

### Child Loggers with Context

```javascript
const mainLogger = createLogger('MainService');
const childLogger = mainLogger.child({ requestId: '123' });

mainLogger.info('Processing request');
// Output: INFO [MainService] Processing request

childLogger.info('Request validated');
// Output: INFO [MainService] Request validated | {"requestId":"123"}
```

---

## Debug Scripts

### Available Debug Commands

```bash
# Start bridge with debug logging
bun run debug:bridge

# Start frontend with debug logging
bun run debug:frontend

# Start both with debug logging
bun run debug:full

# Run tests with debug output
DEBUG=* bun test

# Run specific test with debug
DEBUG=* bun test path/to/test.test.js
```

### Environment Variables

```bash
# Bridge server
BRIDGE_LOG_LEVEL=DEBUG      # Log level for bridge
NODE_ENV=development        # Environment mode

# Frontend
VITE_DEBUG=true             # Enable Vite debug output
DEBUG=*                     # Enable all debug namespaces

# Custom debug namespaces
DEBUG=walrus:*              # Only Walrus-related debug
DEBUG=sui:*,walrus:*        # Multiple namespaces
```

---

## VSCode Debugging

### Launch Configurations

Press **F5** or use the Debug panel to select a configuration:

#### 1. Debug Bridge Server

Starts the bridge server with debugger attached.

**Configuration:**
- Breakpoints work in bridge code
- Console output visible in Debug Console
- Environment: `NODE_ENV=development`, `BRIDGE_LOG_LEVEL=DEBUG`

#### 2. Debug Frontend (Vite)

Launches Chrome with frontend debugger.

**Configuration:**
- Breakpoints work in frontend code
- Source maps enabled
- Opens `http://localhost:3000`

#### 3. Debug Current Test File

Debugs the currently open test file.

**Usage:**
1. Open a test file (*.test.js)
2. Press **F5**
3. Breakpoints in test code will pause execution

#### 4. Debug Full Stack

Runs both bridge and frontend debuggers simultaneously.

**Usage:**
- Debug both services at once
- Switch between debugger sessions in VS Code

### Setting Breakpoints

```javascript
// Add breakpoint by clicking left of line number

function complexFunction(data) {
  debugger; // Programmatic breakpoint

  const result = processData(data);
  return result;
}
```

---

## Common Debugging Scenarios

### 1. Bridge Server Not Responding

```bash
# Check if bridge is running
curl http://localhost:3005/health

# Start bridge with debug logging
bun run debug:bridge

# Check logs
tail -f logs/bridge.log  # If logging to file

# Check port availability
lsof -i :3005
```

### 2. Frontend Save Failures

```javascript
// Add logging to save flow
logger.debug('Starting save operation', {
  spreadsheetId,
  walletAddress,
  dataSize: JSON.stringify(data).length
});

try {
  const result = await saveToBlockchain(data);
  logger.info('Save successful', { txId: result.txId });
} catch (error) {
  logger.error('Save failed', {
    error: error.message,
    stack: error.stack,
    data: JSON.stringify(data).substring(0, 100)
  });
}
```

### 3. Walrus Storage Issues

```bash
# Check Walrus publisher health
curl -i https://publisher.walrus-testnet.walrus.space/v1/api

# Debug storage service
DEBUG=walrus:* bun run dev

# Test storage directly
bun run scripts/test-walrus-connection.js
```

### 4. Transaction Failures

```javascript
// Log transaction details
logger.debug('Submitting transaction', {
  gasPrice,
  gasLimit,
  recipient,
  amount
});

const tx = await suiClient.signAndExecuteTransaction({...});

logger.info('Transaction submitted', {
  digest: tx.digest,
  status: tx.effects.status
});
```

### 5. GraphQL Subscription Issues

```javascript
// Debug GraphQL subscriptions
logger.debug('Starting GraphQL subscription', {
  endpoint,
  query: query.loc.source.body
});

subscription.on('data', (data) => {
  logger.debug('Subscription data received', { data });
});

subscription.on('error', (error) => {
  logger.error('Subscription error', {
    error: error.message,
    endpoint
  });
});
```

---

## Troubleshooting

### No Logs Appearing

```bash
# Check log level
echo $BRIDGE_LOG_LEVEL
echo $LOG_LEVEL

# Force debug level
BRIDGE_LOG_LEVEL=DEBUG bun run dev:bridge

# Check if logger is imported correctly
grep -r "createLogger" path/to/file.js
```

### Too Many Logs

```javascript
// Use throttling
logger.throttleInfo('frequent-event', 'Event occurred', {}, 30000);

// Increase log level
export LOG_LEVEL=WARN  # Only warnings and errors

// Disable debug logs
logger.debug = () => {};  // Temporary
```

### Logs Not Structured

```javascript
// Bad: String concatenation
logger.info('User ' + userId + ' logged in');

// Good: Structured metadata
logger.info('User logged in', { userId });
```

### Colors Not Showing

```bash
# Force color output
export FORCE_COLOR=1

# Check TTY
tty  # Should output a device path

# Disable colors if needed
const logger = createLogger('Name', { useColors: false });
```

---

## Log Aggregation

### Browser Console

All frontend logs appear in browser console:

```javascript
// Filter by component
// In Chrome DevTools: Filter: [ComponentName]

// Log objects for inspection
logger.debug('State dump', { state: complexObject });
```

### File Logging (Optional)

```javascript
// Redirect to file (Node/Bun)
import fs from 'fs';

const logStream = fs.createWriteStream('logs/app.log', { flags: 'a' });

console.log = (msg) => {
  logStream.write(msg + '\n');
  process.stdout.write(msg + '\n');
};
```

---

## Best Practices

### 1. Use Appropriate Log Levels

```javascript
// DEBUG: Verbose diagnostic info
logger.debug('Function entry', { args });

// INFO: Important business events
logger.info('User authenticated', { userId });

// WARN: Recoverable issues
logger.warn('Rate limit approaching', { usage: '90%' });

// ERROR: Failed operations
logger.error('Payment failed', { orderId, error });

// CRITICAL: System-wide failures
logger.critical('Database connection lost');
```

### 2. Include Context

```javascript
// Bad
logger.error('Failed');

// Good
logger.error('Payment processing failed', {
  orderId: '12345',
  userId: 'user_abc',
  amount: 99.99,
  error: error.message
});
```

### 3. Don't Log Sensitive Data

```javascript
// Bad
logger.info('User logged in', { password: userPassword });

// Good
logger.info('User logged in', {
  userId: user.id,
  email: user.email.replace(/(.{2}).*(@.*)/, '$1***$2')
});
```

### 4. Use Consistent Naming

```javascript
// Pick a component naming convention
createLogger('BridgeServer');
createLogger('WalrusService');
createLogger('TransactionManager');

// Not:
createLogger('bridge_server');
createLogger('walrus_svc');
```

---

## Quick Reference

### Log Level Quick Set

```bash
# Debug everything
DEBUG=* BRIDGE_LOG_LEVEL=DEBUG bun run dev:full

# Production mode (errors only)
LOG_LEVEL=ERROR bun run start

# Specific component debug
DEBUG=walrus:* bun run dev
```

### Common Log Patterns

```javascript
// Function entry/exit
logger.debug(`Entering ${functionName}`, { args });
// ... function body
logger.debug(`Exiting ${functionName}`, { result });

// Error handling
try {
  // operation
} catch (error) {
  logger.error('Operation failed', {
    operation: 'operationName',
    error: error.message,
    stack: error.stack
  });
  throw error;
}

// Performance tracking
const start = Date.now();
// ... operation
logger.info('Operation completed', {
  duration: Date.now() - start,
  operation: 'operationName'
});
```

---

## Additional Resources

- **Logger Source**: `packages/shared/src/logging/index.ts`
- **Script Logger**: `scripts/utils/logger.js`
- **Configuration**: `docs/CONFIGURATION.md`
- **Testing**: `docs/TESTING.md`

---

**Need Help?** Check the [QUICKSTART.md](./QUICKSTART.md) or file an issue.
