# Walrus SDK Monorepo - Architecture Overview

## Table of Contents
- [Overview](#overview)
- [Repository Structure](#repository-structure)
- [Package Architecture](#package-architecture)
- [Build System](#build-system)
- [Development Workflow](#development-workflow)
- [Quality Gates](#quality-gates)

## Overview

The Walrus SDK monorepo provides a modular, maintainable collection of TypeScript packages for building decentralized applications on the Walrus storage network and Sui blockchain.

### Key Principles
- **Single Toolchain**: Bun for all package management, building, and testing
- **TypeScript First**: All packages migrated to TypeScript with strict configs
- **Zero Circular Dependencies**: Clear package boundaries via dependency graph
- **Automated Quality**: CI/CD with lint, typecheck, test, and build verification
- **Side-Effect Free**: All packages designed for optimal tree-shaking

## Repository Structure

```
walsheetz/
├── packages/           # Published SDK packages
│   ├── shared/        # @dreamlit/shared - Common utilities
│   ├── walrus/        # @dreamlit/walrus - Core storage adapter
│   ├── walrus-sui-core/    # @dreamlit/walrus-sui-core - Blockchain integration
│   ├── spreadsheet-sdk/    # @dreamlit/spreadsheet-sdk - React spreadsheet SDK
│   └── subwallet/          # @walrus/subwallet-sdk - Wallet fleet management
├── apps/              # Demo applications (planned)
│   ├── demo-storage/
│   ├── demo-spreadsheet/
│   └── demo-subwallet/
├── docs/              # Documentation
│   └── architecture/  # Architecture decision records
├── .github/           # GitHub Actions workflows
│   └── workflows/
│       ├── ci.yml         # Continuous integration
│       └── release.yml    # Automated releases
├── .changeset/        # Changesets configuration
├── tsconfig.json      # Base TypeScript config
├── vitest.workspace.ts  # Test workspace config
├── eslint.config.mjs  # ESLint flat config
├── prettier.config.cjs   # Prettier config
└── package.json       # Root workspace config
```

## Package Architecture

### Dependency Graph

```
@dreamlit/spreadsheet-sdk
    ├── @dreamlit/walrus-sui-core
    │   ├── @dreamlit/walrus
    │   │   └── @dreamlit/shared
    │   └── @dreamlit/shared
    └── @dreamlit/shared

@walrus/subwallet-sdk
    └── (independent)
```

### Package Roles

#### `@dreamlit/shared`
**Purpose**: Zero-dependency utilities shared across all packages

**Exports**:
- `@dreamlit/shared/types` - Common TypeScript types (Result, Maybe, etc.)
- `@dreamlit/shared/logging` - Unified logger interface
- `@dreamlit/shared/events` - Type-safe event emitter
- `@dreamlit/shared/config` - Configuration loading & validation
- `@dreamlit/shared/network` - Retry logic, rate limiting, concurrency control

**Design**: Side-effect free, tree-shakeable, no runtime dependencies

#### `@dreamlit/walrus`
**Purpose**: Core Walrus storage adapter for browser and Node.js

**Entry Points**:
- `.` - Browser-optimized entry (default)
- `./node` - Node.js-specific entry with undici

**Key Features**:
- Blob upload/download with automatic retries
- Health monitoring for aggregator/publisher endpoints
- Configurable rate limiting and network throttling
- Connection management with failover

**Bundle Size**: ~151KB ESM (browser + node)

#### `@dreamlit/walrus-sui-core`
**Purpose**: Blockchain integration layer for Walrus + Sui

**Entry Points**:
- `.` - Main entry (auto-detects environment)
- `./node` - Node.js-specific features
- `./browser` - Browser-specific features
- `./blockchain` - Blockchain operations module
- `./blockchain-integration` - Integration helpers
- `./transaction` - Transaction management
- `./data-integrity` - Data validation & integrity

**Key Features**:
- Sui smart contract interaction via @mysten/sui
- GraphQL queries for blockchain data
- Transaction building and signing
- Protobuf support for RPC communication

**Bundle Size**: ~5MB ESM (includes Sui dependencies)

#### `@dreamlit/spreadsheet-sdk`
**Purpose**: React SDK for Walrus-powered spreadsheet applications

**Entry Points**:
- `.` - Full SDK (components + hooks + services)
- `./components` - React components only
- `./hooks` - Business logic hooks
- `./services` - Core services (no React)

**Key Features**:
- Integration with LuckySheet spreadsheet library
- Auto-save to Walrus with conflict resolution
- Real-time collaboration (WebSocket-based)
- Formula engine with blockchain data functions
- Import/export (Excel, CSV, JSON)

**Bundle Size**: ~1.1MB ESM (includes Luckysheet)

#### `@walrus/subwallet-sdk`
**Purpose**: Wallet fleet management and CLI orchestration

**Key Features**:
- CLI tool for managing multiple Sui wallets (`walrus-wallet`)
- Programmatic API for wallet operations
- Batch funding and sweeping operations
- Sponsored transaction support
- Rate-limited parallel execution

**Bundle Size**: ~150KB (TypeScript, already migrated)

## Build System

### Tooling Stack
- **Package Manager**: Bun (workspace support, fast installs)
- **Bundler**: tsup (esbuild-based, ESM output)
- **TypeScript**: v5.x with strict configs (relaxed during migration)
- **Linter**: ESLint 9 (flat config)
- **Formatter**: Prettier 3
- **Test Runner**: Vitest 2 (workspace-aware)

### Build Configuration

All packages use consistent `tsup` configuration:

```typescript
// Example: packages/walrus/tsup.config.ts
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    node: 'src/node.ts',
  },
  format: ['esm'],
  dts: false,  // Incremental - to be enabled per package
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  external: ['@dreamlit/shared', /* ... */],
})
```

### TypeScript Configuration

Base config (`tsconfig.json`):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

Package-specific overrides (migration phase):
- `noImplicitAny: false` - Gradual type addition
- `noUnusedLocals: false` - Focus on building first
- `lib: ["ES2022", "DOM"]` - Browser support

## Development Workflow

### Getting Started

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun run test

# Type check
bun run typecheck

# Lint
bun run lint

# Format code
bun run format
```

### Package Development

```bash
# Build single package
cd packages/walrus
bun run build

# Watch mode
bun run dev

# Run package tests
bun run test
```

### Creating a Changeset

```bash
# Create changeset for version bump
bun run changeset

# Version packages (updates package.json versions)
bun run version

# Publish to npm (after CI passes)
bun run release
```

## Quality Gates

### CI Pipeline (GitHub Actions)

**Lint Job**:
- ESLint check
- Prettier format verification

**Type Check Job**:
- TypeScript compilation check across all packages

**Test Job**:
- Vitest execution across workspace
- Coverage reporting (planned)

**Build Job** (Matrix):
- Builds all 5 packages in parallel
- Verifies dist/ output exists
- Ensures no build failures

### Branch Protection

Recommended settings for `main`:
- Require CI to pass (lint, typecheck, test, build)
- Require at least 1 approval
- Require linear history
- Require signed commits (optional)

### Release Process

1. Developer creates changeset: `bun run changeset`
2. Changeset bot creates PR with version bumps
3. CI validates the PR
4. Maintainer merges PR
5. Release workflow publishes to npm

## Migration Status

### Completed ✅
- [x] Monorepo restructuring (`packages/*`, `apps/*`)
- [x] Shared configuration (ESLint, Prettier, TypeScript)
- [x] `@dreamlit/shared` package creation
- [x] `@dreamlit/walrus` TypeScript migration
- [x] `@dreamlit/walrus-sui-core` TypeScript migration
- [x] `@dreamlit/spreadsheet-sdk` TypeScript migration
- [x] Changesets setup
- [x] GitHub Actions CI/CD

### Planned 🚧
- [ ] Enable DTS generation for all packages
- [ ] Add comprehensive unit tests
- [ ] Create demo applications
- [ ] Add test coverage reporting
- [ ] Set up Dependabot
- [ ] Add bundle size tracking

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## License

MIT License - see [LICENSE](../../LICENSE) for details.
