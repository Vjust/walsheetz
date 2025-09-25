# AI Assistant Guide: scripts/

## Purpose
- Development and diagnostic utilities executed via Bun/Node to support WalSheetz.

## Structure
- JavaScript scripts run with `bun run` or `node` and assume ES module syntax.
- Shell helpers (`*.sh`) wrap Docker or platform-specific tasks.
- Many scripts orchestrate the gRPC bridge or run targeted test batteries.

## Highlights
- `start-bridge.js` and `start-bridge-if-free.js` manage the WebSocket ↔ gRPC bridge lifecycle.
- `generate-abi-types.js` produces frontend ABI artifacts before dev/build.
- `run-walrus-integration-tests.js` and other `test-*.js` scripts exercise blockchain and Walrus flows.
- Diagnostics like `diagnose-save-issues.js`, `debug-spreadsheet-loading.js`, and `test-blockchain-integration.js` assist troubleshooting.

## Usage
- Prefer calling scripts through `package.json` (e.g. `bun run bridge`, `bun run test:walrus`) to ensure environment variables are set.
- When invoking directly, run `bun run scripts/<script>.js` or `node scripts/<script>.js` from the repo root.

## Implementation Notes
- Keep scripts idempotent and surface exit codes (`process.exit(1)`) on failure.
- Reuse helpers from `blockchain/` and `frontend` rather than duplicating logic.
- Read configuration via `blockchain/config.js` or `app-config.json` instead of hardcoding network details.

## Coordination
- Document new operational flows in `docs/` and add npm/bun scripts when shipping new utilities.
- Update tests or CI pipelines if scripts become part of automated validation.
