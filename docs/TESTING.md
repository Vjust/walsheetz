# Testing Guide for WalSheetz Sui Contract Integration

This guide explains how to test the deployed Sui smart contracts locally with the gRPC integration.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Test Methods](#test-methods)
- [Configuration](#configuration)
- [Running Tests](#running-tests)
- [Troubleshooting](#troubleshooting)

## Prerequisites

1. **Node.js 20+** and **npm** or **bun**
2. **Docker** (optional, for containerized testing)
3. **Sui Testnet Wallet** with some test SUI
4. **Access to Sui Testnet** (no local node required)

## Quick Start

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Run unit tests:**
   ```bash
   bun run test:unit
   ```

3. **Run tests with coverage:**
   ```bash
   bun run test:coverage
   ```

4. **For Walrus integration tests** (requires bridge):
   ```bash
   # Terminal 1: Start the bridge
   bun run bridge

   # Terminal 2: Run Walrus tests
   bun run test:walrus
   ```

## Test Methods

### Method 1: Vitest Unit Tests

Run unit tests with Vitest (current coverage: blockchain/walrus services only):

```bash
# All unit tests
bun run test:unit

# With coverage report
bun run test:coverage

# Watch mode for development
bun run test:watch

# Interactive UI
bun run test:ui
```

**Current Coverage:**
- ✅ `tests/unit/blockchain/` - Blockchain service tests
  - GraphQL error recovery
  - Rate limiting
  - Circuit breakers
- ✅ `tests/unit/blockchain-walrus-service.test.js` - Walrus integration
- ✅ `tests/unit/browser-walrus-service.test.js` - Browser client
- ❌ `tests/unit/frontend/` - **Not yet implemented** (planned)

### Method 2: Walrus Integration Tests

Test Walrus storage operations (requires bridge):

```bash
# Start bridge first
bun run bridge

# Run Walrus integration tests
bun run test:walrus

# Verbose output
bun run test:walrus:verbose

# SDK integration tests
bun run test:walrus:sdk
```

### Method 3: Integration Tests

Run integration tests (requires bridge):

```bash
# Start bridge
bun run dev:full

# Run integration tests
bun run test:integration
```

### Method 4: Property-Based Tests

Run property-based tests with fast-check:

```bash
bun run test:property
```

### Method 5: E2E Tests

Run end-to-end tests with Playwright:

```bash
# Playwright E2E tests
bun run test:e2e:playwright

# Neko containerized E2E tests
bun run test:e2e:neko
```

## Configuration

### Deployed Contract Addresses

The contracts are deployed on Sui testnet:

| Contract | Address |
|----------|---------|
| Package ID | `0xe7f62142b48f1b1746bd7dd7b695f0e2e5952879662ab7d755fdd9081b189fa7` |
| Registry Object | `0x9a6b94f79762fa608c5f0938d092744a8e5b69852f860eb17afa4ab11e24fe25` |

### Environment Variables

Key variables in `.env.test.local`:

```env
# Wallet Configuration
TEST_WALLET_ADDRESS=0x...     # Your testnet wallet
TEST_PRIVATE_KEY=              # Private key (keep secret!)

# Network
VITE_NETWORK=testnet
GRPC_ENDPOINT=fullnode.testnet.sui.io:443

# WebSocket Bridge
WS_BRIDGE_PORT=8080

# Test Settings
TEST_TIMEOUT=60000
TEST_VERBOSE=true
```

## Running Tests

### Complete Test Flow

1. **Start the WebSocket Bridge:**
   ```bash
   bun run bridge
   # Or for full stack:
   bun run dev:full
   ```

2. **Run All Tests:**
   ```bash
   # Unit tests (no bridge required)
   bun run test:unit

   # Integration tests (requires bridge)
   bun run test:integration

   # Property-based tests
   bun run test:property

   # Walrus integration tests (requires bridge)
   bun run test:walrus
   ```

### Testing Real Transactions

To test with real blockchain transactions:

1. **Ensure you have test SUI:**
   ```bash
   ./scripts/run-live-test.sh
   # Choose option 4 to check balance
   ```

2. **Set up a test signer** (example with Ed25519):
   ```javascript
   import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
   
   const keypair = Ed25519Keypair.fromSecretKey(secretKey);
   const signer = {
     signTransaction: async (tx) => {
       const signature = await keypair.signTransaction(tx);
       return { signature, publicKey: keypair.getPublicKey() };
     }
   };
   ```

3. **Execute a real transaction:**
   ```javascript
   const result = await suiGrpcService.createSpreadsheet(
     'Real Test Sheet',
     walletAddress,
     signer
   );
   ```

### Monitoring Events

The gRPC service monitors blockchain events in real-time:

```javascript
// Subscribe to all spreadsheet events
grpcService.on('spreadsheetEvent', (event) => {
  console.log('Event:', event.type, event.data);
});

// Subscribe to specific events
grpcService.on('cellLocked', (event) => {
  console.log('Cell locked:', event.data.cell_ref);
});
```

## Test Coverage

### Current Test Surface

The test suite currently covers:

### ✅ Unit Tests (Blockchain/Walrus Only)
**Location:** `tests/unit/blockchain/`
- [x] GraphQL error recovery and fallback
- [x] Rate limiting logic
- [x] Circuit breaker patterns
- [x] Walrus compression/decompression
- [x] Walrus redundancy fallback
- [x] Delta chain reconstruction
- [x] Transaction serialization
- [x] Event parsing and filtering

**Location:** `tests/unit/`
- [x] `blockchain-walrus-service.test.js` - Walrus service integration
- [x] `browser-walrus-service.test.js` - Browser client wrapper

### ⚠️ Integration Tests (Partial Coverage)
**Location:** `tests/integration/`
- [x] gRPC connection to Sui testnet
- [x] WebSocket bridge functionality
- [x] Walrus storage operations
- [ ] Full spreadsheet persistence flow (TODO)
- [ ] Multi-user collaboration scenarios (TODO)

### ⚠️ Property-Based Tests (Basic)
**Location:** `tests/property/`
- [x] Randomized test cases with fast-check
- [ ] Extended property coverage (TODO)

### ⚠️ E2E Tests (Infrastructure Only)
**Location:** `tests/e2e/`
- [x] Playwright test infrastructure
- [x] Neko containerized setup
- [ ] Comprehensive E2E scenarios (TODO)

### ❌ Missing Coverage (Planned)
- [ ] **Frontend Unit Tests** (`tests/unit/frontend/`)
  - No React component tests
  - No business logic hook tests
  - No service wrapper tests
- [ ] **Full Integration Tests**
  - Limited collaboration scenarios
  - Missing persistence edge cases
- [ ] **Load/Stress Tests**
  - No concurrent user testing
  - No performance benchmarks

## Troubleshooting

### Common Issues

1. **"Insufficient funds" error:**
   - Get test SUI from faucet: https://faucet.testnet.sui.io
   - Check balance: `./scripts/run-live-test.sh` → Option 4

2. **"Connection refused" on gRPC:**
   - Check network connectivity
   - Verify GRPC_ENDPOINT in `.env.test.local`
   - Try: `fullnode.testnet.sui.io:443`

3. **"Registry object not found":**
   - Ensure you're on testnet (not mainnet)
   - Verify CONTRACT_PACKAGE_ID matches deployment

4. **WebSocket bridge not connecting:**
   - Check port 8080 is available
   - Verify ws-grpc-bridge container is running
   - Check logs: `docker logs fortunesheet-ws-bridge`

5. **Docker build failures:**
   - Clear Docker cache: `docker system prune -a`
   - Rebuild: `docker-compose build --no-cache`

### Debug Mode

Enable verbose logging for tests:

```bash
# Unit tests with verbose output
bun run test:unit --reporter=verbose

# Walrus tests with verbose output
bun run test:walrus:verbose

# Integration tests with debug logging
BRIDGE_LOG_LEVEL=DEBUG bun run test:integration
```

### Checking Contract State

View contract objects on explorer:
- Testnet Explorer: https://testnet.suivision.xyz
- Package: https://testnet.suivision.xyz/package/0xe7f62142b48f1b1746bd7dd7b695f0e2e5952879662ab7d755fdd9081b189fa7
- Registry: https://testnet.suivision.xyz/object/0x9a6b94f79762fa608c5f0938d092744a8e5b69852f860eb17afa4ab11e24fe25

## Advanced Testing

### Load Testing

Test with multiple concurrent operations:

```javascript
// Create multiple spreadsheets concurrently
const promises = Array(10).fill(0).map((_, i) => 
  suiGrpcService.createSpreadsheet(
    `Load Test ${i}`,
    wallet,
    signer
  )
);

const results = await Promise.all(promises);
```

### Chaos Testing

Test error handling and recovery:

```javascript
// Test with invalid data
await suiGrpcService.lockCell(
  '0xinvalid',  // Invalid spreadsheet ID
  'A1',
  wallet,
  wallet,
  signer
);

// Test timeout handling
const longRunning = suiGrpcService.waitForTransaction(
  'fake-digest',
  { timeout: 1000 }
);
```

### Performance Testing

Measure transaction latency:

```javascript
const start = Date.now();
const result = await suiGrpcService.createSpreadsheet(
  'Performance Test',
  wallet,
  signer
);
const latency = Date.now() - start;
console.log(`Transaction took ${latency}ms`);
```

## CI/CD Integration

For GitHub Actions:

```yaml
name: Test Sui Integration
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        env:
          TEST_WALLET_ADDRESS: ${{ secrets.TEST_WALLET }}
          VITE_NETWORK: testnet
        run: |
          npm run test:unit
          npm run test:integration
```

## Summary

The testing infrastructure provides:

1. **Multiple test methods** - Node.js, Docker, Interactive
2. **Real contract testing** - Against deployed testnet contracts
3. **Property-based testing** - 100+ randomized test cases
4. **Complete coverage** - Unit, integration, and E2E tests
5. **Easy debugging** - Verbose logging and interactive REPL
6. **CI/CD ready** - Automated test execution

For questions or issues, check the logs and use the interactive testing environment to debug specific problems.