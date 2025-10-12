# 🦭 WalSheetz - Arctic Collaborative Spreadsheets

Navigate your data like a walrus on ice! A powerful spreadsheet application with **Sui blockchain integration** and **Walrus permanent storage** built with Vite and Bun.

## 🌊 Blockchain Features

- **Sui Wallet Integration**: Connect with Sui Wallet, Suiet, or other compatible wallets
- **Automatic Saving**: Data saved to Walrus every 5 seconds or after 3+ edits
- **Version Control**: Cell-level versioning with permanent blockchain storage
- **Walrus Quilt**: Efficient batch storage for small file optimization
- **Testnet Ready**: Full support for Sui testnet with easy mainnet migration

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh) v1.0+ 
- Modern browser with ES2020 support

### Installation

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Clone the repository
git clone [your-repo-url]
cd walsheetz

# Install dependencies with Bun
bun install
```

### Development

```bash
# Start development server (UI only)
bun run dev

# Start full stack (WebSocket bridge + UI)
bun run dev:full
```

The application will open at `http://localhost:3005`

**Development Modes:**
- **UI Only** (`bun run dev`): Frontend development without blockchain features
- **Full Stack** (`bun run dev:full`): Complete system with WebSocket-gRPC bridge for blockchain integration

### Core Functionality

The application provides three main features:
1. **Spreadsheet Loading**: Luckysheet-powered spreadsheet functionality
2. **Home Navigation**: Working home button that redirects to homepage
3. **Wallet Integration**: Connect wallet button with deposit functionality

## 🎯 Current Implementation Status

**WORKING FEATURES:**
- ✅ Spreadsheet loads and initializes properly
- ✅ Home button navigates to homepage
- ✅ Wallet connect button with visual feedback
- ✅ Deposit button appears after wallet connection

**ARCHITECTURE DECISIONS:**
- Simple script tag loading instead of ES modules for reliability
- Minimal implementation following BREVITY principle
- Structured JSON logging for validation and debugging

### Build for Production

```bash
# Create optimized production build
bun run build

# Preview production build
bun run preview
```

## 🛠️ Tech Stack

- **Runtime:** Bun
- **Build Tool:** Vite
- **Spreadsheet Engine:** Luckysheet
- **Styling:** Arctic Theme CSS

## 📝 Scripts

### Development
- `bun run dev` - Start development server (UI only)
- `bun run dev:full` - Start full stack (bridge + UI)
- `bun run bridge` - Start WebSocket-gRPC bridge only
- `bun run cleanup` - Clean up occupied ports

### Build & Deploy
- `bun run build` - Build for production
- `bun run preview` - Preview production build
- `bun run typecheck` - Run TypeScript type checking

### Testing
- `bun run test:unit` - Run unit tests (blockchain/walrus only currently)
- `bun run test:coverage` - Generate coverage report
- `bun run test:walrus` - Run Walrus integration tests
- `bun run test:integration` - Run integration tests
- `bun run test:property` - Run property-based tests
- `bun run test:e2e:playwright` - Run E2E tests with Playwright

### Diagnostics
- `bun run diagnose:save` - Diagnose save issues
- `bun run test:proxy` - Test proxy configuration
- `bun run test:wallet` - Test wallet connection

See [docs/scripts/README.md](docs/scripts/README.md) for detailed script documentation.

## 🎨 Features

- ❄️ Arctic-themed UI
- 🦭 Walrus-strong performance
- 🌊 Ocean of data handling
- 🏔️ Tundra-tough reliability

## 🧊 Developer Tools

Open the browser console and use:

```javascript
// Traditional tools
devTools.forceSave()    // Force save current edits
devTools.inspectRAM()   // View RAM storage contents
devTools.listBlobs()    // List all saved blobs
devTools.reset()        // Clear all storage
devTools.getStatus()    // Get current system status
devTools.toggleArctic() // Toggle arctic theme

// Blockchain tools
devTools.connectWallet()          // Connect Sui wallet
devTools.getWalletInfo()          // Get wallet connection info
devTools.forceBlockchainSave()    // Force save to blockchain
devTools.getVersionStats()        // Get version control stats
devTools.getBatchStatus()         // Get Walrus batch status
devTools.inspectVersions(row, col) // Get cell version history
devTools.simulateEdits(count)     // Simulate edits for testing
devTools.testWalletConnection()   // Test wallet functionality
```

