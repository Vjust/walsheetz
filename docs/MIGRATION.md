# Migration Guide

This guide helps you migrate from the previous monorepo structure to the refactored TypeScript-based architecture.

## Table of Contents
- [Overview of Changes](#overview-of-changes)
- [Breaking Changes](#breaking-changes)
- [Package-Specific Migration](#package-specific-migration)
- [Development Workflow Changes](#development-workflow-changes)
- [Troubleshooting](#troubleshooting)

## Overview of Changes

### What Changed?

1. **Directory Structure**: Packages moved from root to `packages/` directory
2. **TypeScript Migration**: All packages converted from JavaScript to TypeScript
3. **Shared Utilities**: New `@dreamlit/shared` package for common code
4. **Build System**: Standardized tsup configuration across packages
5. **Configuration**: Unified ESLint, Prettier, and TypeScript configs
6. **Versioning**: Changesets for automated version management

### Backwards Compatibility

✅ **API Compatibility**: All existing APIs maintained - no breaking changes to public interfaces
✅ **Import Paths**: Package names unchanged (`@dreamlit/walrus`, `@dreamlit/walrus-sui-core`, etc.)
⚠️ **Internal Imports**: If you were using deep imports (not recommended), update paths

## Breaking Changes

### None for Consumers

If you're consuming these packages from npm, **no changes are required**. The public APIs remain identical.

### For Contributors

If you're developing or contributing to the SDK:

1. **Package Locations**: Packages moved to `packages/` directory
   ```bash
   # Old
   cd walrus

   # New
   cd packages/walrus
   ```

2. **File Extensions**: All files migrated to TypeScript
   ```
   # Old
   src/client/WalrusBlobClient.js

   # New
   src/client/WalrusBlobClient.ts
   ```

3. **Shared Dependencies**: Import from `@dreamlit/shared` instead of local copies
   ```typescript
   // Old
   import { logger } from './shared/Logger.js'

   // New
   import { createLogger } from '@dreamlit/shared/logging'
   ```

## Package-Specific Migration

### @dreamlit/walrus

**No breaking changes** - All exports maintained.

**New Features**:
- TypeScript types available (incremental)
- Better tree-shaking with modular exports
- Dependency on `@dreamlit/shared` for utilities

**Entry Points** (unchanged):
```typescript
import walrus from '@dreamlit/walrus'          // Browser (default)
import walrus from '@dreamlit/walrus/node'     // Node.js
```

### @dreamlit/walrus-sui-core

**No breaking changes** - All 7 entry points maintained.

**Entry Points** (unchanged):
```typescript
import core from '@dreamlit/walrus-sui-core'                    // Main
import core from '@dreamlit/walrus-sui-core/node'               // Node.js
import core from '@dreamlit/walrus-sui-core/browser'            // Browser
import blockchain from '@dreamlit/walrus-sui-core/blockchain'   // Blockchain ops
import integration from '@dreamlit/walrus-sui-core/blockchain-integration'
import transaction from '@dreamlit/walrus-sui-core/transaction'
import integrity from '@dreamlit/walrus-sui-core/data-integrity'
```

**New Features**:
- TypeScript types available (incremental)
- Dependency on `@dreamlit/shared` for utilities

### @dreamlit/spreadsheet-sdk

**No breaking changes** - All exports maintained.

**Entry Points** (unchanged):
```typescript
import sdk from '@dreamlit/spreadsheet-sdk'              // Full SDK
import components from '@dreamlit/spreadsheet-sdk/components'
import hooks from '@dreamlit/spreadsheet-sdk/hooks'
import services from '@dreamlit/spreadsheet-sdk/services'
```

**New Features**:
- TypeScript types available (incremental)
- Better React integration with proper JSX handling
- Dependency on `@dreamlit/shared` for utilities

### @walrus/subwallet-sdk

**No changes** - Already TypeScript, no migration needed.

```typescript
import { SubWallet } from '@walrus/subwallet-sdk'
```

## Development Workflow Changes

### Installation

**Before**:
```bash
npm install  # or bun install
```

**After** (same):
```bash
bun install  # Preferred
# OR
npm install
```

### Building

**Before**:
```bash
# Per-package builds with different commands
cd walrus && npm run build
cd walrus-sui-core && npm run build
```

**After**:
```bash
# Build all packages from root
bun run build

# Or build specific package
cd packages/walrus && bun run build
```

### Testing

**Before**:
```bash
# Per-package tests
cd walrus && npm test
```

**After**:
```bash
# Run all tests from root
bun run test

# Or test specific package
cd packages/walrus && bun run test
```

### Linting & Formatting

**Before**:
```bash
# Only subwallet had linting
cd sub-wallet-sdk && npm run lint
```

**After**:
```bash
# Lint entire monorepo
bun run lint

# Auto-fix issues
bun run lint:fix

# Format all code
bun run format
```

### Type Checking

**New Feature**:
```bash
# Type check all packages
bun run typecheck
```

### Versioning & Publishing

**Before**:
```bash
# Manual version bumps in package.json
# Manual npm publish
```

**After**:
```bash
# Create changeset (semantic version bump)
bun run changeset

# Version packages (updates package.json)
bun run version

# Publish to npm
bun run release
```

## Troubleshooting

### Build Errors

**Problem**: `Cannot find module '@dreamlit/shared'`

**Solution**: Install dependencies from root
```bash
bun install
```

---

**Problem**: `tsconfig.json not found`

**Solution**: Ensure you're in the root directory and run:
```bash
bun install
```

### Import Errors

**Problem**: Deep imports not working
```typescript
import something from '@dreamlit/walrus/src/client/WalrusBlobClient'  // ❌
```

**Solution**: Use package exports only
```typescript
import { WalrusBlobClient } from '@dreamlit/walrus'  // ✅
```

### Type Errors

**Problem**: TypeScript errors in consuming projects

**Solution**: Ensure you have compatible TypeScript version
```bash
# Check version
tsc --version

# Should be >= 5.0.0
bun add -D typescript@^5.0.0
```

### Workspace Issues

**Problem**: `bun install` fails with workspace errors

**Solution**: Clear caches and reinstall
```bash
rm -rf node_modules bun.lockb
bun install
```

### CI Failures

**Problem**: CI failing after migration

**Solution**: Update CI to use new commands
```yaml
# .github/workflows/ci.yml
- name: Install
  run: bun install --frozen-lockfile

- name: Build
  run: bun run build

- name: Test
  run: bun run test
```

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/Vjust/dreamlit-walrus-sdk/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Vjust/dreamlit-walrus-sdk/discussions)
- **Documentation**: [docs/](./architecture/overview.md)

## Reporting Bugs

If you encounter issues after migration:

1. Check this guide for common solutions
2. Search existing [GitHub Issues](https://github.com/Vjust/dreamlit-walrus-sdk/issues)
3. Create new issue with:
   - Package version
   - Steps to reproduce
   - Expected vs actual behavior
   - Error messages/stack traces

## Timeline

- **Phase 1**: Foundation & Hygiene ✅ (Completed)
- **Phase 2**: Shared Package ✅ (Completed)
- **Phase 3-5**: TypeScript Migration ✅ (Completed)
- **Phase 6**: CI/CD & Demo Apps ✅ (Completed)
- **Phase 7**: Documentation ✅ (Completed)
- **Next**: Type Definitions (DTS), Test Coverage, Demo Apps

## Migration Checklist

For contributors migrating codebases:

- [ ] Update package locations in scripts (`packages/*`)
- [ ] Install dependencies (`bun install`)
- [ ] Verify builds work (`bun run build`)
- [ ] Run tests (`bun run test`)
- [ ] Update CI/CD workflows
- [ ] Test local development workflow
- [ ] Update documentation links
- [ ] Communicate changes to team

---

**Need Help?** Open an issue or start a discussion on GitHub.
