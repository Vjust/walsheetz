# WalSheetz Architecture

**Last Updated**: 2025-11-06

## Overview

WalSheetz is a decentralized spreadsheet application built on Sui blockchain with Walrus storage. The architecture follows a clean separation of concerns with reusable packages, a focused frontend application, and clear boundaries between infrastructure and business logic.

---

## Directory Structure

```
walsheetz/
├── dreamlit-sdks/              # Git submodule (read-only, updated independently)
│   └── [SDK implementation]
│
├── packages/                   # Reusable packages (@dreamlit/*)
│   ├── shared/                # Common utilities, validation, logging
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── utils/
│   │   │   ├── testing/
│   │   │   └── __tests__/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── walrus/                # Walrus storage client
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client/
│   │   │   ├── config/
│   │   │   ├── health/
│   │   │   ├── retry/
│   │   │   └── __tests__/
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── walrus-sui-core/       # Blockchain integration
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── adapters/
│   │   │   ├── services/
│   │   │   ├── data-integrity/
│   │   │   └── __tests__/
│   │   ├── package.json
│   │   └── README.md
│   │
│   └── spreadsheet-sdk/       # Spreadsheet core functionality
│       ├── src/
│       │   ├── index.ts
│       │   ├── adapters/
│       │   ├── core/
│       │   ├── hooks/
│       │   └── __tests__/
│       ├── package.json
│       └── README.md
│
├── frontend/                   # SPA application
│   ├── adapters/              # Infrastructure adapters
│   ├── presentation/          # UI components
│   │   └── components/
│   ├── services/              # Application services
│   │   ├── application/      # Business logic services
│   │   │   ├── collaboration/
│   │   │   ├── formulas/
│   │   │   ├── import-export/
│   │   │   └── transactions/
│   │   ├── infrastructure/   # Infrastructure services
│   │   │   ├── blockchain/
│   │   │   └── storage/
│   │   └── legacy/           # Services being refactored
│   ├── shared/               # Shared frontend utilities
│   └── main.tsx              # Application entry point
│
├── scripts/                   # Build and development tooling
│   ├── setup.ts
│   └── healthcheck.ts
│
├── tests/                     # E2E and integration tests
│   ├── e2e/
│   ├── integration/
│   └── bun-setup.ts
│
├── docs/                      # Documentation
│   ├── migrations/
│   ├── ARCHITECTURE.md       # This file
│   ├── QUICKSTART.md
│   └── CONFIGURATION.md
│
└── [config files]             # Root configuration
    ├── package.json           # Workspace root
    ├── tsconfig.json          # TypeScript base config
    ├── vite.config.ts         # Vite configuration
    ├── vitest.config.ts       # Test configuration
    └── .gitignore
```

---

## Package Descriptions

### @dreamlit/shared

**Purpose**: Common utilities and abstractions used across all packages.

**Exports**:
- Validation guards and spreadsheet validation
- Logger and Telemetry
- Circuit breaker and Network lock
- Error handling (StandardizedErrorHandler)
- Cell utilities and blob parsing
- Test utilities and mocks

**Dependencies**: Minimal (no other workspace packages)

**Used By**: All other packages and frontend

---

### @dreamlit/walrus

**Purpose**: Walrus storage client and configuration management.

**Exports**:
- BrowserWalrusService (main storage interface)
- WalrusSdkClientLoader (SDK initialization)
- HTTP and SDK clients
- Configuration resolvers
- Health monitoring
- Retry logic and transports

**Dependencies**: `@dreamlit/shared`

**Used By**: `@dreamlit/walrus-sui-core`, frontend services

---

### @dreamlit/walrus-sui-core

**Purpose**: Blockchain integration, wallet management, and Sui interactions.

**Exports**:
- BlockchainAdapter (main blockchain interface)
- BrowserWalletManager (wallet connection)
- BrowserSuiService (Sui blockchain operations)
- Atomic operation management
- Transaction handling
- Data integrity (PoA certification)
- Explorer links and utilities

