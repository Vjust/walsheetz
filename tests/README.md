# WalSheetz Test Suite

Comprehensive testing infrastructure with Docker support and extensive logging.

## 🎯 Quick Start

### Run All Tests with Extensive Logging (Docker)

```bash
# Build and run tests in Docker
npm run test:docker

# Or build the image first
npm run test:docker:build

# Then run tests
docker run --rm walsheetz-test
```

### Run Tests Locally

```bash
# Run all unit tests with verbose logging
npm run test:services

# Run specific test suite
npm run test:unit -- PoACertificationService

# Watch mode with logging
npm run test:services:watch

# Generate coverage report
npm run test:coverage
```

## 📦 Test Structure

```
tests/
├── docker-compose.test.yml   # Docker orchestration
├── setup.js                    # Global test configuration
├── utils/
│   ├── TestLogger.js          # Extensive logging utility
│   └── TestHelpers.js         # Mock factories and fixtures
└── unit/
    └── services/
        ├── PoACertificationService.test.js
        ├── BlobLineageTracker.test.js
        ├── TransactionTracker.test.js (TODO)
        └── PoARenewalManager.test.js (TODO)
```

## 🔍 Logging Examples

### Successful Test Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Test Suite: PoACertificationService
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🧪 Test: should successfully request certification for a blob
    ⏱️  Start: 2025-01-14 10:30:45.123
    🔧 Setup: Preparing test data...
    🔍 Test data: {blobId: "blob_abc123", options: {durationDays: 30}}
    🚀 Executing: service.requestCertification {blobId: "blob_abc123", options: {...}}
    📊 Result: {success: true, transactionDigest: "0xdef456"}
    ✓ Assertion passed: result.success === true
    ✓ Assertion passed: result.transactionDigest === 0xdef456
    ✓ Assertion passed: result.status === 'completed'
    ✓ Assertion passed: certifyBlob called once
    ⏱️  Duration: 245ms
  ✅ PASS (245ms)

  📊 Summary: 6 passed, 0 failed, 6 total
  ⏱️  Total time: 1.2s
```

### Failed Test Output

```
🧪 Test: should handle certification failure
  ⏱️  Start: 2025-01-14 10:30:46.500
  🔧 Setup: Preparing test data for failure scenario...
  🚀 Executing: service.requestCertification (expected to fail)
  📊 Result: {success: false, error: "Wallet not connected"}
  ❌ FAIL: should handle certification failure
    📍 Location: PoACertificationService.test.js:156
    💥 Error: Expected status to be 'failed' but got 'pending'

    📚 Stack Trace:
      at Object.<anonymous> (PoACertificationService.test.js:156:7)
      at processTicksAndRejections (node:internal/process:77:11)

    🔍 Context:
      - blobId: "blob_test123"
      - Mock response: {success: false, error: "Wallet not connected"}
      - Actual service state: {status: "pending", error: null}

    💡 Suggestion: Check if EventBus.emit was called correctly

    📞 Mock Calls Summary:
      browserSuiService.certifyBlob:
        Call 1: ["blob_test123", {durationDays: 30}]
        Returned: {success: false, error: "Wallet not connected"}
```

### Mock Call Tracking

```
🎭 Mock Call: browserSuiService.certifyBlob
  Args: ["blob_abc123", {durationDays: 30}]
  Returns: {success: true, transactionDigest: "0xdef456"}

🎭 Mock Call: localStorage.setItem
  Args: ["poa_certification_history", "..."]
  Returns: undefined
```

## 🐳 Docker Configuration

The Docker environment provides:

- ✅ Isolated test environment
- ✅ Consistent Node.js version (20-alpine)
- ✅ Color output support (`FORCE_COLOR=1`)
- ✅ Verbose logging (`VITEST_LOG_LEVEL=verbose`)
- ✅ JSON test results export
- ✅ Mounted source for debugging

### Environment Variables

```bash
NODE_ENV=test
VITEST_LOG_LEVEL=verbose
FORCE_COLOR=1
CI=true
LOG_TIMESTAMPS=true
LOG_COLORS=true
LOG_MOCK_CALLS=true
LOG_ASSERTIONS=true
```

## 🛠️ Test Utilities

### TestLogger

Provides extensive, colorized logging:

```javascript
import { testLogger } from './utils/TestLogger.js';

// Suite lifecycle
testLogger.suiteStart('MyService');
testLogger.suiteEnd('MyService', stats);

// Test lifecycle
testLogger.testStart('my test');
testLogger.testPass('my test');
testLogger.testFail('my test', error, context);

// Execution phases
testLogger.setup('Creating mocks...');
testLogger.execute('service.doSomething', { arg1: 'value' });
testLogger.result('Result', data);

// Assertions
testLogger.assertion(condition, 'description');

// Mock tracking
testLogger.mockCall('mockName', args, returnValue);
testLogger.mockCallsSummary(mockCalls);

// Other
testLogger.warn('warning message');
testLogger.info('info message');
testLogger.debug('debug message', data);
testLogger.suggestion('try this...');
```

### TestHelpers

Common mocks and fixtures:

```javascript
import {
  createMockEventBus,
  createMockLocalStorage,
  createMockBrowserSuiService,
  createMockBrowserWalrusService,
  generateBlobId,
  generateObjectId,
  createBlobVersionFixture,
  createTransactionFixture,
  waitFor,
  cleanup
} from './utils/TestHelpers.js';

