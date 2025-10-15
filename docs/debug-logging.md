# Debug Logging Guide

This guide explains how to control logging verbosity in WalSheetz for both frontend (browser) and backend (Node/Bun) services.

## Table of Contents
- [Log Levels](#log-levels)
- [Frontend Logging](#frontend-logging)
- [Backend Logging](#backend-logging)
- [Common Scenarios](#common-scenarios)
- [Troubleshooting](#troubleshooting)

---

## Log Levels

WalSheetz uses five log levels, from most to least verbose:

| Level | Purpose | Default Environment |
|-------|---------|-------------------|
| **DEBUG** | Detailed diagnostic information | Never (opt-in only) |
| **INFO** | General informational messages | Development (backend only) |
| **WARN** | Warning messages for recoverable issues | Development (default for frontend) |
| **ERROR** | Error messages for failures | Always visible |
| **CRITICAL** | System-threatening failures | Always visible |

---

## Frontend Logging

Frontend logging is controlled via environment variables and query parameters.

### Environment Variables

Set these in your `.env` file or shell environment:

```bash
# Global log level for frontend (DEBUG, INFO, WARN, ERROR, CRITICAL)
VITE_LOG_LEVEL=WARN

# Component-specific debug logging (comma-separated list)
VITE_DEBUG_COMPONENTS=BLOCKCHAIN_ADAPTER,STORAGE_SERVICE

# Enable verbose Vite proxy logs
VITE_VERBOSE_PROXY=true
```

### Query Parameter Overrides

Enable debug logging temporarily without restarting:

```bash
# Enable ALL debug logs
http://localhost:3005?debug=true

# Enable debug logs for specific components
http://localhost:3005?debug=BLOCKCHAIN_ADAPTER
http://localhost:3005?debug=BLOCKCHAIN_ADAPTER,STORAGE_SERVICE
```

### Available Frontend Components

Use these names with `VITE_DEBUG_COMPONENTS` or `?debug=`:

- `SpreadsheetEngine` - Core spreadsheet logic
- `BlockchainAdapter` - Blockchain operations
- `WebSocketService` - WebSocket communication
- `UIComponent` - UI interactions
- `WalletManager` - Wallet connection/management
- `StorageService` - Walrus storage operations
- `Collaboration` - Real-time collaboration
- `Performance` - Performance monitoring

### Example Usage

**Debug blockchain adapter only:**
```bash
VITE_DEBUG_COMPONENTS=BLOCKCHAIN_ADAPTER bun run dev
```

**Debug multiple components:**
```bash
VITE_DEBUG_COMPONENTS=BLOCKCHAIN_ADAPTER,STORAGE_SERVICE bun run dev
```

**Quick testing via query param:**
```
http://localhost:3005?debug=BLOCKCHAIN_ADAPTER
```

---

## Backend Logging

Backend services (bridge, scripts) use `LOG_LEVEL` and `BRIDGE_LOG_LEVEL` environment variables.

### Environment Variables

```bash
# Global log level for all Node/Bun scripts
LOG_LEVEL=INFO

# Bridge-specific log level (overrides LOG_LEVEL for bridge)
BRIDGE_LOG_LEVEL=DEBUG

# Enable verbose Vite proxy logs (same as frontend)
VITE_VERBOSE_PROXY=true
```

### Starting Services with Debug Logging

**Bridge with debug logging:**
```bash
BRIDGE_LOG_LEVEL=DEBUG bun run bridge
```

**Full stack with debug:**
```bash
LOG_LEVEL=DEBUG BRIDGE_LOG_LEVEL=DEBUG bun run dev:full
```

**Quiet mode (errors/warnings only):**
```bash
LOG_LEVEL=ERROR BRIDGE_LOG_LEVEL=WARN bun run dev:full
```

---

## Common Scenarios

### Scenario 1: Debugging Save Issues

Enable detailed blockchain and storage logs:

```bash
# Terminal 1: Start bridge with debug logging
BRIDGE_LOG_LEVEL=DEBUG bun run bridge

# Terminal 2: Start UI with blockchain debug
VITE_DEBUG_COMPONENTS=BLOCKCHAIN_ADAPTER,STORAGE_SERVICE bun run dev
```

Or use the full stack command:
```bash
LOG_LEVEL=DEBUG VITE_DEBUG_COMPONENTS=BLOCKCHAIN_ADAPTER,STORAGE_SERVICE bun run dev:full
```

### Scenario 2: Investigating Wallet Connection Problems

```bash
# Enable wallet manager debug logs
VITE_DEBUG_COMPONENTS=WALLET_MANAGER bun run dev
```

Or via query parameter:
```
http://localhost:3005?debug=WALLET_MANAGER
```

### Scenario 3: Troubleshooting WebSocket/Bridge Communication

```bash
# Terminal 1: Bridge with detailed logs
BRIDGE_LOG_LEVEL=DEBUG bun run bridge

# Terminal 2: UI with WebSocket component debug
VITE_DEBUG_COMPONENTS=WEBSOCKET_SERVICE bun run dev
```

### Scenario 4: Performance Analysis

```bash
# Enable performance component logs
VITE_DEBUG_COMPONENTS=PERFORMANCE bun run dev
```

Check browser console for:
- Operation timing
- Memory usage snapshots
- Long task warnings
- Average operation times

### Scenario 5: Production-Level Quiet Mode

```bash
# Only show errors in all services
LOG_LEVEL=ERROR VITE_LOG_LEVEL=ERROR BRIDGE_LOG_LEVEL=ERROR bun run dev:full
```

---

## Throttling Behavior

To prevent console flooding, WalSheetz automatically throttles high-frequency logs:

### Frontend Throttling
- **Transaction queue logs**: At most every 30s
- **Retry attempts**: Summarized with count

### Backend Throttling
- **Ping/pong**: At most every 60s per client
- **Event processing**: At most every 30s (GraphQL subscriber)
- **Checkpoint updates**: At most every 60s
- **Metrics collection**: At most every 5 minutes

**Note**: When debug logging is explicitly enabled for a component, some throttling may be relaxed to provide more detailed information.

---

## Browser Console Helpers

WalSheetz exposes global objects in the browser console for runtime debugging:

### Logger Configuration

```javascript
// Check current log configuration
window.walSheetzLogConfig.getConfig()

// Enable debug for specific components at runtime
window.walSheetzLogConfig.enableDebugForComponents('BLOCKCHAIN_ADAPTER')

// Enable debug for ALL components
window.walSheetzLogConfig.enableDebugForAll()

// Disable debug for all
window.walSheetzLogConfig.disableDebugForAll()

// Change global log level
window.walSheetzLogConfig.setGlobalLogLevel(0) // 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR, 4=CRITICAL
```

### Logger Metrics

```javascript
// Get logger metrics (operation counts, timing, errors)
window.walSheetzLogger.getMetrics()

// Export logs for analysis
window.walSheetzLogger.exportLogs()

// Export logs for specific component
window.walSheetzLogger.exportLogs({ component: 'BLOCKCHAIN_ADAPTER' })

// Export error logs only
window.walSheetzLogger.exportLogs({ level: 3 }) // 3 = ERROR
```

---

## Troubleshooting

### Logs Not Appearing

1. **Check log level**: Ensure `DEBUG` or `INFO` is set if expecting those logs
2. **Check component filter**: Verify component name in `VITE_DEBUG_COMPONENTS`
3. **Restart services**: Environment variables require restart to take effect
4. **Clear browser cache**: Old LogConfig may be cached in localStorage

### Too Many Logs

1. **Increase log level**: Use `WARN` or `ERROR` instead of `INFO`
2. **Remove component filters**: Remove `VITE_DEBUG_COMPONENTS` to disable debug logs
3. **Check query params**: Remove `?debug=` from URL

### Bridge Not Logging

1. **Check `BRIDGE_LOG_LEVEL`**: Should be `DEBUG` or `INFO` for detailed logs
2. **Verify bridge is running**: `curl http://localhost:8081/health`
3. **Check for port conflicts**: Use `bun run cleanup` to free port 8081

### Vite Proxy Logs Too Verbose

```bash
# Disable verbose proxy logs (default behavior)
unset VITE_VERBOSE_PROXY

# Or explicitly set to false
VITE_VERBOSE_PROXY=false bun run dev
```

---

## Log Output Formats

### Frontend (Browser Console)

```
ℹ️ [13:45:23] BlockchainAdapter tx_processing: Processing transaction abc123 | {"queueRemaining":2}
```

Format: `[emoji] [timestamp] [component] [action]: [message] | {metadata}`

### Backend (Terminal)

```
[2025-10-12T13:45:23.456Z] INFO [BridgeStartup] ℹ️  Starting WalSheetz WebSocket-gRPC Bridge | {"environment":"development","port":8081}
```

Format: `[ISO timestamp] [LEVEL] [component] [emoji] [message] | {metadata}`

---

## Performance Tips

1. **Use WARN level in development**: Reduces noise while keeping important messages
2. **Enable DEBUG selectively**: Only for components you're actively debugging
3. **Use query parameters for quick tests**: No restart needed
4. **Check browser console filters**: Ensure you're not filtering out logs
5. **Monitor memory usage**: Excessive logging can increase memory usage

---

## Related Documentation

- [CONFIGURATION.md](CONFIGURATION.md) - Environment variable reference
- [README.md](README.md) - Main development guide
- [TESTING.md](TESTING.md) - Testing and diagnostics
- [bridge-server-enhancements.md](bridge-server-enhancements.md) - Bridge architecture

---

For questions or issues, please open a GitHub issue or check existing documentation.