**Dependencies**: `@dreamlit/shared`, `@dreamlit/walrus`

**Used By**: `@dreamlit/spreadsheet-sdk`, frontend services

---

### @dreamlit/spreadsheet-sdk

**Purpose**: Core spreadsheet functionality, storage adapters, and React hooks.

**Exports**:
- useSpreadsheet hook
- Storage adapters (StorageAdapter)
- Spreadsheet core logic
- Auto-save scheduling
- Spreadsheet services

**Dependencies**: `@dreamlit/shared`, `@dreamlit/walrus`, `@dreamlit/walrus-sui-core`

**Used By**: Frontend application

---

## Frontend Architecture

### Layered Structure

The frontend follows a clean architecture with clear separation:

```
┌─────────────────────────────────────┐
│   Presentation Layer                │
│   (Components, UI)                  │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Application Services Layer        │
│   (Business Logic)                  │
│   - Collaboration                   │
│   - Formulas                        │
│   - Import/Export                   │
│   - Transactions                    │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Infrastructure Services Layer     │
│   (Technical Services)              │
│   - Blockchain                      │
│   - Storage                         │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Adapters Layer                    │
│   (External System Integration)     │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Packages                          │
│   (@dreamlit/*)                     │
└─────────────────────────────────────┘
```

### Service Organization

**Application Services** (`frontend/services/application/`):
- Contain business logic specific to WalSheetz
- Coordinate between packages and infrastructure
- Examples: collaboration, formulas, transaction management

**Infrastructure Services** (`frontend/services/infrastructure/`):
- Handle technical concerns
- Wrap package APIs with app-specific configuration
- Examples: blockchain client setup, storage initialization

**Legacy Services** (`frontend/services/legacy/`):
- Temporary home for services being refactored
- Should be migrated to proper packages or application services
- Examples: SpreadsheetCRUD, luckysheetApi

---

## Dependency Flow

```
dreamlit-sdks/ (submodule, independent)

packages/shared
    ↓
packages/walrus
    ↓
packages/walrus-sui-core
    ↓
packages/spreadsheet-sdk
    ↓
frontend/
```

**Rules**:
- Packages can only depend on packages below them in the stack
- Frontend can depend on all packages
- No circular dependencies between packages
- Packages should have minimal dependencies

---

## Import Conventions

### Package Imports

Use package aliases for all cross-package imports:

```typescript
// ✅ Good
import { Logger } from '@dreamlit/shared';
import { BrowserWalrusService } from '@dreamlit/walrus';
import { BlockchainAdapter } from '@dreamlit/walrus-sui-core';
import { useSpreadsheet } from '@dreamlit/spreadsheet-sdk';

// ❌ Bad
import { Logger } from '../../../packages/shared/src/utils/Logger';
```

### Frontend Internal Imports

Use `@frontend/*` alias for internal frontend imports:

```typescript
// ✅ Good
import { SaveStatusBanner } from '@frontend/presentation/components/SaveStatusBanner';
import { CollaborationService } from '@frontend/services/application/collaboration';

// ❌ Bad
import { SaveStatusBanner } from '../../presentation/components/SaveStatusBanner';
```

### Test Imports

Use `@tests/*` alias for shared test utilities:

```typescript
// ✅ Good
import { mockWallet } from '@tests/mocks/wallet';

// ❌ Bad
import { mockWallet } from '../../../tests/mocks/wallet';
```

---

## Build & Development

### Commands

```bash
# Install dependencies
bun install

# Setup project
bun run setup

# Development server
bun run dev:full

# Type checking
bun run typecheck

# Linting
bun run lint

# Testing
bun test

# Build all packages
bun run build
```

### Package Build Process

Each package uses `tsup` to:
1. Compile TypeScript to JavaScript
2. Generate type declarations (.d.ts)
3. Output to `dist/`

Build order (handled by workspace):
1. `shared`
2. `walrus`
3. `walrus-sui-core`
4. `spreadsheet-sdk`

---