// Create mocks
const mockEventBus = createMockEventBus();
const mockSuiService = createMockBrowserSuiService();

// Generate test data
const blobId = generateBlobId();
const version = createBlobVersionFixture({ size: 1024 });

// Wait for async conditions
await waitFor(() => condition === true, 5000);

// Cleanup
cleanup();
```

## 📊 Coverage Reports

Generate coverage reports:

```bash
# Run tests with coverage
npm run test:coverage

# View HTML report
open test-results/coverage/index.html
```

Coverage thresholds:
- Lines: 80%
- Functions: 80%
- Branches: 75%
- Statements: 80%

## 🧪 Test Suites

### PoACertificationService Tests

Tests certification request workflows:
- ✅ Successful certification
- ✅ Failure handling
- ✅ Duplicate request prevention
- ✅ Status polling
- ✅ History tracking
- ✅ LocalStorage persistence

### BlobLineageTracker Tests

Tests version tracking:
- ✅ Version tracking
- ✅ Parent-child relationships
- ✅ Lineage queries (by object/blob ID)
- ✅ Version chains
- ✅ Statistics calculation
- ✅ Metadata updates
- ✅ LocalStorage persistence

## 🎬 Commands Reference

```bash
# Docker commands
npm run test:docker              # Run all tests in Docker
npm run test:docker:build        # Build Docker test image
npm run test:docker:run          # Run tests (inside container)
npm run test:docker:services     # Run service tests in Docker

# Local commands
npm run test                     # Interactive test mode
npm run test:run                 # Run all tests once
npm run test:unit                # Run unit tests
npm run test:services            # Run service tests with logging
npm run test:services:watch      # Watch mode
npm run test:coverage            # Generate coverage

# Specific suites
npm run test:unit -- PoACertificationService
npm run test:unit -- BlobLineageTracker
```

## 🔧 Debugging

### Increase Logging Detail

```bash
# Maximum verbosity
VITEST_LOG_LEVEL=debug npm run test:services
```

### Disable Logging Features

```bash
# Disable timestamps
LOG_TIMESTAMPS=false npm run test:services

# Disable mock call logging
LOG_MOCK_CALLS=false npm run test:services

# Disable assertion logging
LOG_ASSERTIONS=false npm run test:services

# Disable colors
LOG_COLORS=false npm run test:services
```

### Watch Specific Test

```bash
npm run test:services:watch -- PoACertificationService
```

### Debug in Docker

```bash
# Run Docker container interactively
docker run -it --rm walsheetz-test /bin/bash

# Inside container, run tests
npm run test:docker:run
```

## 📝 Writing New Tests

Follow this pattern for extensive logging:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { testLogger } from '../utils/TestLogger.js';
import { createMockEventBus, generateBlobId } from '../utils/TestHelpers.js';

describe('MyService', () => {
  beforeEach(() => {
    testLogger.suiteStart('MyService');
    testLogger.setup('Creating mocks...');
    // Setup code
    testLogger.success('Setup complete');
  });

  it('should do something', async () => {
    const testId = testLogger.testStart('should do something');

    try {
      // Arrange
      testLogger.setup('Preparing test data...');
      const data = generateBlobId();
      testLogger.debug('Test data', { data });

      // Act
      testLogger.execute('service.method', { data });
      const result = await service.method(data);
      testLogger.result('Method result', result);

      // Assert
      testLogger.assertion(result.success === true, 'result.success === true');
      expect(result.success).toBe(true);

      testLogger.testPass('should do something');
    } catch (error) {
      testLogger.testFail('should do something', error, { data });
      throw error;
    }
  });
});
```

## 🚀 CI/CD Integration

Tests run automatically in CI with JSON output:

```bash
# CI mode (sets CI=true automatically in Docker)
npm run test:docker

# Output saved to test-results/test-output.json
```

## 💡 Best Practices

1. **Always use testLogger** for visibility into test execution
2. **Create fixtures** with TestHelpers for consistent test data
3. **Mock external dependencies** to isolate tests
4. **Log context on failures** to make debugging easier
5. **Use descriptive test names** that explain the scenario
6. **Group related tests** in describe blocks
7. **Clean up after tests** with cleanup()

## 🐛 Troubleshooting

### Tests fail in Docker but pass locally

Check environment differences:
```bash
# Compare Node versions
node --version                    # Local
docker run walsheetz-test node --version  # Docker
```

### Mock calls not being logged

Ensure `LOG_MOCK_CALLS=true`:
```bash
LOG_MOCK_CALLS=true npm run test:services
```

### Colors not showing in output

Enable color support:
```bash
FORCE_COLOR=1 npm run test:services
```

### Tests timeout

Increase timeout in vitest.config.js:
```javascript
test: {
  testTimeout: 20000  // 20 seconds
}
```

## 📚 Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Happy DOM](https://github.com/capricorn86/happy-dom)
- [Docker Documentation](https://docs.docker.com/)
