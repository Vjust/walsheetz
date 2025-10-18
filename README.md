# 🦭 WalSheetz - Arctic Collaborative Spreadsheets

Navigate your data like a walrus on ice! A powerful spreadsheet application with **Sui blockchain integration** and **Walrus decentralized storage** built with Vite and Bun.

> **📌 Current MVP Scope**: This is a **single-user MVP deployment**.
> - ✅ Full blockchain integration (Sui RPC, Walrus storage)
> - ✅ Standalone operation (no bridge server required)
> - ❌ Collaboration features disabled (Phase 2)
>
> Real-time collaboration (cell locking, multi-user presence, WebSocket bridge) will be implemented in Phase 2. For the current single-user deployment, the application runs standalone through Sui RPC with full decentralized storage via Walrus.

## 🌊 Blockchain Features

- **Sui Wallet Integration**: Connect with Sui Wallet, Suiet, or other compatible wallets
- **Automatic Saving**: Data saved to Walrus every 5 seconds or after 3+ edits
- **Version Control**: Cell-level versioning with decentralized blockchain storage
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

### Testing
- `bun run test:unit` - Run unit tests (Vitest)
- `bun run test:unit:watch` - Run unit tests in watch mode
- `bun run test:integration` - Run integration tests
- `node scripts/test-spreadsheet-crud.js` - Run CRUD flow integration test
- `node scripts/test-spreadsheet-formulas.js` - Test formula evaluation

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

## 🔧 Troubleshooting

### CRUD Operations Issues

#### "Spreadsheet not found on blockchain"
**Problem:** You see this message when trying to save a spreadsheet.

**Causes:**
- Spreadsheet was deleted from the blockchain
- Session data is stale after a long idle period
- Wallet was switched to a different account

**Solutions:**
1. Refresh the page - the session will be cleared
2. Create a new spreadsheet
3. Connect your wallet if it's disconnected

#### "Walrus fetch failed: Blob may have expired"
**Problem:** Cannot load a spreadsheet that existed before.

**Causes:**
- Walrus blob storage period ended (Walrus blobs have expiration)
- Data was never successfully written to Walrus
- Network connectivity issue to Walrus service

**Solutions:**
1. Check your network connection
2. For critical data, ensure auto-save is enabled
3. Contact support if data is lost - may need to restore from backup
4. Set higher Walrus epoch preference for longer retention (default is 50 epochs)

#### Auto-save is paused
**Problem:** You see "Auto-save paused" message and changes aren't being saved.

**Causes:**
- Wallet is disconnected or not responding
- Network connectivity lost
- Auto-save is disabled in settings

**Solutions:**
1. Check if wallet is connected (look for wallet button status)
2. Reconnect your Sui wallet
3. Wait for network connection to be restored
4. Enable auto-save in settings (if disabled)

#### Create/Save/Delete operations fail
**Problem:** Create, save, or delete operations show errors or don't complete.

**Causes:**
- Wallet not connected
- Insufficient SUI balance for gas fees
- Network timeout or connectivity issues
- Blockchain service unavailable

**Solutions:**
1. Connect your wallet: Click "🦭 Connect Wallet" button
2. Check wallet balance: Need at least 0.5 SUI for operations
3. Use faucet to get test SUI: [Sui Testnet Faucet](https://faucet.testnet.sui.io/)
4. Check network status at [Sui Status](https://suistatus.com/)
5. Wait a moment and retry (transient network issues)

#### "Please connect your wallet to load spreadsheets"
**Problem:** Cannot load saved spreadsheets.

**Causes:**
- Wallet not connected
- Session expired
- Signed in with different wallet than original

**Solutions:**
1. Connect wallet: Click "🦭 Connect Wallet"
2. Ensure you're using the same wallet account
3. Refresh the page if wallet connection status seems stuck

### Data & Storage Issues

#### Data is missing after refresh
**Problem:** Edits are lost after page refresh.

**Causes:**
- Auto-save was disabled
- Wallet disconnected before save completed
- Browser storage cleared

**Solutions:**
1. Enable auto-save in settings (enabled by default)
2. Keep wallet connected while editing
3. Check browser privacy settings - may be clearing storage

#### Spreadsheets list is empty but I have saved sheets
**Problem:** Dashboard shows "No spreadsheets found" but you have created some.

**Causes:**
- Wallet not connected
- Connected with different wallet account
- Local session cleared
- Blockchain query failed

**Solutions:**
1. Connect wallet - must be same account where sheets were created
2. Check wallet address to confirm correct account
3. Refresh page and wait for data to load
4. Check browser console for errors: Right-click → Inspect → Console

### Performance & Advanced

#### Spreadsheet loads slowly
**Problem:** Takes a long time to load a spreadsheet.

**Causes:**
- Large spreadsheet with many cells/formulas
- Slow network connection
- Walrus blob is large and needs to be fetched

**Solutions:**
1. Check network speed
2. Move to a location with better connectivity
3. Break large spreadsheets into smaller ones
4. Set appropriate Walrus epoch preference to avoid re-fetching

#### High gas fees for operations
**Problem:** Blockchain transactions cost more SUI than expected.

**Causes:**
- Network congestion
- Large data payload being stored
- Multiple concurrent operations

**Solutions:**
1. Batch edits - make multiple changes before saving
2. Use auto-save to spread operations over time
3. Monitor gas prices during off-peak hours
4. Optimize data by deleting unused cells

### Testing & Validation

Run these commands to test CRUD operations:

```bash
# Test individual CRUD flows
node scripts/test-spreadsheet-crud.js

# Run full test suite
bun run test:unit

# Watch mode for development
bun run test:watch
```

For comprehensive diagnostics:

```bash
# Check blockchain connectivity
bun run test:proxy

# Test wallet connection
bun run test:wallet

# Diagnose save issues
bun run diagnose:save
```

## 📞 Support

If you encounter issues not covered above:

1. **Check the browser console** (F12 → Console tab) for detailed error messages
2. **Review logs** in your browser's Local Storage
3. **Test basic connectivity**: `bun run test:proxy`
4. **Report issues** with detailed error messages and reproduction steps



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

Built with ❄️ by the WalSheetz team - Now with decentralized blockchain storage! 🦭⛓️