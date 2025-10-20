# WalSheetz Scripts Catalog

This document catalogs all operational scripts in the `scripts/` directory, including their purpose, usage, and when to use them.

## Table of Contents
- [Bridge & Server Scripts](#bridge--server-scripts)
- [Testing Scripts](#testing-scripts)
- [Diagnostic Scripts](#diagnostic-scripts)
- [Verification Scripts](#verification-scripts)
- [Utility Scripts](#utility-scripts)

---

## Bridge & Server Scripts

### `start-bridge.js`
**Purpose:** Start the WebSocket-gRPC bridge server with comprehensive logging and monitoring.

**Usage:**
```bash
# Via npm script (recommended)
bun run bridge

# Direct invocation
node scripts/start-bridge.js
```

**Features:**
- Comprehensive configuration logging
- Memory usage monitoring
- Periodic status reports (every 5 minutes)
- Graceful shutdown handling
- Troubleshooting guidance on errors

**Environment Variables:**
- `BRIDGE_PORT` - Server port (default: 8081)
- `BRIDGE_HOST` - Server host (default: localhost)
- `BRIDGE_LOG_LEVEL` - Logging verbosity (DEBUG, INFO, WARN, ERROR)
- `BRIDGE_MAX_CLIENTS` - Maximum concurrent clients (default: 100)

**When to Use:**
- Development with blockchain features
- Running integration tests
- Testing WebSocket communication

**Related Docs:** [docs/bridge-server-enhancements.md](../bridge-server-enhancements.md)

---

### `start-bridge-if-free.js`
**Purpose:** Start bridge only if port 8081 is available, otherwise skip gracefully.

**Usage:**
```bash
bun run bridge  # Uses this script via package.json
```

**Features:**
- Checks port availability before starting
- Skips startup if port occupied
- No error if bridge already running
- Used by `bun run dev:full`

**When to Use:**
- Automated workflows (CI/CD)
- Development scripts that conditionally need bridge
- Preventing duplicate bridge instances

---

### `cleanup-ports.js`
**Purpose:** Clean up occupied ports (kills processes on 8081 and 3005).

**Usage:**
```bash
bun run cleanup
```

**Features:**
- Kills processes occupying bridge port (8081)
- Kills processes occupying dev server port (3005)
- Cross-platform (macOS, Linux)
- Safe to run even if ports are free

**When to Use:**
- Bridge won't start due to port conflict
- Dev server port already in use
- Stuck processes from previous session

---

## Testing Scripts

### `run-walrus-integration-tests.js`
**Purpose:** Run comprehensive Walrus storage integration tests.

**Usage:**
```bash
# Standard output
bun run test:walrus

# Verbose output
bun run test:walrus:verbose
# Or: VITEST_REPORTER=verbose node scripts/run-walrus-integration-tests.js
```

**Prerequisites:**
- Bridge must be running (`bun run bridge`)
- Walrus testnet access

**Tests Covered:**
- Compression/decompression
- Redundancy and fallback
- Delta chain reconstruction
- HEAD precheck validation

**When to Use:**
- Verifying Walrus storage functionality
- Testing compression/delta features
- Debugging Walrus integration issues

---

### `test-walrus-sdk-integration.js`
**Purpose:** Test Walrus SDK integration and API compatibility.

**Usage:**
```bash
bun run test:walrus:sdk
# Or: node scripts/test-walrus-sdk-integration.js
```

**Features:**
- Tests `@mysten/walrus` SDK integration
- Validates API compatibility
- Checks storage/retrieval workflows

**When to Use:**
- Validating SDK updates
- Testing Walrus SDK feature flags
- Debugging SDK-related issues

---

### `test-blockchain-integration.js`
**Purpose:** Test blockchain integration (Sui gRPC, transactions, events).

**Usage:**
```bash
node scripts/test-blockchain-integration.js
```

**Prerequisites:**
- Bridge must be running
- Sui testnet access

**Tests Covered:**
- gRPC connection to Sui node
- Transaction building and execution
- Event subscription
- Contract interaction

**When to Use:**
- Verifying Sui blockchain connectivity
- Testing transaction flows
- Debugging gRPC issues

---

### `test-graphql-fallback.js`
**Purpose:** Test GraphQL fallback mechanism when gRPC unavailable.

**Usage:**
```bash
bun run test:grpc:fallback
# Or: node scripts/test-graphql-fallback.js
```

**Features:**
- Tests automatic fallback to GraphQL
- Validates event subscription via GraphQL
- Checks fallback recovery

**When to Use:**
- Verifying fallback logic
- Testing GraphQL event subscription
- Debugging fallback issues

---

### `test-wallet-reliability.js`
**Purpose:** Test wallet connection reliability and error recovery.

**Usage:**
```bash
bun run test:wallet-reliability
# Or: node scripts/test-wallet-reliability.js
```

**Tests Covered:**
- Wallet connection/disconnection
- Network switching
- Error recovery scenarios
- Reconnection logic

**When to Use:**
- Verifying wallet integration
- Testing wallet error handling
- Debugging connection issues

---

### `test-proxy.js`
**Purpose:** Test Vite proxy configuration for Sui/Walrus endpoints.

**Usage:**
```bash
bun run test:proxy
# Or: node scripts/test-proxy.js
```

**Features:**
- Tests `/sui-rpc` proxy
- Tests `/walrus-publisher` proxy
- Tests `/walrus-aggregator` proxy
- Validates proxy headers and CORS

**When to Use:**
- Verifying proxy configuration
- Debugging CORS issues
- Testing development environment

---

## Diagnostic Scripts

### `diagnose-save-issues.js`
**Purpose:** Diagnose spreadsheet save failures and data persistence issues.

**Usage:**
```bash
bun run diagnose:save
# Or: node scripts/diagnose-save-issues.js
```

**Checks Performed:**
- Walrus publisher availability
- Bridge connectivity
- Transaction execution
- Storage adapter functionality
- Compression/delta chain status

**Output:**
- Detailed diagnostic report
- Error logs and stack traces
- Recommended fixes

**When to Use:**
- Spreadsheet won't save
- Walrus storage errors
- Investigating data loss

---

### `diagnose-wz-autocomplete.js`
**Purpose:** Diagnose WZ.* formula autocomplete issues in Luckysheet.

**Usage:**
```bash
node scripts/diagnose-wz-autocomplete.js
```

**Checks Performed:**
- Luckysheet global structure
- WZ function registration
- Locale patch application
- Formula engine integration

**When to Use:**
- WZ formulas not autocompleting
- Custom functions not appearing
- Luckysheet integration issues

---

### `debug-spreadsheet-loading.js`
**Purpose:** Debug spreadsheet loading and initialization issues.

**Usage:**
```bash
node scripts/debug-spreadsheet-loading.js [spreadsheet-id]
```

**Features:**
- Traces spreadsheet load process
- Checks data retrieval from Walrus
- Validates Luckysheet initialization
- Logs detailed loading steps

**When to Use:**
- Spreadsheet won't load
- Data corruption suspected
- Debugging initialization flow

---

## Verification Scripts

### `verify-walrus-endpoints.js`
**Purpose:** Verify Walrus publisher and aggregator endpoints are functional.

**Usage:**
```bash
# Testnet verification
node scripts/verify-walrus-endpoints.js testnet

# Mainnet verification
node scripts/verify-walrus-endpoints.js mainnet
```

**Checks Performed:**
1. Publisher endpoint reachability
2. Aggregator endpoint reachability
3. Test blob publication
4. Test blob retrieval
5. End-to-end connectivity verification

**Output:**
- Endpoint health status
- Blob ID (if published successfully)
- Content verification results
- Detailed error messages if any failures occur

**When to Use:**
- Before deploying to a new environment
- Troubleshooting save failures
- Verifying endpoint configuration
- Pre-deployment validation
- CI/CD endpoint health checks

**Exit Codes:**
- `0` - All checks passed
- `1` - One or more checks failed

**Related Docs:** [docs/SAVE_VERIFICATION_GUIDE.md](../SAVE_VERIFICATION_GUIDE.md)

---

### `verify-websocket-fixes.js`
**Purpose:** Verify WebSocket bridge fixes and connectivity.

**Usage:**
```bash
node scripts/verify-websocket-fixes.js
```

**Validations:**
- WebSocket connection establishment
- Message round-trip
- Event subscription
- Error handling

**When to Use:**
- After bridge updates
- Verifying WebSocket fixes
- Testing connectivity

**Related Docs:** [docs/WEBSOCKET_FIXES_SUMMARY.md](../WEBSOCKET_FIXES_SUMMARY.md)

---

### `verify-wz-formula-registration.js`
**Purpose:** Verify WZ.* formula registration in Luckysheet.

**Usage:**
```bash
node scripts/verify-wz-formula-registration.js
```

**Checks:**
- All WZ functions registered
- Function metadata correct
- Locale patches applied
- Autocomplete working

**When to Use:**
- After adding new WZ formulas
- Verifying formula injection
- Debugging formula issues

---

## Utility Scripts

### `generate-abi-types.js`
**Purpose:** Generate TypeScript types from Sui contract ABI.

**Usage:**
```bash
# Runs automatically before dev server
bun run dev  # Triggers predev script

# Manual invocation
node scripts/generate-abi-types.js
```

**Generates:**
- `frontend/types/abi.d.ts` - TypeScript type definitions
- `frontend/types/abi.json` - ABI JSON export

**When to Use:**
- After contract updates
- Type definitions out of sync
- Adding new contract functions

---

### `check-ui-imports.js`
**Purpose:** Check for illegal server-only imports in UI code.

**Usage:**
```bash
node scripts/check-ui-imports.js
```

**Validates:**
- No `blockchain/` imports in `frontend/` (except browser services)
- No Node.js-only modules in browser code
- Import alias correctness

**When to Use:**
- Before commits (CI check)
- Debugging import errors
- Code review validation

---

### `serve-dist.js`
**Purpose:** Serve production build for testing.

**Usage:**
```bash
node scripts/serve-dist.js
```

**Features:**
- Serves `dist/` directory
- Simulates production environment
- Useful for pre-deployment testing

**When to Use:**
- Testing production build
- Verifying build artifacts
- Pre-deployment validation

---

### `test-rate-limiter.js`
**Purpose:** Test rate limiter functionality and configuration.

**Usage:**
```bash
node scripts/test-rate-limiter.js
```

**Tests:**
- Rate limit enforcement
- Burst handling
- Queue management
- Backoff logic

**When to Use:**
- Verifying rate limiter config
- Testing RPC quota compliance
- Debugging rate limit errors

**Related Docs:** [docs/rate-limiting-implementation.md](../rate-limiting-implementation.md)

---

## Testing Workflows

### Formula Testing
```bash
# Test Sui formulas
node scripts/test-sui-formulas.js

# Test spreadsheet formulas
node scripts/test-spreadsheet-formulas.js

# Trace autocomplete rendering
node scripts/trace-autocomplete-rendering.js

# Diagnose autocomplete runtime
node scripts/test-autocomplete-runtime.js
```

### Advanced Testing
```bash
# Test working system end-to-end
node scripts/test-working-system.js

# Test simple gRPC connection
node scripts/test-simple-grpc.js

# Test basic connectivity
node scripts/test-basic-connectivity.js

# Test gRPC integration
node scripts/test-grpc-integration.js

# Test object extraction
node scripts/test-object-extraction.js

# Test TypeScript integration
node scripts/test-typescript.js
```

---

## CI/CD Scripts

### Smoke Tests
```bash
# Run smoke tests (diagnose + proxy)
bun run ci:smoke

# Full CI validation (unit + smoke)
bun run ci:validate
```

---

## Script Conventions

### Exit Codes
- `0` - Success
- `1` - General error
- `2` - Configuration error
- `3` - Connection error

### Logging
Most scripts respect `LOG_LEVEL` or `BRIDGE_LOG_LEVEL` environment variables:
- `DEBUG` - Verbose diagnostic output
- `INFO` - Standard operational logs
- `WARN` - Warnings and fallbacks
- `ERROR` - Errors only

### Environment Variables
Scripts read from:
1. Environment variables
2. `.env` files (if present)
3. `blockchain/config.js` defaults

---

## Related Documentation

- **[docs/README.md](../README.md)** - Main developer guide
- **[docs/TESTING.md](../TESTING.md)** - Comprehensive testing guide
- **[docs/CONFIGURATION.md](../CONFIGURATION.md)** - Environment configuration
- **[docs/bridge-server-enhancements.md](../bridge-server-enhancements.md)** - Bridge architecture
- **[docs/rate-limiting-implementation.md](../rate-limiting-implementation.md)** - Rate limiting details

---

## Quick Reference

### Most Common Scripts
```bash
# Development
bun run bridge          # Start WebSocket bridge
bun run cleanup         # Kill stuck processes
bun run dev:full        # Full stack (bridge + UI)

# Testing
bun run test:unit       # Unit tests
bun run test:walrus     # Walrus integration
bun run diagnose:save   # Debug save issues

# Verification
node scripts/verify-walrus-endpoints.js testnet  # Check Walrus testnet
node scripts/verify-walrus-endpoints.js mainnet  # Check Walrus mainnet
node scripts/verify-websocket-fixes.js           # Check WebSocket
node scripts/verify-wz-formula-registration.js   # Check formulas
```

### When Things Break
1. **Bridge won't start:** `bun run cleanup`
2. **Save failing:** `bun run diagnose:save` or `node scripts/verify-walrus-endpoints.js testnet`
3. **Walrus unreachable:** `node scripts/verify-walrus-endpoints.js testnet`
4. **Formulas missing:** `node scripts/verify-wz-formula-registration.js`
5. **Connection errors:** `node scripts/test-graphql-fallback.js`

---

For more detailed troubleshooting, see [docs/README.md](../README.md#common-workflows).
