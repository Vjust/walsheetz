# AI Assistant Guide: frontend/

## Purpose
- Browser SPA for WalSheetz; orchestrates all UI interactions.
- Bootstraps React components and bridges to blockchain & Walrus services via browser-safe wrappers.

## Entry Points
- `main.jsx` mounts the root `<App />` using Vite.
- `presentation/App.jsx` wires routing, providers, and global diagnostics.
- `providers/WalletProviders.jsx` configures Sui network + wallet contexts for the app.

## Directory Map
- `presentation/` holds page shells, error boundaries, and global UI elements.
- `components/` contains reusable display components and dashboards.
- `pages/` defines route-level screens such as `Dashboard` and `SpreadsheetEditor`.
- `providers/` encapsulates React context wiring for wallets, spreadsheets, logging, etc.
- `services/` implements browser wrappers over `@blockchain` APIs (gRPC bridge, Walrus, offline caches).
- `adapters/` translate blockchain/storage APIs into UI-facing abstractions.
- `business/` groups domain hooks that orchestrate spreadsheet state and side effects.
- `core/` keeps primitives like the spreadsheet engine.
- `hooks/`, `utils/`, `interfaces/`, and `types/` collect shared helpers and type surfaces.

## Implementation Notes
- Stick to React function components with 2-space indentation, single quotes, and no semicolons unless required.
- Keep network, wallet, and persistence logic inside `services/` or `adapters/`; presentation components stay declarative.
- Use Vite import aliases (`@/...`, `@blockchain/...`) to avoid brittle relative paths.
- Prefer the shared logger in `frontend/utils/Logger.js` for telemetry and diagnostics.
- Add global providers or UI chrome through `presentation/App.jsx` to ensure tests bootstrap correctly.

## Testing & Tooling
- Unit tests for UI modules live under `tests/unit/frontend` (Vitest + happy-dom); run with `bun run test:unit`.
- Integration flows touching backend services belong in `tests/integration` or Playwright specs under `tests/e2e`.
- Keep presentation components (`presentation/components`) aligned with domain hooks when business logic changes.

## Coordination
- Changes to browser services often require mirrored updates in `blockchain/` and bridge scripts under `scripts/`.
- Document new capabilities or configuration toggles in `docs/` and ensure `app-config.json` stays accurate.
