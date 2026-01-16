# WalSheetz Repository Guidelines

## Quick Start

```bash
bun run setup      # Automated environment setup
bun run dev        # Start frontend dev server (port 3005)
bun run build:web  # Production build (Vite)
bun run test:all   # Run tests, typecheck, and lint
```

---

## Project Structure

### High-Level Layout
- **`frontend/`** - React SPA; see [frontend/AGENTS.md](./frontend/AGENTS.md)
- **`packages/`** - SDK packages:
  - `walrus` - Walrus storage SDK
  - `walrus-sui-core` - Sui blockchain integration
  - `subwallet` - Sub-wallet management
  - `shared` - Shared utilities and types
- **`api/`** - Vercel Edge Functions (BFF layer)
- **`move/`** - Move smart contracts; see [move/AGENTS.md](./move/AGENTS.md)
- **`tests/`** - Test organization (unit/, e2e/)
- **`scripts/`** - Automation (setup.js, health-check.js)

### Key Entry Points
| Path | Purpose |
|------|---------|
| `frontend/main.tsx` | Frontend application entry |
| `frontend/app/App.tsx` | Root React component |
| `packages/*/src/index.ts` | Package exports |
| `api/*.js` | Vercel Edge Functions |
| `vite.config.js` | Vite build configuration |
| `vercel.json` | Vercel deployment config |

---

## Commands

### Development
```bash
bun run dev          # Frontend dev server (port 3005)
bun run build:web    # Production Vite build
bun run build        # Build all workspace packages
```

### Testing
```bash
bun test             # All unit tests
bun run test:watch   # Watch mode
bun run test:all     # Tests + typecheck + lint
bun run test:smoke   # Smoke tests
```

### Quality
```bash
bun run typecheck    # TypeScript validation
bun run lint         # ESLint
bun run lint:fix     # Auto-fix lint issues
bun run health       # System health check
```

---

## Import Aliases (Vite Frontend)

```typescript
// Package imports (preferred)
import { BrowserSuiService } from '@dreamlit/walrus-sui-core/blockchain-integration'
import { Logger } from '@dreamlit/walrus'

// App aliases
import Component from '@app/App'
import Feature from '@features/dashboard/'
import Hook from '@shared/hooks/useWallet'
import { SpreadsheetEngine } from '@lib/spreadsheet/core/SpreadsheetEngine'
```

---

## Architecture

### Build and Deployment
- **Vite** builds the SPA to `dist/`
- **Vercel** deploys static assets + Edge Functions
- **Environment-driven** log stripping (VITE_LOG_LEVEL=warn strips console.log/debug/info)
- **Vendor chunking** for react, mysten, tanstack packages
- **No source maps** in production

### Security
- **CSP** enforced via vercel.json headers
- **SRI** on Luckysheet CDN resources
- **Rate limiting** on all API endpoints
- **CORS** restricted to allowed origins
- **Cookie-based sessions** (HttpOnly, Secure, SameSite=Strict)

### API Layer (Vercel Functions)
```
api/
  auth/           # Authentication (nonce, login, logout, session)
  spreadsheet/    # BFF endpoints (load, save)
  sui/tx/         # Transaction building and submission
  _utils/         # Shared utilities (cors, rate-limiter)
  sui-rpc-proxy   # Sui RPC proxy
  walrus-*        # Walrus aggregator/publisher proxies
```

---

## Conventions

### Code Style
- TypeScript for all new code
- No emojis in code or comments
- No .jsx extension in imports (use extensionless)
- Import from package exports, not package source files

### Package Development
- Each package uses `tsup` for builds
- Export types via package.json `exports` field
- Shared utilities go in `packages/shared`

### Testing
- Unit tests: `**/__tests__/*.test.ts` or `tests/unit/`
- E2E tests: `tests/e2e/` (Playwright)
- Coverage target: 80%

---

## Environment Variables

### Required (set in Vercel dashboard)
```
VITE_SUI_NETWORK=testnet|mainnet
VITE_LOG_LEVEL=warn|debug
SESSION_SECRET=<secret-for-session-signing>
```

### Optional
```
VITE_ENOKI_API_KEY=<enoki-api-key>
VITE_DEBUG_COMPONENTS=<comma-separated-components>
```

---

## Domain-Specific Guidelines

- **Frontend Development**: [frontend/AGENTS.md](./frontend/AGENTS.md)
- **Move Contracts**: [move/AGENTS.md](./move/AGENTS.md)

---

Keep changes minimal, match existing style, and consult domain-specific AGENTS.md files before introducing new patterns.
