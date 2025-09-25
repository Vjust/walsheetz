# AI Assistant Guide: blockchain/

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
- Targeted unit tests live under `tests/unit/blockchain` and `tests/unit/walrus`; run with `bun run test:unit`.
- Cross-service scenarios belong in `tests/integration` or the Walrus scripts (`bun run test:walrus`).
- Integration scripts in `scripts/test-*.js` expect the bridge running; start it with `bun run bridge` or `bun run dev:full`.

## Coordination
- Frontend code imports these modules via the `@blockchain` alias; keep exported APIs stable.
- Bridge helpers under `scripts/start-bridge*.js` mirror logic here—update them together when adding new capabilities.
- Reflect configuration and API changes in `docs/` and ensure `app-config.json` stays aligned with on-chain package IDs.
