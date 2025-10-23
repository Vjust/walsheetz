# Repository Guidelines

## Project Structure & Module Organization
- `frontend/`: React app (presentation/components, providers, adapters, services). Entry: `frontend/main.jsx`.
- `blockchain/`: Sui/Walrus integration (`wallet-manager.js`, `sui-service.js`, `walrus-service.js`, `config.js`).
- `tests/`: `unit/`, `integration/`, `property/`, `e2e/`, plus `utils/` and `reports/`.
- `scripts/`: Dev/test helpers (bridge starter, diagnostics, integration runners).
- `protos/`: gRPC/Protobuf definitions for Sui RPC.
- `dist/`: Production build output. `docs/` for project notes.

## Build, Test, and Development Commands
- Install: `bun install`
- Dev (Vite): `bun run dev` (port 3005). Static UI at `index.html`.
- Bridge: `bun run bridge` (WebSocket gRPC bridge). Both: `bun run dev:full`.
- Build: `bun run build`; Preview: `bun run preview`.
- Unit tests: `bun run test:unit`; All tests (watch): `bun run test:watch`; CI run: `bun run test:run`.
- Integration/property: `bun run test:integration`, `bun run test:property`, Walrus: `bun run test:walrus`.
- Coverage: `bun run test:coverage` (reports in `tests/reports/`, 80% global thresholds).

## Coding Style & Naming Conventions
- JavaScript/JSX (ES modules). 2‑space indent, single quotes, avoid semicolons.
- React functional components; component files `PascalCase.jsx`, modules `camelCase.js`.
- Tests: `*.test.js`, property tests `*.property.test.js`.
- Import aliases (Vite): `@` → `frontend/`, `@blockchain` → `blockchain/`, `@tests` → `tests/`.
- Keep changes small and cohesive; match surrounding style. No unrelated refactors.

## Code Change Guidelines
- **Minimal line changes**: Always prefer single-line fixes over multi-line refactors
- **Surgical edits**: Change only what's necessary to fix the issue
- **Root cause first**: Investigate deeply before adding defensive/safety code
- **Clean history**: Avoid adding unnecessary code that obscures the real fix

## Testing Guidelines
- Framework: Vitest. Unit env: `happy-dom`; integration env: Node (see `vitest.integration.config.js`).
- Start dev/bridge before E2E: `bun run dev:full` then `bun run test:e2e` (Playwright; Docker/neko variants available).
- Target 80%+ coverage; include tests for new behavior and bug fixes.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, etc. Imperative, concise subject.
- PRs include: clear description, rationale, linked issues, screenshots for UI, and test notes.
- Requirements: all checks pass, coverage not reduced, integration tests updated when APIs change.

## Security & Configuration Tips
- Never commit secrets/keys. Network and storage settings live in `blockchain/config.js` (`environment: 'testnet'|'mainnet'`).
- Bridge settings via env (`BRIDGE_PORT`, `BRIDGE_HOST`, etc.). Avoid editing `Sui Ref/` unless maintaining vendored docs.