## Testing Strategy

### Unit Tests
- Collocated with source code in `__tests__/` directories
- Test individual modules and functions
- Located: `packages/*/src/__tests__/`, `frontend/**/__tests__/`

### Integration Tests
- Test interactions between packages
- Located: `tests/integration/`

### E2E Tests
- Test full user workflows
- Located: `tests/e2e/`

### Test Utilities
- Shared mocks and helpers in `packages/shared/src/testing/`
- Test setup in `tests/bun-setup.ts`

---

## Configuration Management

### TypeScript

Root `tsconfig.json` defines base configuration with path aliases.
Each package extends the root config.

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@dreamlit/shared": ["./packages/shared/src"],
      "@dreamlit/walrus": ["./packages/walrus/src"],
      "@dreamlit/walrus-sui-core": ["./packages/walrus-sui-core/src"],
      "@dreamlit/spreadsheet-sdk": ["./packages/spreadsheet-sdk/src"],
      "@frontend/*": ["./frontend/*"],
      "@tests/*": ["./tests/*"]
    }
  }
}
```

### Vite

Mirrors TypeScript aliases for runtime resolution:

```typescript
resolve: {
  alias: {
    '@dreamlit/shared': '/packages/shared/src',
    // ... etc
  }
}
```

### Vitest

Uses same alias configuration for test imports.

---

## Submodule Strategy

### dreamlit-sdks/

The `dreamlit-sdks/` directory is a **git submodule** pointing to an external repository.

**Key Points**:
- Read-only from the main repo's perspective
- Updated independently in its own repository
- Main repo pulls updates via `git submodule update --remote`
- Not part of the workspace
- Not imported directly by application code

**Update Process**:
```bash
# Update to latest
git submodule update --remote dreamlit-sdks

# Or update to specific commit
cd dreamlit-sdks
git checkout <commit-hash>
cd ..
git add dreamlit-sdks
git commit -m "Update dreamlit-sdks to <version>"
```

---

## Code Quality

### TypeScript Standards

- **Strict mode enabled**: All packages use strict TypeScript
- **No implicit any**: Types required for all function parameters and returns
- **Null safety**: Strict null checks enabled
- **Index safety**: `noUncheckedIndexedAccess` enabled

### Linting

- ESLint with TypeScript support
- Rules enforced:
  - No explicit `any` (warn)
  - No unused variables (error)
  - Consistent code style

### Testing Requirements

- All new features require tests
- Maintain existing test coverage
- Integration tests for cross-package interactions

---

## Migration Status

**Current Phase**: Phase 1 - Structural Reorganization

See `docs/migrations/2025-structural-refactor.md` for detailed migration plan.

**Completed**:
- Migration planning and documentation

**In Progress**:
- Phase 1: Structural reorganization and cleanup

**Upcoming**:
- Phase 2: TypeScript conversion
- Phase 3: Aliases, imports, and strict typing

---

## Contributing

### Adding a New Package

1. Create directory in `packages/<name>/`
2. Add `package.json` with proper exports
3. Add `tsconfig.json` extending root
4. Create `src/index.ts` as entry point
5. Add to workspace in root `package.json`
6. Update alias maps in all config files

### Adding a New Feature

1. Determine if it belongs in a package or frontend
2. Create feature in appropriate location
3. Write tests
4. Update relevant documentation
5. Ensure TypeScript types are complete

### Refactoring Legacy Code

1. Identify module in `frontend/services/legacy/`
2. Determine proper location (package or application service)
3. Move and update imports
4. Update tests
5. Remove from legacy directory

---

## Resources

- **Migration Plan**: `docs/migrations/2025-structural-refactor.md`
- **Module Mapping**: `docs/migrations/sdk-mapping.md`
- **Quick Start**: `docs/QUICKSTART.md`
- **Configuration**: `docs/CONFIGURATION.md`
- **Agent Instructions**: `AGENTS.md`, `docs/AGENTS-SHARED.md`

---

**Last Updated**: 2025-11-06
