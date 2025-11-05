# WalSheetz Repository Guidelines

> **📚 Common Guidelines**: For shared conventions (coding style, testing, git workflow), see [docs/AGENTS-SHARED.md](./docs/AGENTS-SHARED.md)

## Quick Start

```bash
bun run setup      # Automated environment setup
bun run dev:full   # Start both bridge and frontend
bun run test:all   # Run tests, typecheck, and lint
```

See [docs/QUICKSTART.md](./docs/QUICKSTART.md) for detailed onboarding.

---

## Project-Specific Structure

### High-Level Layout
- **`frontend/`** — React SPA; see [frontend/AGENTS.md](./frontend/AGENTS.md)
- **`blockchain/`** — Sui/Walrus integration; see [blockchain/AGENTS.md](./blockchain/AGENTS.md)
- **`packages/`** — SDK packages (walrus, walrus-sui-core, spreadsheet-sdk, subwallet, shared)
- **`apps/`** — Demo applications
- **`tests/`** — Test organization (unit/, integration/, property/, e2e/)
- **`scripts/`** — Automation (setup.js, health-check.js, diagnostics)
- **`protos/`** — gRPC/Protobuf definitions for Sui RPC
- **`docs/`** — Documentation hub

### Key Entry Points
| Path | Purpose |
|------|---------|
| `frontend/main.jsx` | Frontend application entry |
| `frontend/app/App.jsx` | Root React component |
| `blockchain/websocket-grpc-bridge.js` | Bridge server |
| `blockchain/config.js` | Network & RPC configuration |
| `packages/*/src/index.ts` | Package exports |

---

## Repository-Specific Commands

### Development Servers
```bash
bun run dev          # Frontend only (port 3000)
bun run dev:bridge   # Bridge only (port 3005)
bun run dev:full     # Both services
```

### Testing Variants
```bash
bun test                    # All unit tests
bun run test:watch          # Watch mode
bun run test:integration    # Integration tests
bun run test:property       # Property-based tests
bun run test:walrus         # Walrus-specific tests
bun run test:e2e            # End-to-end (requires services running)
bun run test:coverage       # With coverage report
```

### Diagnostics
```bash
bun run health       # System health check
bun run setup        # Validate environment
```

---

## Import Aliases (Vite Frontend)

```javascript
// Use these - NEVER use relative paths like ../
import Component from '@app/App.jsx'           // app/
import Feature from '@features/dashboard/'     // features/
import Hook from '@shared/hooks/useWallet'     // shared/
import Service from '@services/blockchain/'    // services/
import Util from '@utils/helpers/cellUtils'    // utils/
import Adapter from '@adapters/BlockchainAdapter' // adapters/
```

---

## Project-Specific Conventions

### Test File Organization
- Unit tests: `**/__tests__/*.test.js` or `tests/unit/`
- Integration: `tests/integration/`
- Property tests: `tests/property/*.property.test.js`
- E2E tests: `tests/e2e/` (Playwright)
- Coverage reports: `tests/reports/`
- **Coverage target**: 80% global threshold

### Configuration Hierarchy
1. **Environment**: `blockchain/config.js` (`environment: 'testnet'|'mainnet'`)
2. **Bridge**: Environment variables (`BRIDGE_PORT`, `BRIDGE_HOST`)
3. **Walrus**: `WALRUS_PUBLISHER_URL`
4. **Secrets**: Never committed; use `.env` (gitignored)

### Special Directories
- **`Sui Ref/`** — Vendored Sui/Walrus documentation (avoid editing)
- **`dist/`** — Build output (gitignored)
- **`node_modules/`** — Dependencies (gitignored)

---

## Domain-Specific Guidelines

For detailed guidance on specific areas:
- **Frontend Development**: [frontend/AGENTS.md](./frontend/AGENTS.md)
- **Blockchain Integration**: [blockchain/AGENTS.md](./blockchain/AGENTS.md)
- **Package Development**: See individual package README files

---

## Common References

| Guide | Purpose |
|-------|---------|
| [AGENTS-SHARED.md](./docs/AGENTS-SHARED.md) | Common conventions |
| [QUICKSTART.md](./docs/QUICKSTART.md) | Quick start guide |
| [README.md](./docs/README.md) | Developer guide |
| [TESTING.md](./docs/TESTING.md) | Testing guide |
| [DEBUG-LOGGING.md](./docs/DEBUG-LOGGING.md) | Debugging guide |
| [CONFIGURATION.md](./docs/CONFIGURATION.md) | Configuration reference |

---

**Remember**: Keep changes minimal, match existing style, and consult domain-specific AGENTS.md files before introducing new patterns.
