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

1. **Copy the test environment file:**
   ```bash
   cp .env.test .env.test.local
   ```

2. **Edit `.env.test.local`** with your test wallet address:
   ```env
   TEST_WALLET_ADDRESS=0x... # Your testnet wallet address
   TEST_PRIVATE_KEY=       # Optional: for real transactions
   ```

3. **Get test SUI from the faucet:**
   ```bash
   curl -X POST https://faucet.testnet.sui.io/gas \
     -H "Content-Type: application/json" \
     -d '{"FixedAmountRequest": {"recipient": "YOUR_WALLET_ADDRESS"}}'
   ```

4. **Run the test script:**
   ```bash
   ./scripts/run-live-test.sh
   ```

## Test Methods

### Method 1: Automated Node.js Tests

Run the complete test suite directly with Node.js:

```bash
node tests/test-deployed-contract.js
```

This runs:
- gRPC connection tests
- Contract verification
- Transaction building tests
- Event monitoring
- WebSocket bridge tests

### Method 2: Docker-Based Testing

Run tests in isolated Docker containers:

```bash
docker-compose -f docker-compose.local-test.yml up test-runner
```

Benefits:
- Isolated environment
- No local dependencies
- Reproducible results
- Parallel test execution

### Method 3: Interactive Testing

Start an interactive REPL for manual testing:

```bash
./scripts/run-live-test.sh
# Choose option 3
```

In the REPL, you can:
```javascript
// Check balance
await suiGrpcService.getBalance('0x...')

// Create spreadsheet
const result = await suiGrpcService.createSpreadsheet(
  'Test Sheet',
  '0x...wallet',
  mockSigner
)

// Monitor events
grpcService.on('spreadsheetEvent', console.log)
```

### Method 4: Vitest Unit & Integration Tests

Run the full test suite with Vitest:

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Property-based tests
npm run test:property

# With coverage
npm run test:coverage
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
   docker-compose -f docker-compose.local-test.yml up ws-grpc-bridge
   ```

2. **Run Integration Tests:**
   ```bash
   npm run test:integration
   ```

3. **Run Property Tests:**
   ```bash
   npm run test:property
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

The test suite covers:

### Unit Tests
- [x] BCS encoding for all types
- [x] Transaction building for all operations
- [x] Event parsing and filtering
- [x] Gas estimation logic

### Integration Tests
- [x] gRPC connection to Sui testnet
- [x] Contract deployment verification
- [x] Transaction execution (mock mode)
- [x] Event subscription and reception
- [x] WebSocket bridge functionality

### Property-Based Tests
- [x] 100+ randomized test cases
- [x] Cell reference validation
- [x] Transaction structure validation
- [x] Event filtering correctness

### End-to-End Tests
- [x] Complete spreadsheet creation flow
- [x] Version saving workflow
- [x] Cell locking mechanism
- [x] Real-time collaboration

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

Enable verbose logging:

```bash
export LOG_LEVEL=debug
export TEST_VERBOSE=true
node tests/test-deployed-contract.js
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