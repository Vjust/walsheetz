# AI Assistant Guide: frontend/

> **📚 Common Guidelines**: See [../docs/AGENTS-SHARED.md](../docs/AGENTS-SHARED.md) for shared conventions.

## Purpose
- Browser SPA for WalSheetz; orchestrates all UI interactions.
- Bootstraps React components and bridges to blockchain & Walrus services via browser-safe wrappers.

## Entry Points
- `main.jsx` — Mounts the root `<App />` using Vite
- `app/App.jsx` — Wires routing, providers, and global diagnostics
- `shared/providers/WalletProviders.jsx` — Configures Sui network + wallet contexts

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
  - `infrastructure/` - Cross-cutting services (WebSocket, ErrorRecovery, SentryStub, etc.)
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

## Frontend-Specific Conventions

### Import Aliases (ALWAYS use these — never `../`)
```javascript
import Component from '@app/App.jsx'              // app/
import Feature from '@features/dashboard/'        // features/
import Hook from '@shared/hooks/useWallet'        // shared/
import Service from '@services/blockchain/'       // services/
import Util from '@utils/helpers/cellUtils'       // utils/
import Adapter from '@adapters/BlockchainAdapter' // adapters/
```

### Architecture Principles
- React function components with hooks (2-space indent, single quotes, no semicolons)
- Keep network/wallet/persistence logic in `services/` or `adapters/`
- Feature components stay declarative
- Services implement interfaces from `interfaces/` for testability
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

### Backend Integration
- Browser services often require mirrored updates in `blockchain/` and `scripts/`
- Configuration: Never hardcode endpoints — use `blockchain/config.js`
- Keep `app-config.json` aligned with on-chain package IDs
- Bridge: Consumes via `services/blockchain/BrowserGrpcService.js`

### Cross-References
- [blockchain/AGENTS.md](../blockchain/AGENTS.md) — Backend coordination patterns
- [../docs/QUICKSTART.md](../docs/QUICKSTART.md) — Quick start guide
- [../docs/TESTING.md](../docs/TESTING.md) — Testing patterns & coverage
- [../docs/DEBUG-LOGGING.md](../docs/DEBUG-LOGGING.md) — Debug workflows
- [../docs/CONFIGURATION.md](../docs/CONFIGURATION.md) — Environment variables
