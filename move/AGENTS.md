# AI Assistant Guide: move/

## Purpose
- Sui Move package backing WalSheetz on-chain functionality.

## Layout
- `Move.toml` and `Move.lock` configure the package and dependencies.
- `sources/` contains on-chain modules (`spreadsheet.move`) and Move unit tests (`spreadsheet_test.move`).
- `build/` stores compiler output (generated; regenerate with the Sui CLI as needed).

## Tooling
- Use the Sui CLI inside this directory (`sui move build`, `sui move test`).
- Before publishing new modules, synchronise package IDs in `blockchain/config.js` and `app-config.json`.

## Implementation Notes
- Maintain compatibility with frontend ABI consumers; after changing modules, run `bun run predev` (or `node scripts/generate-abi-types.js`) to refresh `frontend/types/abi.*`.
- Never commit private keys or environment-specific values; keep secrets outside the repo.
- Keep modules small and well-commented; align function visibility with off-chain expectations.

## Coordination
- Update tests in `tests/unit/sui` and integration suites when Move logic changes.
- Document deployment steps or migration notes under `docs/` to guide operators.
- Notify blockchain and frontend maintainers so browser services and rate-limit logic can adapt.
