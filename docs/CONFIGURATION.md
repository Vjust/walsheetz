# WalSheetz Configuration Guide

This guide documents all environment variables, feature flags, and configuration options for WalSheetz.

## Table of Contents
- [Configuration Sources](#configuration-sources)
- [Network Configuration](#network-configuration)
- [Bridge Server Configuration](#bridge-server-configuration)
- [Walrus Storage Configuration](#walrus-storage-configuration)
- [Storage Features](#storage-features)
- [Rate Limiting Configuration](#rate-limiting-configuration)
- [Development & Testing](#development--testing)
- [Network Switching](#network-switching)

---

## Configuration Sources

### Configuration Hierarchy
1. **Environment Variables** - Highest priority (`.env` files, shell exports)
2. **blockchain/config.js** - Default configuration with environment detection
3. **app-config.json** - On-chain package IDs and network-specific settings

### Reading Configuration
**Always use `blockchain/config.js` helpers:**
```javascript
import { getCurrentConfig, isTestnet, isMainnet } from '@blockchain/config.js'

const cfg = getCurrentConfig()
console.log(cfg.sui.rpcUrl)         // Network-aware RPC endpoint
console.log(cfg.walrus.publishers)  // Array of Walrus publishers
console.log(cfg.storage.features.compression.enabled)  // Feature flag
```

**Never hardcode endpoints or read `process.env` directly!**

---

## Network Configuration

### Sui Network Settings

#### Testnet (Default)
**Location:** `blockchain/config.js:17-43`

```javascript
environment: 'testnet'  // Change to 'mainnet' for production
```

**Endpoints:**
- **RPC URL:** `https://fullnode.testnet.sui.io:443`
- **gRPC URL:** `fullnode.testnet.sui.io:443`
- **GraphQL URL:** `https://sui-testnet.mystenlabs.com/graphql`
- **Faucet:** `https://faucet.testnet.sui.io/gas`
- **Explorer:** `https://testnet.suivision.xyz`

**Contract Addresses:**
- **Package ID:** `0xe7f62142b48f1b1746bd7dd7b695f0e2e5952879662ab7d755fdd9081b189fa7`
- **Registry Object ID:** `0x9a6b94f79762fa608c5f0938d092744a8e5b69852f860eb17afa4ab11e24fe25`

#### Mainnet
**Location:** `blockchain/config.js:45-65`

**Endpoints:**
- **RPC URL:** `https://fullnode.mainnet.sui.io:443`
- **gRPC URL:** `fullnode.mainnet.sui.io:443`
- **GraphQL URL:** `https://sui-mainnet.mystenlabs.com/graphql`
- **Explorer:** `https://suivision.xyz`

**Contract Addresses:**
- **Package ID:** `0x991454976a4ef8535ed3572bb1c500dcd565855d49a51f1fadc7f70a316c9631`
- **Registry Object ID:** `0x66f68bfb639dbc7f24519bcdbbfdb376057d87c6d508ea7a8d67746a11721ca5`

### Network Features

#### Content Hash in Save
**Location:** `blockchain/config.js:29`, `config.js:53`

```bash
# Always enabled for deployed contracts
features.contentHashInSave: true
```

The deployed contracts require `content_hash` parameter in `save_version()`. Do not disable.

#### gRPC Checkpoint Streaming
**Location:** `blockchain/config.js:34`, `config.js:56`

```bash
# Testnet: disabled (returns UNIMPLEMENTED)
sui.testnet.features.supportsCheckpointStream: false

# Mainnet: enabled
sui.mainnet.features.supportsCheckpointStream: true
```

Controls whether to attempt gRPC checkpoint streaming or immediately fallback to GraphQL.

---

## Bridge Server Configuration

### Port & Host
**Location:** `blockchain/config.js:247-249`

```bash
# Environment Variables
BRIDGE_PORT=8081              # Default: 8081
BRIDGE_HOST=localhost         # Default: localhost (use 0.0.0.0 for Docker)
BRIDGE_MAX_CLIENTS=100        # Default: 100
```

**Access:** `config.websocket.port`, `config.websocket.host`

### Logging
**Location:** `blockchain/config.js:251`

```bash
BRIDGE_LOG_LEVEL=INFO   # DEBUG, INFO, WARN, ERROR, CRITICAL
```

**Levels:**
- **DEBUG** - Detailed diagnostics, message contents, timing
- **INFO** - Standard operations, connections, major events
- **WARN** - Non-critical issues, fallbacks
- **ERROR** - Errors requiring attention
- **CRITICAL** - System-threatening issues

**Example:**
```bash
# Verbose bridge debugging
BRIDGE_LOG_LEVEL=DEBUG bun run bridge
```

### Health Checks & Metrics
**Location:** `blockchain/config.js:252-257`

```bash
ENABLE_METRICS=false          # Default: false (set to 'true' to enable for Prometheus)
```

**How it works:**
- Default (`ENABLE_METRICS` unset or any value except `'true'`): Metrics **disabled**
- Set `ENABLE_METRICS=true`: Metrics **enabled**

**Endpoints (when enabled):**
- `http://localhost:8081/health` - Basic liveness check (always available)
- `http://localhost:8081/ready` - Readiness probe (checks gRPC + WebSocket, always available)
- `http://localhost:8081/metrics` - Prometheus-style metrics (requires `ENABLE_METRICS=true`)
- `http://localhost:8081/status` - Detailed status with client info (always available)

---

## Walrus Storage Configuration

### Publisher & Aggregator URLs
**Location:** `blockchain/config.js:70-86`

#### Testnet
```bash
# Primary endpoints (proxied in dev)
publisherUrl: '/walrus-publisher'       # Dev mode
publisherUrl: 'https://publisher.walrus-testnet.walrus.space'  # Production

aggregatorUrl: '/walrus-aggregator'     # Dev mode
aggregatorUrl: 'https://aggregator.walrus-testnet.walrus.space'  # Production
```

**Force absolute URLs in dev:**
```bash
WALRUS_USE_ABSOLUTE=true
```

#### Mainnet
```bash
publisherUrl: 'https://publisher.walrus.space'
aggregatorUrl: 'https://aggregator.walrus.space'
```

### Redundancy
**Location:** `blockchain/config.js:89-95`

```bash
WALRUS_REDUNDANCY=false   # Default: false
```

**Settings:**
- `maxEndpoints: 3` - Write to up to 3 publishers
- `minSuccessful: 1` - At least 1 must succeed
- `writeTimeout: 30000` - 30 seconds per write
- `healthCheckInterval: 60000` - 1 minute health checks

**How it works:**
1. Parallel POST to multiple publishers
2. HEAD precheck (5s timeout) to verify blob availability
3. Automatic fallback to secondary aggregators on retrieval

### Walrus SDK
**Location:** `blockchain/config.js:100-102`

```bash
WALRUS_USE_SDK=false          # Default: false (safe rollout)
WALRUS_EPOCHS_DEFAULT=50      # Default: 50 epochs
WALRUS_EPOCH_RENEWAL_WARNING=7  # Warn users N days before expiry
```

**SDK Network:** Auto-detected from `config.environment` (testnet/mainnet)

---

## Storage Features

### Compression
**Location:** `blockchain/config.js:177-179`

```bash
WALRUS_COMPRESSION=true           # Default: true
COMPRESSION_THRESHOLD=16384       # 16KB default
```

**How it works:**
1. Check payload size > `COMPRESSION_THRESHOLD`
2. If yes: gzip compress, prepend magic bytes (`0x1f8b`)
3. Automatic decompression on retrieval (magic byte detection)

**Typical compression ratios:** 1.3x-5x for spreadsheet data

### Delta Chains
**Location:** `blockchain/config.js:182-185`

```bash
ENABLE_DELTA=true                 # Default: true
DELTA_MAX_CHAIN=5                 # Max 5 deltas before full snapshot
```

**How it works:**
1. Store incremental changes instead of full data
2. Reconstruct from delta chain on retrieval
3. Force full snapshot when chain reaches `DELTA_MAX_CHAIN`
4. Explicit failure on missing base or corrupted chain

**Chain depth tracking:** Logged as `chainDepth` in storage logs

### Batch Persistence
**Location:** `blockchain/config.js:187-190`

```bash
BATCH_PERSISTENCE=true            # Default: true
```

**Settings:**
- `storageKey: 'walsheetz_batch_'` - LocalStorage prefix
- `maxBatchAge: 30000` - 30 seconds max batch age

**How it works:**
1. Persist edit batches to localStorage
2. Prevent data loss on browser refresh
3. Auto-resume interrupted uploads
4. Clear persisted batches after successful upload

### Chunk Purchase & Renewal Metadata

Walrus storage is time-bound. Each blob is pinned for a fixed number of epochs (≈2 days per epoch on testnet). To help users manage renewals we add metadata to both the Walrus payload and the indexing layer.

**Walrus Payload:**
Every spreadsheet blob encodes a `chunk` record:

```json
{
  "chunk": {
    "epochsPurchased": 50,
    "epochStart": 123456,
    "epochEnd": 123506,
    "expiryTimestamp": 1739481600000,
    "renewalCount": 1,
    "lastRenewedAt": 1736899200000,
    "purchaseReceipt": "0x...",        // optional Walrus receipt id
    "notes": "Mainnet archive copy"
  }
}
```

**Config Defaults:**

```bash
WALRUS_EPOCHS_DEFAULT=50          # Default epochs when saving
WALRUS_EPOCH_RENEWAL_WARNING=7    # Warn when <7 days remain
WALRUS_EPOCH_MAX=200              # Upper bound users can pick in UI
```

**Renewal Flow:**

1. Auto-save writes to Walrus immediately using the configured epoch count.
2. Every five minutes we prompt the user to “Publish to Sui” (committing the latest Walrus blob id).
3. The prompt shows: current chunk expiry, renewal cost estimate (epochs × Walrus price), and “Don’t ask again this session”.
4. When `expiryTimestamp - now` < `WALRUS_EPOCH_RENEWAL_WARNING` days we raise a prominent banner and send the same info to the off-chain index so other clients see the approaching deadline.

**Index Fields (Sui + off-chain service):**

| Field | Description |
|-------|-------------|
| `chunkEpochs` | Epochs purchased for this blob |
| `chunkExpiry` | UNIX ms timestamp of expiry |
| `renewalStatus` | `active`, `expiring_soon`, `expired` |
| `renewalCount` | Number of times renewed |
| `lastRenewedAt` | Timestamp of last renewal |
| `defaultEpochSelection` | Suggested epochs for next save |

**UI Behaviour:**

- Display chunk info in the status bar and dataset explorer.
- "Renew storage" button shortcuts to Walrus purchase flow when expiry is near.
- When users choose a different duration the selection persists per spreadsheet.
- Users can open the Storage Management modal via "Manage Storage" button on expiry warnings.
- Epoch preference is saved per spreadsheet in localStorage under `walsheetz_epoch_pref_{spreadsheetId}`.

**Implementation:**

See [`docs/WALRUS_EPOCH_SELECTION_GUIDE.md`](WALRUS_EPOCH_SELECTION_GUIDE.md) for complete implementation details and threading instructions.

See [`docs/architecture/walrus-indexing.md`](architecture/walrus-indexing.md) for the full ADR.

---

## Rate Limiting Configuration

### Global Rate Limiter
**Location:** `blockchain/config.js:31`, `config.js:99`

```bash
RATE_LIMITER_ENABLED=true         # Default: true
```

**Disable rate limiting:**
```bash
RATE_LIMITER_ENABLED=false bun run dev:full
```

### Sui RPC Rate Limits
**Location:** `blockchain/config.js:38-43`

```bash
SUI_MAX_RPS=3                     # Max requests per second
SUI_BURST=6                       # Burst capacity
SUI_MAX_CONCURRENT=4              # Max concurrent requests
```

### Walrus Rate Limits
**Location:** `blockchain/config.js:106-117`

```bash
# Aggregator (reads)
WALRUS_AGG_MAX_RPS=3
WALRUS_AGG_BURST=3
WALRUS_AGG_MAX_CONCURRENT=2

# Publisher (writes)
WALRUS_PUB_MAX_RPS=1
WALRUS_PUB_BURST=1
WALRUS_PUB_MAX_CONCURRENT=1
```

**Why conservative limits:**
- Walrus is in testnet/early stages
- Prevent rate limit errors (HTTP 429)
- Ensure fair usage

### Rate Limiter Status UI
**Location:** `blockchain/config.js:262`

```bash
SHOW_RATE_LIMITER_STATUS=false    # Default: false
```

Enable in-app rate limiter status widget for debugging.

---

## Development & Testing

### Test Mode
**Location:** `frontend/services/testing/TestModeAdapter.js`

```bash
# Enable test mode with mock wallet
VITE_TEST_MODE=true
```

**Features:**
- Mock wallet connection (no browser extension required)
- Simulated transactions
- Skip real blockchain interactions

See [docs/test-mode.md](test-mode.md) for details.

### Auto-Save Settings
**Location:** `blockchain/config.js:169-172`

```javascript
storage: {
  autoSaveInterval: 5000,     // 5 seconds
  editThreshold: 3,           // Save after 3 edits
  maxVersionHistory: 100,     // Keep last 100 versions per cell
  batchSize: 50               // Max changes per Walrus blob
}
```

**Customization:**
Edit `blockchain/config.js` directly (no env vars for these).

### Sponsor Demo Events
**Location:** Feature flag in contract/bridge

```bash
SPONSOR_DEMO_EVENTS=false         # Default: false
```

**Warning:** Only for demo/testing. When disabled, no placeholder `0x2::event::emit` calls are made.

---

## Network Switching

### How to Switch Networks

1. **Edit `blockchain/config.js`:**
   ```javascript
   // Line 399
   environment: 'mainnet'  // or 'testnet'
   ```

2. **Update wallet network:**
   - Open Sui Wallet extension
   - Settings → Network → Select matching network

3. **Verify package IDs:**
   - Check `blockchain/config.js` testnet/mainnet sections
   - Ensure `packageId` and `registryObjectId` are correct
   - Cross-reference with `app-config.json` if present

4. **Restart development server:**
   ```bash
   bun run dev:full
   ```

### Network Detection
**Helpers:**
```javascript
import { isTestnet, isMainnet } from '@blockchain/config.js'

if (isTestnet()) {
  // Testnet-specific logic
}

if (isMainnet()) {
  // Mainnet-specific logic
}
```

### Network-Specific Behavior
- **Testnet:** gRPC checkpoint streaming disabled (uses GraphQL fallback)
- **Mainnet:** gRPC checkpoint streaming enabled
- **Faucet:** Only available on testnet
- **Gas costs:** Real SUI on mainnet, test SUI on testnet

---

## gRPC Configuration

### Connection Settings
**Location:** `blockchain/config.js:198-202`

```javascript
grpc: {
  maxReceiveMessageLength: 4 * 1024 * 1024,  // 4MB
  maxSendMessageLength: 4 * 1024 * 1024,     // 4MB
  keepAliveTimeMs: 30000,                    // 30s keepalive
  keepAliveTimeoutMs: 10000,                 // 10s timeout
  keepAlivePermitWithoutCalls: true
}
```

### Retry Settings
**Location:** `blockchain/config.js:204-208`

```javascript
enableRetry: true,
maxRetryAttempts: 3,
initialRetryDelayMs: 1000,      // 1 second
maxRetryDelayMs: 30000,         // 30 seconds
retryDelayMultiplier: 2.0       // Exponential backoff
```

### Streaming Settings
**Location:** `blockchain/config.js:210-213`

```javascript
streamReconnectDelayMs: 1000,       // 1 second
maxReconnectDelayMs: 30000,         // 30 seconds
streamKeepaliveIntervalMs: 20000    // 20 seconds
```

---

## Deposit & Gas Configuration

### Minimum Deposit & Thresholds
**Location:** `blockchain/config.js:285-287`

```javascript
deposit: {
  minDepositAmount: 0.002,        // 2,000,000 MIST (min gas budget)
  lowBalanceThreshold: 0.01,      // 10,000,000 MIST (warn user)
  gasBuffer: 1.5                  // 50% buffer for estimates
}
```

### Gas Constants
**Location:** `blockchain/config.js:310-311`

```javascript
mistPerSui: 1_000_000_000,        // 1 SUI = 1 billion MIST
storageUnitsPerByte: 100,         // 100 storage units per byte
storageRebatePercentage: 99       // 99% of storage fees rebatable
```

### Estimated Operation Costs
**Location:** `blockchain/config.js:313-320`

```javascript
estimatedGasCosts: {
  singleEdit: 1000,               // ~1k computation units
  batchSave: 5000,                // ~5k computation units
  versionRestore: 10000,          // ~10k computation units
  walrusStorage: 20000,           // ~20k computation units
  typicalStorageBytes: 50         // Average bytes per operation
}
```

**Note:** Real-time gas prices fetched via GraphQL and cached (30-second expiry).

---

## Environment Variable Summary

### Quick Reference

| Variable | Default | Purpose |
|----------|---------|---------|
| **Network** |
| `VITE_NETWORK` | `testnet` | Sui network (testnet/mainnet) |
| **Bridge** |
| `BRIDGE_PORT` | `8081` | WebSocket bridge port |
| `BRIDGE_HOST` | `localhost` | Bridge host (use `0.0.0.0` for Docker) |
| `BRIDGE_LOG_LEVEL` | `INFO` | Bridge logging level |
| `BRIDGE_MAX_CLIENTS` | `100` | Max concurrent WebSocket clients |
| `ENABLE_METRICS` | `false` | Enable Prometheus metrics |
| **Walrus** |
| `WALRUS_USE_ABSOLUTE` | `false` | Force absolute URLs in dev |
| `WALRUS_COMPRESSION` | `true` | Enable gzip compression |
| `COMPRESSION_THRESHOLD` | `16384` | Min bytes before compression (16KB) |
| `WALRUS_REDUNDANCY` | `false` | Enable multi-publisher redundancy |
| `WALRUS_USE_SDK` | `false` | Use @mysten/walrus SDK |
| `WALRUS_EPOCHS_DEFAULT` | `50` | Default storage epochs |
| **Storage** |
| `ENABLE_DELTA` | `true` | Enable delta chain storage |
| `DELTA_MAX_CHAIN` | `5` | Max delta chain length |
| `BATCH_PERSISTENCE` | `true` | Persist batches to localStorage |
| **Rate Limiting** |
| `RATE_LIMITER_ENABLED` | `true` | Enable rate limiting |
| `SUI_MAX_RPS` | `3` | Sui RPC max requests/second |
| `SUI_BURST` | `6` | Sui burst capacity |
| `SUI_MAX_CONCURRENT` | `4` | Sui max concurrent requests |
| `WALRUS_AGG_MAX_RPS` | `3` | Walrus aggregator max RPS |
| `WALRUS_PUB_MAX_RPS` | `1` | Walrus publisher max RPS |
| **UI** |
| `SHOW_RATE_LIMITER_STATUS` | `false` | Show rate limiter widget |
| **Testing** |
| `VITE_TEST_MODE` | `false` | Enable test mode with mocks |
| `SPONSOR_DEMO_EVENTS` | `false` | Enable demo event emissions |

---

## Troubleshooting Configuration

### Bridge Won't Start
1. Check port availability: `bun run cleanup`
2. Verify `BRIDGE_PORT` not in use: `lsof -i :8081`
3. Check logs: `BRIDGE_LOG_LEVEL=DEBUG bun run bridge`

### Wallet Connection Fails
1. Verify network match: `blockchain/config.js:399` vs wallet network
2. Check package IDs match deployed contracts
3. Ensure sufficient SUI balance

### Walrus Save Fails
1. Check compression threshold: `COMPRESSION_THRESHOLD`
2. Verify publisher URL accessibility
3. Enable redundancy: `WALRUS_REDUNDANCY=true`
4. Run diagnostics: `bun run diagnose:save`

### Rate Limit Errors (HTTP 429)
1. Check rate limiter enabled: `RATE_LIMITER_ENABLED=true`
2. Adjust limits: `SUI_MAX_RPS`, `WALRUS_PUB_MAX_RPS`
3. Enable status widget: `SHOW_RATE_LIMITER_STATUS=true`

---

## Related Documentation

- **[docs/README.md](README.md)** - Developer guide with architecture
- **[docs/TESTING.md](TESTING.md)** - Testing guide
- **[docs/scripts/README.md](scripts/README.md)** - Script catalog
- **[blockchain/config.js](../blockchain/config.js)** - Full configuration source
- **[docs/rate-limiting-implementation.md](rate-limiting-implementation.md)** - Rate limiting details

---

## Configuration Best Practices

1. **Never hardcode endpoints** - Always use `getCurrentConfig()` helpers
2. **Use environment variables for secrets** - Never commit API keys or private keys
3. **Test network switches** - Verify wallet, package IDs, and endpoints align
4. **Enable verbose logging for debugging** - `BRIDGE_LOG_LEVEL=DEBUG`
5. **Document new configuration** - Update this file when adding new env vars
6. **Validate production config** - Double-check `environment: 'mainnet'` and package IDs

---

For questions or to report configuration issues, see the main [README.md](../README.md) or open an issue on GitHub.

### Telemetry & Observability

WalSheetz surfaces client-side telemetry events so operators can track autosave health, Sui commits, and renewal reminders.

- `frontend/utils/Telemetry.js` emits structured events via the shared logger and a `window` event (`telemetry:event`).
- `SpreadsheetEngine` records `walrus_autosave_success` and `sui_commit_success` events with blob size, transaction IDs, and chunk expiry timestamps.
- Integrations can listen for these events and forward them to analytics transports (Datadog, Sentry, etc.).
- To disable verbose telemetry in development set `VITE_TELEMETRY_ENABLED=false` (default true). Production builds should leave this enabled and configure collectors downstream.

Recommended pipeline:

1. Browser dispatches `telemetry:event`.
2. Frontend monitoring layer (or service worker) forwards to `/api/telemetry` or directly to your observability backend.
3. Dashboards/alerts monitor commit success rate and imminent Walrus expirations.

See `docs/README.md` for wiring telemetry exporters and `docs/AGENTS.md` for operational runbooks.