## 📦 Project Structure

```
walsheetz/
├── blockchain/              # Node/Bun blockchain services
│   ├── config.js            # Network & feature configuration
│   ├── sui-service.js       # Sui RPC operations
│   ├── sui-grpc-service.js  # Sui gRPC integration
│   ├── grpc-service.js      # Core gRPC client
│   ├── walrus-service.js    # Walrus storage operations
│   ├── websocket-grpc-bridge.js # WebSocket-gRPC bridge server
│   ├── event-stream-manager.js  # Event subscription handling
│   ├── graphql-event-subscriber.js # GraphQL fallback for events
│   └── utils/               # Rate limiter, logging, resilience
├── frontend/                # React SPA
│   ├── main.jsx             # Vite entry point
│   ├── presentation/        # App shell, routing, error boundaries
│   │   ├── App.jsx          # Root component with providers
│   │   └── components/      # Global UI elements
│   ├── pages/               # Route-level screens (Dashboard, SpreadsheetEditor)
│   ├── components/          # Reusable UI components
│   ├── providers/           # React context providers (Wallet, Spreadsheet)
│   ├── services/            # Browser-safe API wrappers
│   │   ├── BrowserGrpcService.js    # WebSocket bridge client
│   │   ├── BrowserSuiService.js     # Browser Sui operations
│   │   ├── BrowserWalrusService.js  # Browser Walrus client
│   │   └── luckysheet/      # Luckysheet injection & extensions
│   ├── adapters/            # Service-to-UI adapters
│   ├── business/            # Domain hooks (useSpreadsheet)
│   ├── core/                # Spreadsheet engine primitives
│   ├── hooks/               # Shared React hooks
│   ├── utils/               # Logger, EventBus, CircuitBreaker
│   ├── types/               # TypeScript definitions
│   └── interfaces/          # Service interfaces
├── scripts/                 # Operational utilities
│   ├── start-bridge.js      # Bridge server startup
│   ├── cleanup-ports.js     # Port cleanup utility
│   ├── run-walrus-integration-tests.js
│   ├── test-blockchain-integration.js
│   ├── diagnose-save-issues.js
│   └── verify-*.js          # Verification scripts
├── tests/                   # Test suites
│   └── unit/                # Unit tests (blockchain/walrus only currently)
│       └── blockchain/      # Blockchain service tests
│       # Note: integration/, property/, e2e/ directories planned but not yet created
├── docs/                    # Documentation
│   ├── README.md            # Developer guide (see below)
│   ├── TESTING.md           # Testing guide
│   ├── CONFIGURATION.md     # Environment & config reference
│   └── scripts/             # Script catalog
├── move/                    # Sui Move smart contracts
├── index.html               # Main entry point
├── vite.config.js           # Vite configuration
└── package.json             # Dependencies & scripts
```

For detailed architecture and development conventions, see **[docs/README.md](docs/README.md)**.

## 🏗️ Building with Bun

Bun provides ultra-fast installation and execution:

```bash
# Install specific package
bun add [package-name]

# Install dev dependency
bun add -d [package-name]

# Update all dependencies
bun update
```

## 🚢 Deployment

Build files are output to the `dist/` directory:

```bash
bun run build
# Deploy contents of dist/ to your hosting service
```

## ⚙️ Blockchain Configuration

