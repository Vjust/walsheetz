# WalSheetz Developer Guide

Welcome to WalSheetz! This guide provides a comprehensive overview of the architecture, development conventions, and critical entry points for maintainers and contributors.

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Critical Entry Points](#critical-entry-points)
- [Data Flow](#data-flow)
- [Development Conventions](#development-conventions)
- [Module Organization](#module-organization)
- [Testing Strategy](#testing-strategy)
- [Common Workflows](#common-workflows)

---

## Architecture Overview

WalSheetz is a collaborative spreadsheet application built on three core layers:

### 1. React SPA Layer (`frontend/`)
The browser-facing application built with React, Vite, and Luckysheet.

**Key Responsibilities:**
- Render spreadsheet UI with Luckysheet integration
- Manage wallet connections via Sui dApp Kit
- Handle user interactions and routing
- Coordinate UI state through React contexts

**Tech Stack:**
- React 18 (function components, hooks)
- Vite (build tool, dev server)
- Luckysheet (spreadsheet engine)
- React Router (client-side routing)
- Framer Motion (animations)

### 2. Browser Services Layer (`frontend/services/`)
Browser-safe wrappers over blockchain and storage APIs.

**Key Responsibilities:**
- Abstract WebSocket bridge communication (`BrowserGrpcService.js`)
- Provide browser-compatible Sui operations (`BrowserSuiService.js`)
- Handle Walrus storage from browser (`BrowserWalrusService.js`)
- Inject custom formulas into Luckysheet (`services/formulas/`)
- Manage offline capabilities and IndexedDB caching

**Design Pattern:**
All services implement interfaces defined in `frontend/interfaces/` to ensure consistent APIs and enable testing with mocks.

### 3. Blockchain Bridge Layer (`blockchain/`)
Node/Bun services that interact with Sui and Walrus networks.

**Key Responsibilities:**
- Maintain persistent gRPC connections to Sui nodes
- Subscribe to blockchain events and stream to UI
- Execute Walrus storage operations with redundancy
- Rate-limit requests to comply with RPC quotas
- Provide fallback mechanisms (GraphQL when gRPC fails)

**Runtime:**
- Node.js 20+ or Bun 1.0+
- ES modules only (no CommonJS)
- WebSocket server on port 8081 (configurable)

---

## Critical Entry Points

### Frontend Bootstrap
```
frontend/main.jsx
  └─> frontend/presentation/App.jsx
       ├─> frontend/providers/WalletProviders.jsx (Sui network + wallet contexts)
       ├─> React Router (routes to Dashboard or SpreadsheetEditor)
       └─> Global providers (logging, error boundaries, notifications)
```

**Key Files:**
- `frontend/main.jsx:1` - Vite entry point, mounts React root
- `frontend/presentation/App.jsx:20` - Root component with all providers
- `frontend/providers/WalletProviders.jsx:15` - Configures Sui network contexts

### Luckysheet Injection
```
frontend/pages/SpreadsheetEditor.jsx
  └─> frontend/services/luckysheetApi.js
       └─> frontend/services/luckysheet/injectWzIntoSheets.js
            ├─> ensureLuckysheetNesting.js (validate global.luckysheet structure)
            ├─> injectAtRenderTime.js (hook into render lifecycle)
            └─> injectWZLocalePatch.js (custom locale for WZ functions)
```

**Key Files:**
- `frontend/services/luckysheet/injectWzIntoSheets.js:45` - Main injection orchestrator
- `frontend/services/formulas/WalSheetzFunctions.js:20` - Custom WZ.* formula definitions
- `frontend/services/formulas/SuiFunctions.js:30` - Sui blockchain formulas

### WebSocket-gRPC Bridge
```
scripts/start-bridge.js (or bun run bridge)
  └─> blockchain/websocket-grpc-bridge.js
       ├─> blockchain/grpc-service.js (gRPC client setup)
       ├─> blockchain/graphql-event-subscriber.js (fallback subscriber)
       └─> blockchain/event-stream-manager.js (event routing)
```

**Bridge Workflow:**
1. Start WebSocket server on `localhost:8081`
2. Initialize gRPC connection to Sui node
3. Accept WebSocket clients from browser
4. Proxy gRPC requests/responses via WebSocket messages
5. Stream blockchain events to subscribed clients

**Key Files:**
- `blockchain/websocket-grpc-bridge.js:100` - WebSocket server + message router
- `blockchain/grpc-service.js:50` - gRPC client with rate limiting
- `blockchain/graphql-event-subscriber.js:30` - GraphQL fallback when gRPC unavailable

---

## Data Flow

### Spreadsheet Synchronization

```
User Edit in Luckysheet
  │
  ├─> frontend/business/useSpreadsheet.js (React hook)
  │    └─> Debounced save logic (5s or 3+ edits)
  │
  ├─> frontend/adapters/StorageAdapter.js
  │    └─> Compress + delta chain calculation
  │
  ├─> frontend/services/BrowserWalrusService.js
  │    ├─> POST to Walrus publisher (via WebSocket bridge)
  │    └─> Redundant storage across multiple publishers (if enabled)
  │
  └─> Walrus Blob ID returned
       └─> Save to Sui blockchain via BrowserSuiService
            └─> Transaction: save_version(spreadsheet_id, blob_id, content_hash, ...)
```

**Key Configuration:**
- `blockchain/config.js:169` - Auto-save interval (default: 5 seconds)
- `blockchain/config.js:170` - Edit threshold (default: 3 edits)
- `blockchain/config.js:175-191` - Compression, delta chains, batch persistence

### Walrus Persistence Workflow

```
Data Preparation:
  1. Serialize spreadsheet data to JSON
  2. Check size > COMPRESSION_THRESHOLD (16KB)
  3. If yes: gzip compress, prepend magic bytes (0x1f8b)
  4. Calculate delta from last snapshot (if chain < DELTA_MAX_CHAIN)

Storage:
  1. POST /v1/store to Walrus publisher
  2. If WALRUS_REDUNDANCY=true: parallel POST to multiple publishers
  3. HEAD precheck with 5s timeout to verify blob availability
  4. Return blob ID (32-byte hex)

Retrieval:
  1. GET /v1/blobs/{blob_id} from Walrus aggregator
  2. If primary fails: fallback to secondary aggregators
  3. Detect compression (check magic bytes)
  4. Decompress if needed
  5. Reconstruct from delta chain if base snapshot exists
```

**Key Files:**
- `blockchain/walrus-service.js:120` - Compression logic
- `blockchain/walrus-service.js:200` - Redundancy fallback
- `frontend/services/BrowserWalrusService.js:80` - Browser-compatible client

---

## Development Conventions

### Import Aliases
Configured in `vite.config.js:25`:
```javascript
// Instead of: import Foo from '../../utils/Foo.js'
import Foo from '@/utils/Foo.js'           // Frontend modules
import { config } from '@blockchain/config.js'  // Blockchain modules
```

**Rules:**
- Use `@/` for all `frontend/` imports
- Use `@blockchain/` for `blockchain/` imports (only in Node/Bun contexts)
- Avoid `../` relative paths across module boundaries

### Logging
WalSheetz uses centralized logging with environment-based configuration and component-specific filtering.

**Frontend Logger:**
```javascript
import { logger, LogComponent, LogLevel } from '@/utils/Logger.js'

logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'save', 'Saving spreadsheet', { blobId })
logger.error(LogComponent.STORAGE_SERVICE, 'save_failed', 'Save failed', { error })
logger.debug(LogComponent.WALLET_MANAGER, 'connect', 'Wallet connected', { address })
```

**Backend Logger (Node/Bun):**
```javascript
import { createLogger } from './utils/logger.js'
const logger = createLogger('ComponentName')

logger.info('Operation completed', { duration, status })
logger.throttleInfo('throttle-key', 'Repeated operation', { count }, 30000)
```

**Log Levels:**
- `DEBUG` (0) - Detailed diagnostics (opt-in only)
- `INFO` (1) - Normal operations
- `WARN` (2) - Recoverable issues (default in dev)
- `ERROR` (3) - Failures requiring attention
- `CRITICAL` (4) - System-threatening issues

**Controlling Log Verbosity:**

Environment variables (set in `.env` or shell):
```bash
# Frontend log level (browser console)
VITE_LOG_LEVEL=WARN                # DEBUG, INFO, WARN, ERROR, CRITICAL

# Component-specific debug (comma-separated)
VITE_DEBUG_COMPONENTS=BLOCKCHAIN_ADAPTER,STORAGE_SERVICE

# Backend log level (Node/Bun scripts)
LOG_LEVEL=INFO
BRIDGE_LOG_LEVEL=DEBUG             # Bridge-specific override

# Verbose Vite proxy logs
VITE_VERBOSE_PROXY=true
```

Quick debugging without restart (query parameters):
```bash
# Enable all debug logs
http://localhost:3005?debug=true

# Enable debug for specific components
http://localhost:3005?debug=BLOCKCHAIN_ADAPTER
http://localhost:3005?debug=BLOCKCHAIN_ADAPTER,WALLET_MANAGER
```

Runtime debugging (browser console):
```javascript
// Enable debug for components at runtime
window.walSheetzLogConfig.enableDebugForComponents('BLOCKCHAIN_ADAPTER')
window.walSheetzLogConfig.enableDebugForAll()

// View logger metrics
window.walSheetzLogger.getMetrics()
window.walSheetzLogger.exportLogs({ component: 'BLOCKCHAIN_ADAPTER' })
```

**For detailed logging guide, see [debug-logging.md](debug-logging.md)**

### Configuration
**Never hardcode endpoints or feature flags!**

All runtime configuration lives in `blockchain/config.js`:
```javascript
import { getCurrentConfig, isTestnet } from '@blockchain/config.js'

const cfg = getCurrentConfig()
console.log(cfg.sui.rpcUrl)        // Auto-selects testnet or mainnet
console.log(cfg.walrus.publishers)  // Array of Walrus endpoints
console.log(cfg.storage.features.compression.enabled)  // Feature flag
```

**Environment Variables:**
- Read via `config.js` helpers, not `process.env` directly
- Override defaults with env vars (see `docs/CONFIGURATION.md`)
- Bridge uses `BRIDGE_PORT`, `BRIDGE_HOST`, `BRIDGE_LOG_LEVEL`

### Code Style
- **React:** Function components, 2-space indent, single quotes, no semicolons (except when required)
- **Services:** ES modules, async/await, descriptive error messages
- **Types:** TypeScript definitions in `frontend/types/`, JSDoc for JS files
- **Tests:** Vitest for unit/integration, Playwright for E2E

---

## Module Organization

### `frontend/` Directory Map

```
frontend/
├── main.jsx                   # Vite entry point
├── presentation/              # App shell & global UI
│   ├── App.jsx                # Root component with providers
│   ├── components/            # Global UI (Header, ErrorBoundary, MainLayout)
│   └── styles/                # Global CSS
├── pages/                     # Route-level screens
│   ├── Dashboard.jsx          # Document list & creation
│   └── SpreadsheetEditor.jsx  # Luckysheet integration
├── components/                # Reusable UI components
│   ├── DocumentCard.jsx       # Document preview cards
│   ├── CreateDocumentModal.jsx
│   └── StorageAnalyticsDashboard.jsx
├── providers/                 # React context providers
│   └── WalletProviders.jsx    # Sui network + wallet contexts
├── services/                  # Browser API wrappers
│   ├── BrowserGrpcService.js  # WebSocket bridge client
│   ├── BrowserSuiService.js   # Browser Sui operations
│   ├── BrowserWalrusService.js # Browser Walrus client
│   ├── luckysheet/            # Luckysheet integration
│   │   ├── injectWzIntoSheets.js
│   │   ├── ensureLuckysheetNesting.js
│   │   └── injectWZLocalePatch.js
│   ├── formulas/              # Custom spreadsheet formulas
│   │   ├── WalSheetzFunctions.js  # WZ.* functions
│   │   └── SuiFunctions.js        # Sui blockchain formulas
│   └── testing/               # Test mode adapters
├── adapters/                  # Service-to-UI adapters
│   ├── BlockchainAdapter.js
│   └── StorageAdapter.js
├── business/                  # Domain hooks
│   └── useSpreadsheet.js      # Spreadsheet state orchestration
├── core/                      # Engine primitives
│   └── SpreadsheetEngine.js
├── hooks/                     # Shared React hooks
│   ├── useWalletConnection.ts
│   └── useWalletConnectionFactory.ts
├── utils/                     # Utilities
│   ├── Logger.js              # Centralized logging
│   ├── EventBus.js            # Event pub/sub
│   ├── CircuitBreaker.js      # Resilience pattern
│   └── RateLimiter.js         # Client-side rate limiting
├── types/                     # TypeScript definitions
│   ├── blockchain.d.ts
│   ├── wallet.d.ts
│   └── spreadsheet.d.ts
└── interfaces/                # Service interfaces
    ├── IBlockchainService.js
    └── IStorageService.js
```

### `blockchain/` Directory Map

```
blockchain/
├── config.js                      # Network & feature configuration
├── sui-service.js                 # Sui RPC client (JSON-RPC)
├── sui-grpc-service.js            # Sui gRPC client
├── grpc-service.js                # Core gRPC setup
├── walrus-service.js              # Walrus storage operations
├── websocket-grpc-bridge.js       # WebSocket server
├── event-stream-manager.js        # Event subscription coordinator
├── graphql-event-subscriber.js    # GraphQL fallback subscriber
├── deposit-manager.js             # Gas estimation & deposits
├── gas-estimator.js               # Transaction cost calculator
├── version-control.js             # Cell version tracking
└── utils/                         # Shared utilities
    ├── RateLimiter.js             # Rate limiting logic
    ├── ResilientExecutor.js       # Retry + circuit breaker
    └── logger.js                  # Structured logging
```

---

## Testing Strategy

### Current Coverage
- ✅ **Unit Tests:** `tests/unit/blockchain/` (Sui gRPC, GraphQL, Walrus)
- ❌ **Frontend Unit Tests:** `tests/unit/frontend/` (planned, not implemented)
- ⚠️ **Integration Tests:** `tests/integration/` (partial coverage)
- ⚠️ **E2E Tests:** `tests/e2e/` (basic Playwright setup)

### Running Tests
```bash
# Unit tests (blockchain only currently)
bun run test:unit

# Walrus integration tests (requires bridge running)
bun run test:walrus

# All tests with coverage
bun run test:coverage

# E2E tests
bun run test:e2e:playwright
```

**Bridge Requirements:**
Integration tests require the WebSocket bridge:
```bash
# Terminal 1: Start bridge
bun run bridge

# Terminal 2: Run integration tests
bun run test:integration
```

### Test Conventions
- **Vitest** for unit/integration tests
- **Playwright** for E2E tests
- **fast-check** for property-based tests
- Mock implementations in `frontend/services/testing/`

See **[docs/TESTING.md](TESTING.md)** for detailed testing guide.

---

## Common Workflows

### Starting Development
```bash
# Full stack (recommended for blockchain features)
bun install
bun run dev:full   # Starts bridge + UI

# UI only (faster iteration, no blockchain)
bun run dev
```

### Adding a New Service
1. Create interface in `frontend/interfaces/IYourService.js`
2. Implement browser wrapper in `frontend/services/BrowserYourService.js`
3. If Node-only logic needed, create `blockchain/your-service.js`
4. Update `blockchain/config.js` with any new configuration
5. Write unit tests in `tests/unit/`
6. Document in this README and relevant AGENTS.md

### Adding a Custom Formula
1. Define function in `frontend/services/formulas/WalSheetzFunctions.js`
2. Register in `WalSheetzFunctions.registerFunctions()`
3. Update locale patch in `injectWZLocalePatch.js` if needed
4. Test in Luckysheet: `=WZ.YOURFUNCTION(A1)`

### Debugging Bridge Issues
```bash
# Start bridge with debug logging
BRIDGE_LOG_LEVEL=DEBUG bun run bridge

# Full stack with debug logging
LOG_LEVEL=DEBUG BRIDGE_LOG_LEVEL=DEBUG bun run dev:full

# Enable frontend blockchain debug (query param or env)
http://localhost:3005?debug=BLOCKCHAIN_ADAPTER,STORAGE_SERVICE
# OR
VITE_DEBUG_COMPONENTS=BLOCKCHAIN_ADAPTER,STORAGE_SERVICE bun run dev

# Check bridge health
curl http://localhost:8081/health

# View metrics
curl http://localhost:8081/metrics

# Diagnose save issues
bun run diagnose:save
```

**See [debug-logging.md](debug-logging.md) for detailed debugging scenarios**

### Switching Networks
Edit `blockchain/config.js:399`:
```javascript
environment: 'testnet'  // or 'mainnet'
```

**Warning:** Ensure wallet is on matching network and package IDs are correct for target environment.

---

## Additional Resources

- **[upgrade-guide.md](upgrade-guide.md)** - 🆕 Upgrade-safe Walrus ↔︎ Sui integration guide
- **[debug-logging.md](debug-logging.md)** - Debug logging guide & verbosity control
- **[TESTING.md](TESTING.md)** - Comprehensive testing guide
- **[CONFIGURATION.md](CONFIGURATION.md)** - Environment variables & feature flags
- **[scripts/README.md](scripts/README.md)** - Script catalog & usage
- **[bridge-server-enhancements.md](bridge-server-enhancements.md)** - Bridge architecture
- **[frontend/AGENTS.md](../frontend/AGENTS.md)** - AI assistant guide for frontend
- **[blockchain/AGENTS.md](../blockchain/AGENTS.md)** - AI assistant guide for blockchain

---

## Quick Reference

### Port Map
- **3005**: Vite dev server (UI)
- **8081**: WebSocket-gRPC bridge

### Key Environment Variables
- `BRIDGE_PORT=8081` - Bridge server port
- `VITE_LOG_LEVEL=WARN` - Frontend log level (DEBUG, INFO, WARN, ERROR, CRITICAL)
- `LOG_LEVEL=INFO` - Backend log level (DEBUG, INFO, WARN, ERROR, CRITICAL)
- `BRIDGE_LOG_LEVEL=INFO` - Bridge-specific log level override
- `VITE_DEBUG_COMPONENTS=` - Component-specific debug (e.g., BLOCKCHAIN_ADAPTER,WALLET_MANAGER)
- `VITE_VERBOSE_PROXY=false` - Verbose Vite proxy logging
- `WALRUS_COMPRESSION=true` - Enable Walrus compression
- `RATE_LIMITER_ENABLED=true` - Enable rate limiting

### Common Issues
1. **Bridge won't start**: Check port 8081 with `bun run cleanup`
2. **Wallet won't connect**: Verify network match (testnet/mainnet)
3. **Save fails**: Check Walrus publisher availability, run `bun run diagnose:save`
4. **gRPC errors**: Fallback to GraphQL should be automatic, check `BRIDGE_LOG_LEVEL=DEBUG`

---

For questions or contributions, see the main [README.md](../README.md) or open an issue on GitHub.
