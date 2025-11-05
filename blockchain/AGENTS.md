# AI Assistant Guide: blockchain/

> **📚 Common Guidelines**: See [../docs/AGENTS-SHARED.md](../docs/AGENTS-SHARED.md) for shared conventions.

## Purpose
- Node/Bun-oriented services that interact with Sui and Walrus on behalf of the UI.
- Powers the gRPC/WebSocket bridge and CLI diagnostics consumed during development and testing.

## Core Modules
- `config.js` exposes environment profiles and helpers (`getCurrentConfig`, `isTestnet`, `isMainnet`); extend this file rather than hardcoding endpoints.
- `sui-service.js`, `sui-grpc-service.js`, and `grpc-service.js` encapsulate RPC/gRPC access with rate limiting and circuit breakers.
- `walrus-service.js`, `websocket-grpc-bridge.js`, and orchestrators like `deposit-manager.js`, `event-stream-manager.js`, `gas-estimator.js`, `graphql-event-subscriber.js`, and `version-control.js` coordinate Walrus + Sui flows.
- `wallet-manager.js` provides Node-only wallet connectivity; the React app must use Browser* services in `frontend/services` instead.
- `utils/` hosts reusable helpers (rate limiter, logging, fallback logic).

## Implementation Notes
- Modules are ES modules executed under Bun or Node 18+; avoid CommonJS patterns.
- Always read runtime details via `config.js` instead of reaching into `process.env` directly (it already normalizes values).
- Share resilience primitives (`ResilientExecutor`, `RateLimiter`) instead of rolling bespoke retries; import from existing utilities.
- When consuming new `.proto` assets, add them under `protos/` and update service loaders accordingly.
- Keep WebSocket message schemas backward compatible with `frontend/services/BrowserGrpcService.js`.

## Testing & Tooling
- Unit tests: `tests/unit/blockchain/` and `tests/unit/walrus/`
- Integration tests: `tests/integration/` and `bun run test:walrus`
- **Bridge Required**: Most integration tests need bridge running (`bun run dev:bridge`)
- **Key Test Scripts** (in `scripts/`):
  - `test-blockchain-integration.js` — Blockchain integration tests
  - `run-walrus-integration-tests.js` — Walrus storage tests
  - `test-graphql-fallback.js` — GraphQL fallback validation
  - `test-wallet-reliability.js` — Wallet connection tests

See [../docs/TESTING.md](../docs/TESTING.md) for testing guide and coverage status.

## Coordination

### Frontend Integration
- Frontend imports via `@blockchain` alias — keep exported APIs stable
- Bridge helpers in `scripts/start-bridge*.js` mirror logic here
- **Configuration**: Centralized in `blockchain/config.js`
  - Use helpers: `getCurrentConfig()`, `isTestnet()`, `isMainnet()`
  - WebSocket bridge port: `config.websocket.port` (default: 8081)
  - Keep `app-config.json` aligned with on-chain package IDs

### Cross-References
- [frontend/AGENTS.md](../frontend/AGENTS.md) — UI coordination patterns
- [../docs/README.md](../docs/README.md) — Developer guide with architecture
- [../docs/TESTING.md](../docs/TESTING.md) — Testing guide
- [../docs/CONFIGURATION.md](../docs/CONFIGURATION.md) — Environment variables
- [../docs/DEBUG-LOGGING.md](../docs/DEBUG-LOGGING.md) — Logging & debugging