### Testnet Setup (Default)
1. Install Sui Wallet browser extension
2. Create a new wallet or import existing
3. Switch to Sui Testnet in wallet settings
4. Get test tokens from [Sui Faucet](https://faucet.testnet.sui.io/)
5. Open WalSheetz and click "Connect Wallet"

### Environment Configuration
Edit `blockchain/config.js` to switch networks:

```javascript
// Current environment - change to 'mainnet' for production
environment: 'testnet' // or 'mainnet'
```

### Auto-Save Settings
Customize auto-save behavior in `blockchain/config.js`:

```javascript
storage: {
  autoSaveInterval: 5000, // 5 seconds
  editThreshold: 3,       // Save after 3 edits
  maxVersionHistory: 100, // Keep last 100 versions per cell
  batchSize: 50          // Max changes per Walrus blob
}
```

## 🔧 Troubleshooting

### Wallet Connection Issues
- Ensure Sui Wallet is installed and unlocked
- Check network selection (testnet vs mainnet)
- Verify sufficient SUI tokens for gas fees
- Refresh page and try reconnecting

### Save Failures
- Check wallet connection status
- Verify network connectivity
- Ensure sufficient SUI balance for transactions
- Check browser console for detailed error messages

### Development
- Use `devTools.getStatus()` to check system status
- Use `devTools.testWalletConnection()` to test wallet
- Check Network tab for failed API calls
- Monitor console for blockchain service errors

## Configuration & Environment Variables

### Storage Features

#### Compression
- `WALRUS_COMPRESSION` (default: `true`) - Enable/disable automatic gzip compression for large payloads
- `COMPRESSION_THRESHOLD` (default: `16384`) - Minimum size in bytes before compression is applied (16KB)
  - Large spreadsheets automatically compress when exceeding threshold
  - Compression ratios typically 1.3x-5x for spreadsheet data
  - Transparent decompression on retrieval

#### Redundancy
- `WALRUS_REDUNDANCY` (default: `false`) - Enable redundant storage across multiple Walrus endpoints
  - When enabled, stores to multiple publishers for fault tolerance
  - Automatic fallback during retrieval if primary fails
  - HEAD precheck with 5-second timeout before GET requests

#### Delta Chains
- `DELTA_MAX_CHAIN` (default: `5`) - Maximum delta chain length before forcing full snapshot
  - Stores incremental changes instead of full data
  - Automatically reconstructs from delta chain
  - Forces full snapshot when chain reaches max length
  - Fails explicitly on missing base or corrupted chain

#### Batch Persistence  
- `BATCH_PERSISTENCE` (default: `true`) - Enable localStorage persistence of edit batches
  - Prevents data loss on browser refresh
  - Automatically resumes interrupted uploads
  - Clears persisted batches after successful upload

#### Sponsor Service
- `SPONSOR_DEMO_EVENTS` (default: `false`) - Enable placeholder Move event emissions
  - ⚠️ Warning: Only for demo/testing purposes
  - When disabled, no placeholder `0x2::event::emit` calls are made
  - Production deployments should keep this disabled

### Testing

Run the test suite:

```bash
# Unit tests (blockchain/walrus services only currently)
bun run test:unit

# Integration tests
bun run test:integration

# Walrus integration tests
bun run test:walrus

# Property-based tests
bun run test:property

# Coverage report (target: 80%+)
bun run test:coverage

# E2E tests
bun run test:e2e:playwright
```

**Current Test Coverage:**
- ✅ Blockchain services (Sui gRPC, GraphQL, rate limiting)
- ✅ Walrus integration (compression, redundancy, delta chains)
- ✅ Transaction serialization and gas estimation
- ✅ Event queries with fully-qualified types
- ❌ Frontend unit tests (planned but not yet implemented)
- ⚠️ Integration tests (partial coverage)
- ⚠️ E2E tests (basic infrastructure in place)

See **[docs/TESTING.md](docs/TESTING.md)** for detailed testing guide and coverage gaps.

### Troubleshooting

#### Compression Issues
- Check browser console for compression ratio logs
- Verify `CompressionStream` API support in browser
- Large files show `isCompressed: true` in logs

#### Redundancy Failures
- Check `usedFallback: true` in retrieval logs
- Verify multiple endpoints configured in `config.walrus.publishers`
- Monitor correlation IDs for request tracking

#### Delta Chain Errors
- "Delta chain too long" - Chain exceeded `DELTA_MAX_CHAIN`
- "Missing base" - Base snapshot not found, data corrupted
- Check `chainDepth` in storage logs

#### Gas Estimation
- Ensure wallet has sufficient SUI balance
- Check `estimatedCostSUI` in transaction logs
- Monitor `gasPrice` cache (30-second expiry)

---

Built with ❄️ by the WalSheetz team - Now with permanent blockchain storage! 🦭⛓️