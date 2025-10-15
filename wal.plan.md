# Production Walrus-Backed Spreadsheet Plan

## Stabilize Data Model & Metadata

- Confirm the canonical Walrus blob schema (cells, metadata, versions) in `frontend/core/SpreadsheetEngine.js` and `blockchain/walrus-service.js`, ensuring it supports database-like queries (sheet id, owner, tags, timestamps).
- Extend `docs/CONFIGURATION.md` and `docs/LUCKYSHEET_WRAPPER_GUIDE.md` with the finalized schema, required Walrus/Sui config, and migration guidance from existing blobs.

## Harden Storage & Ingestion Pipeline

- Upgrade `blockchain/walrus-service.js` and `blockchain/version-control.js` to treat Walrus as primary storage: deterministic encoding, delta chains, redundancy, and idempotent writes keyed by spreadsheet id.
- Add ingestion utilities (e.g. new module under `blockchain/contract-adapters/`) that read Walrus blobs, hydrate Sui indexes, and expose query surfaces for recent versions and arbitrary filters.
- Ensure `frontend/services/BrowserWalrusService.js` mirrors the server pipeline for browser-only flows while deferring privileged operations to the bridge when available.

## Wire Spreadsheet UX to Walrus Data

- Update `frontend/business/useSpreadsheet.js`, `frontend/adapters/StorageAdapter.js`, and relevant providers so loading, saving, and auto-sync fetch directly from Walrus-backed queries with graceful fallback to local cache.
- Surface import/export and database-like browsing UI in `frontend/presentation` (e.g. a dataset explorer panel) so users can discover Walrus datasets, preview versions, and hydrate sheets on demand.
- Add collaborative/state indicators (blob id, last sync, redundancy health) in existing status components for production transparency.

## Observability, Reliability & Docs

- Instrument storage flows with structured logging/telemetry (reuse `frontend/utils/Logger.js`) and bubble errors through UI diagnostics; emit metrics from bridge scripts in `scripts/` for Walrus/Sui latency and failure tracking.
- Expand test surface: unit specs for new encoders, integration tests in `tests/integration` to exercise end-to-end Walrus ingestion, and Playwright flows validating multi-user sync.
- Capture runbooks and troubleshooting steps in `docs/AGENTS.md` and add a production readiness checklist to `docs/README.md`, including required environment variables, monitoring hooks, and rollback strategy.

### To-dos (Status)

- [x] Finalize Walrus blob schema, metadata, and document configuration updates.
- [x] Enhance Walrus storage/ingestion services and expose query surfaces.
- [x] Refit frontend adapters/hooks/UI to operate directly on Walrus-backed data.
- [x] Add telemetry, tests, and production runbooks for Walrus-backed spreadsheets.
