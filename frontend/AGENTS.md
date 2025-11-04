# AI Assistant Guide: frontend/

## Purpose
- Browser SPA for WalSheetz; orchestrates all UI interactions.
- Bootstraps React components and bridges to blockchain & Walrus services via browser-safe wrappers.

## Entry Points
- `main.jsx` mounts the root `<App />` using Vite.
- `app/App.jsx` wires routing, providers, and global diagnostics.
- `shared/providers/WalletProviders.jsx` configures Sui network + wallet contexts for the app.

## Directory Map (Reorganized for Feature-Based Architecture)
- `app/` - Application shell (App.jsx, routes, global styles)
- `features/` - Feature modules organized by domain:
  - `dashboard/` - Dashboard feature (components, pages, styles)
  - `spreadsheet/` - Spreadsheet feature (components, pages, hooks, engine, styles)
  - `explore/` - Walrus exploration (BlobCatalog, ExploreTundra pages)
  - `network/` - Network management (NetworkSelector, Migration components)
- `shared/` - Shared across features:
  - `components/` - Reusable components (ErrorBoundary, WalrusStatus, etc.)
  - `hooks/` - All reusable hooks consolidated
  - `providers/` - React context providers (Wallet, Network, Spreadsheet)
  - `ui/` - Pure UI components (effects, modals, status indicators)
- `services/` - Pure services organized by domain:
  - `blockchain/` - Blockchain services (sui/, walrus/, wallet/, transactions/)
  - `storage/` - Storage services (IndexedDB, offline mode)
  - `integrations/` - Third-party integrations (luckysheet/, formulas/)
  - `infrastructure/` - Cross-cutting services (WebSocket, ErrorRecovery, etc.)
- `adapters/` - Service-to-UI adapters (BlockchainAdapter, StorageAdapter)
- `core/` - Pure domain logic (queue, scheduling) - Note: SpreadsheetEngine moved to features/spreadsheet/engine
- `utils/` - Utilities organized by concern:
  - `blockchain/` - AbiHelpers, ExplorerLinks
  - `validation/` - ValidationGuards, spreadsheetValidation
  - `logging/` - Logger, LogConfig, Telemetry
  - `errors/` - Error handling utilities
  - `config/` - ConfigLoader, testMode
  - `helpers/` - General helpers (cellUtils, BlobParser, EventBus, etc.)
- `types/` - TypeScript type definitions
- `interfaces/` - Interface definitions for services

## Implementation Notes
- Stick to React function components with 2-space indentation, single quotes, and no semicolons unless required.
- Keep network, wallet, and persistence logic inside `services/` or `adapters/`; feature components stay declarative.
- **ALWAYS use Vite import aliases** - never use relative paths like `../`:
  - `@app/*` - Application shell (App.jsx, global styles)
  - `@features/*` - Feature modules (dashboard, spreadsheet, explore, network)
  - `@shared/*` - Shared components, hooks, providers
  - `@services/*` - Services (blockchain, storage, integrations, infrastructure)
  - `@utils/*` - Utilities (logging, validation, errors, config, helpers)
  - `@adapters/*` - Service-to-UI adapters
  - `@types/*` - TypeScript definitions
  - `@interfaces/*` - Service interfaces
- Prefer the shared logger in `@utils/logging/Logger.js` for telemetry and diagnostics.
- Add global providers or UI chrome through `app/App.jsx` to ensure tests bootstrap correctly.
- Follow feature-based organization: related components, hooks, and pages should live together in feature modules.

## Testing & Tooling
- **Planned:** Unit tests for UI modules will live under `tests/unit/frontend` (Vitest + happy-dom)
  - ⚠️ **Current Status:** Frontend unit tests not yet implemented
  - Run all unit tests (blockchain only currently): `bun run test:unit`
  - See `docs/TESTING.md` for coverage gaps and planned tests
- Integration flows touching backend services belong in `tests/integration` or Playwright specs under `tests/e2e`
- Keep feature components aligned with their domain hooks when business logic changes
- Tests can be colocated with features in `__tests__/` directories

## Coordination
- Changes to browser services often require mirrored updates in `blockchain/` and bridge scripts under `scripts/`
- Document new capabilities or configuration toggles in `docs/` and ensure `app-config.json` stays accurate
- **Key Documentation:**
  - `docs/README.md` - Comprehensive developer guide with architecture overview
  - `docs/TESTING.md` - Testing guide and coverage status
  - `docs/CONFIGURATION.md` - Environment variables and feature flags
  - `docs/scripts/README.md` - Script catalog and usage
- **Cross-references:**
  - See `blockchain/AGENTS.md` for backend coordination
  - All services use configuration from `blockchain/config.js` - never hardcode endpoints
