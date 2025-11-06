# Structural Refactor Migration Plan (2025)

**Status**: In Progress
**Start Date**: 2025-11-06
**Owner**: Development Team

## Overview

This migration restructures the codebase into a clean, maintainable architecture with:
- **Minimal structure**: Clear separation of concerns
- **TypeScript**: Full type safety across the workspace
- **Proper aliasing**: Consistent import paths and strict typing

The migration is divided into **three sequential phases** to minimize disruption and maintain working code at each checkpoint.

---

## Phase 1: Structural Reorganization & Cleanup

**Goal**: Establish the final directory structure and remove all cruft.

### 1.1 Baseline & Documentation Setup

- [ ] Snapshot current layout (commit checkpoint)
- [ ] Create `docs/ARCHITECTURE.md` documenting target structure
- [ ] Create `docs/migrations/sdk-mapping.md` for module ownership
- [ ] Document baseline in this file

**Target Structure**:
```
walsheetz/
├── dreamlit-sdks/           # Git submodule (untouched)
├── packages/                # Reusable packages
│   ├── shared/             # @dreamlit/shared
│   ├── walrus/             # @dreamlit/walrus
│   ├── walrus-sui-core/    # @dreamlit/walrus-sui-core
│   ├── spreadsheet-sdk/    # @dreamlit/spreadsheet-sdk
│   └── subwallet/          # @dreamlit/subwallet
├── frontend/               # SPA application
│   ├── adapters/
│   ├── presentation/
│   ├── services/
│   └── main.jsx
├── scripts/                # Build/dev tooling
├── tests/                  # E2E and integration tests
├── docs/                   # Documentation
└── [config files]
```

### 1.2 Submodule Configuration

- [ ] Verify `dreamlit-sdks/` is properly configured as git submodule
- [ ] Ensure `.gitmodules` exists and is correct
- [ ] Add submodule artifacts to `.gitignore`:
  ```
  dreamlit-sdks/node_modules/
  dreamlit-sdks/dist/
  dreamlit-sdks/.tsbuildinfo
  ```
- [ ] Document submodule workflow in `docs/CONFIGURATION.md`

### 1.3 Package Structure Creation

For each package in `packages/`:

- [ ] **shared**: Create directory structure
  - [ ] `packages/shared/src/index.js`
  - [ ] `packages/shared/package.json`
  - [ ] `packages/shared/README.md`

- [ ] **walrus**: Create directory structure
  - [ ] `packages/walrus/src/index.js`
  - [ ] `packages/walrus/package.json`
  - [ ] `packages/walrus/README.md`

- [ ] **walrus-sui-core**: Create directory structure
  - [ ] `packages/walrus-sui-core/src/index.js`
  - [ ] `packages/walrus-sui-core/package.json`
  - [ ] `packages/walrus-sui-core/README.md`

- [ ] **spreadsheet-sdk**: Create directory structure
  - [ ] `packages/spreadsheet-sdk/src/index.js`
  - [ ] `packages/spreadsheet-sdk/package.json`
  - [ ] `packages/spreadsheet-sdk/README.md`

- [ ] **subwallet**: Create directory structure
  - [ ] `packages/subwallet/src/index.js`
  - [ ] `packages/subwallet/package.json`
  - [ ] `packages/subwallet/README.md`

### 1.4 Move src/sdk and src/walrus to Packages

Map and move modules according to `docs/migrations/sdk-mapping.md`:

- [ ] Move `src/sdk/shared/**` → `packages/shared/src/`
- [ ] Move `src/walrus/**` → `packages/walrus/src/`
- [ ] Move `src/sdk/blockchain-integration/**` → `packages/walrus-sui-core/src/`
- [ ] Move `src/sdk/spreadsheet-core/**` → `packages/spreadsheet-sdk/src/`
- [ ] Move app-specific services from `src/sdk/services/**` → `frontend/services/legacy/`
- [ ] Move tests alongside their modules into `packages/*/src/__tests__/`

### 1.5 Frontend Consolidation

- [ ] Remove `web/` directory (verify no active references)
- [ ] Move any remaining app-specific code from `src/sdk/` to `frontend/services/`
- [ ] Organize frontend services by domain:
  - [ ] `frontend/services/infrastructure/`
  - [ ] `frontend/services/application/`
  - [ ] `frontend/services/legacy/` (temporary home for old SDK services)

### 1.6 Tooling & Scripts

- [ ] Move all repo automation to `scripts/`
- [ ] Remove empty scaffolding:
  - [ ] `src/cli/commands/.gitkeep`
  - [ ] Empty `src/cli/` directory if unused
- [ ] Remove redundant claude outputs in `.claude/`

### 1.7 Configuration Cleanup

- [ ] Delete redundant Vite configs:
  - [ ] `vite.config.backup.js`
  - [ ] `vite.config.complex.js`
  - [ ] `vite.config.minimal.js`
- [ ] Keep canonical `vite.config.ts`
- [ ] Update `fs.allow` in Vite to real directories only

### 1.8 Remove Old Directories

- [ ] Delete `src/sdk/` (after all moves complete)
- [ ] Delete `src/walrus/` (after all moves complete)
- [ ] Delete `web/` (if not already removed)
- [ ] Delete empty `src/cli/` if completely unused

### 1.9 Update .gitignore

- [ ] Add all build artifacts:
  ```
  # Build outputs
  dist/
  .tsbuildinfo
  *.tsbuildinfo

  # Package artifacts
  packages/*/dist/
  packages/*/.tsbuildinfo

  # Submodule artifacts
  dreamlit-sdks/node_modules/
  dreamlit-sdks/dist/
  ```

### 1.10 Phase 1 Verification

- [ ] Run `bun install` (rebuild workspace links)
- [ ] Verify all files are in their new locations
- [ ] Commit checkpoint: "Phase 1: Structural reorganization complete"
- [ ] Tag: `migration/phase1-complete`

**Expected State After Phase 1**:
- Clean directory structure with packages
- No duplicate configs
- No `src/sdk/` or `src/walrus/`
- All code moved to proper locations (still in JavaScript)

---

## Phase 2: TypeScript Conversion

**Goal**: Convert all workspace code to TypeScript with proper typing.

### 2.1 TypeScript Configuration Setup

- [ ] Create root `tsconfig.json` with base settings (not strict yet)
- [ ] Create `tsconfig.test.json` for test utilities
- [ ] Create per-package `tsconfig.json` files extending root:
  - [ ] `packages/shared/tsconfig.json`
  - [ ] `packages/walrus/tsconfig.json`
  - [ ] `packages/walrus-sui-core/tsconfig.json`
  - [ ] `packages/spreadsheet-sdk/tsconfig.json`
  - [ ] `packages/subwallet/tsconfig.json`
- [ ] Create `frontend/tsconfig.json` with React settings (`jsx: "react-jsx"`)

### 2.2 Package TypeScript Conversion

For each package, convert module by module:

#### 2.2.1 @dreamlit/shared
- [ ] Rename `.js` → `.ts`, `.jsx` → `.tsx`
- [ ] Replace JSDoc with TypeScript interfaces/types
- [ ] Fix type errors (use `any` sparingly, add `// @ts-expect-error` where needed)
- [ ] Update `src/index.ts` with proper exports
- [ ] Run `bun run typecheck` for this package
- [ ] Tests pass: `bun test packages/shared`

#### 2.2.2 @dreamlit/walrus
- [ ] Rename `.js` → `.ts`
- [ ] Add proper types for Walrus API interactions
- [ ] Update exports in `src/index.ts`
- [ ] Run `bun run typecheck` for this package
- [ ] Tests pass: `bun test packages/walrus`

#### 2.2.3 @dreamlit/walrus-sui-core
- [ ] Rename `.js` → `.ts`
- [ ] Add blockchain types (transactions, signing, etc.)
- [ ] Update exports in `src/index.ts`
- [ ] Run `bun run typecheck` for this package
- [ ] Tests pass: `bun test packages/walrus-sui-core`

#### 2.2.4 @dreamlit/spreadsheet-sdk
- [ ] Rename `.js` → `.ts`, `.jsx` → `.tsx`
- [ ] Add spreadsheet-specific types
- [ ] Update exports in `src/index.ts`
- [ ] Run `bun run typecheck` for this package
- [ ] Tests pass: `bun test packages/spreadsheet-sdk`

#### 2.2.5 @dreamlit/subwallet
- [ ] Rename `.js` → `.ts`
- [ ] Add wallet connection types
- [ ] Update exports in `src/index.ts`
- [ ] Run `bun run typecheck` for this package
- [ ] Tests pass: `bun test packages/subwallet`

### 2.3 Frontend TypeScript Conversion

- [ ] Convert `frontend/adapters/**/*.js` → `.ts/.tsx`
- [ ] Convert `frontend/presentation/**/*.jsx` → `.tsx`
- [ ] Convert `frontend/services/**/*.js` → `.ts`
- [ ] Update `frontend/main.jsx` → `main.tsx`
- [ ] Fix React component types (props interfaces, hooks)
- [ ] Run `bun run typecheck` for frontend
- [ ] Tests pass: `bun test frontend`

### 2.4 Scripts TypeScript Conversion

- [ ] Convert `scripts/*.js` → `.ts`
- [ ] Add proper types for Node.js APIs
- [ ] Verify scripts still run correctly

### 2.5 Test Utilities TypeScript Conversion

- [ ] Convert test setup files to TypeScript
- [ ] Update `tests/bun-setup.js` → `tests/bun-setup.ts`
- [ ] Type-check test utilities
- [ ] All tests still pass

### 2.6 Build Configuration Updates

- [ ] Update each package's `package.json`:
  - [ ] Set `"type": "module"`
  - [ ] Add `"exports"` field with TypeScript paths
  - [ ] Add build script using `tsup` or `tsc`
  - [ ] Add `"types"` field pointing to declaration files
- [ ] Update root `package.json` with typecheck scripts
- [ ] Configure `tsup` for each package to emit declarations

### 2.7 Phase 2 Verification

- [ ] Run `bun install`
- [ ] Run `bun run typecheck` (all packages)
- [ ] Run `bun test` (all tests pass)
- [ ] Run `bun run build` (all packages build)
- [ ] Verify no `.js` files remain in `packages/` or `frontend/` (except configs)
- [ ] Commit checkpoint: "Phase 2: TypeScript conversion complete"
- [ ] Tag: `migration/phase2-complete`

**Expected State After Phase 2**:
- All workspace code is TypeScript
- Types are present but not strict yet
- All tests still pass
- Packages build and emit `.d.ts` files

---

## Phase 3: Aliases, Imports & Strict Typing

**Goal**: Establish shared alias map, fix all imports, and enable strict TypeScript.

### 3.1 Shared Alias Configuration

Create consistent alias map across all tools:

- [ ] Define aliases in root `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "baseUrl": ".",
      "paths": {
        "@dreamlit/shared": ["./packages/shared/src"],
        "@dreamlit/walrus": ["./packages/walrus/src"],
        "@dreamlit/walrus-sui-core": ["./packages/walrus-sui-core/src"],
        "@dreamlit/spreadsheet-sdk": ["./packages/spreadsheet-sdk/src"],
        "@dreamlit/subwallet": ["./packages/subwallet/src"],
        "@frontend/*": ["./frontend/*"],
        "@scripts/*": ["./scripts/*"],
        "@tests/*": ["./tests/*"]
      }
    }
  }
  ```

- [ ] Mirror aliases in `vite.config.ts`:
  ```ts
  resolve: {
    alias: {
      '@dreamlit/shared': '/packages/shared/src',
      '@dreamlit/walrus': '/packages/walrus/src',
      // ... etc
    }
  }
  ```

- [ ] Mirror aliases in `vitest.config.ts`
- [ ] Mirror aliases in `bunfig.toml` (if needed for Bun resolution)
- [ ] Mirror aliases in `playwright.config.ts`

### 3.2 Update All Imports

Replace old relative/absolute imports with package aliases:

#### 3.2.1 Frontend Imports
- [ ] Replace `../../sdk/shared/` → `@dreamlit/shared`
- [ ] Replace `../../sdk/walrus/` → `@dreamlit/walrus`
- [ ] Replace `../../sdk/blockchain-integration/` → `@dreamlit/walrus-sui-core`
- [ ] Replace `../../sdk/spreadsheet-core/` → `@dreamlit/spreadsheet-sdk`
- [ ] Use `@frontend/*` for internal frontend imports

#### 3.2.2 Package Imports
- [ ] Update cross-package imports to use `@dreamlit/*` aliases
- [ ] Ensure packages only import from their public APIs

#### 3.2.3 Test Imports
- [ ] Update test imports to use package aliases
- [ ] Update mock imports to use `@tests/*` alias

#### 3.2.4 Script Imports
- [ ] Update script imports to use package aliases where applicable

### 3.3 Enable Strict TypeScript

- [ ] Update root `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "strict": true,
      "noImplicitAny": true,
      "noUncheckedIndexedAccess": true,
      "strictNullChecks": true,
      "strictFunctionTypes": true,
      "strictBindCallApply": true,
      "strictPropertyInitialization": true,
      "noImplicitThis": true,
      "alwaysStrict": true
    }
  }
  ```

- [ ] Fix strict mode errors in `packages/shared`
- [ ] Fix strict mode errors in `packages/walrus`
- [ ] Fix strict mode errors in `packages/walrus-sui-core`
- [ ] Fix strict mode errors in `packages/spreadsheet-sdk`
- [ ] Fix strict mode errors in `packages/subwallet`
- [ ] Fix strict mode errors in `frontend/`
- [ ] Fix strict mode errors in `scripts/`
- [ ] Fix strict mode errors in test utilities

### 3.4 ESLint TypeScript Integration

- [ ] Install `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`
- [ ] Update ESLint config to use TypeScript parser
- [ ] Add TypeScript-specific rules:
  - `@typescript-eslint/no-explicit-any`: warn
  - `@typescript-eslint/no-unused-vars`: error
  - `@typescript-eslint/explicit-function-return-type`: warn (for public APIs)
- [ ] Run `bun run lint` and fix issues

### 3.5 Package Exports Finalization

For each package, ensure proper export maps:

- [ ] `packages/shared/package.json`:
  ```json
  {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
  ```
- [ ] Repeat for all packages
- [ ] Verify builds emit correct files
- [ ] Test imports from consuming code

### 3.6 Re-enable Skipped Tests

- [ ] Find all `.skip()` or `test.todo()` in test files
- [ ] Fix and re-enable tests now that paths/types are stable
- [ ] Ensure 100% of tests are running

### 3.7 CI/CD Updates

- [ ] Add `bun run typecheck` to CI pipeline
- [ ] Add `bun run lint` to CI pipeline
- [ ] Ensure `bun test` runs with coverage
- [ ] Ensure `bun run build` builds all packages

### 3.8 Phase 3 Verification

- [ ] Run `bun install`
- [ ] Run `bun run typecheck` (no errors)
- [ ] Run `bun run lint` (no errors)
- [ ] Run `bun test` (all tests pass)
- [ ] Run `bun run build` (all packages build)
- [ ] Run `bun run dev:full` (app starts and works)
- [ ] Commit checkpoint: "Phase 3: Aliases, imports, and strict typing complete"
- [ ] Tag: `migration/phase3-complete`

**Expected State After Phase 3**:
- Strict TypeScript enabled across workspace
- All imports use package aliases
- All tests passing
- Linting clean
- Full type safety

---

## Post-Migration Tasks

### Documentation Updates

- [ ] Update `docs/ARCHITECTURE.md` with final structure
- [ ] Update `docs/QUICKSTART.md` with new commands and structure
- [ ] Update `docs/CONFIGURATION.md` with alias setup
- [ ] Update `AGENTS.md` and `docs/AGENTS-SHARED.md` with new conventions
- [ ] Create onboarding checklist in `docs/ONBOARDING.md`
- [ ] Log milestones in `docs/CHANGELOG.md`

### Cleanup

- [ ] Remove all `.backup`, `.old`, `.temp` files
- [ ] Remove commented-out code
- [ ] Remove unused dependencies from `package.json`
- [ ] Verify `.gitignore` is comprehensive
- [ ] Ensure `dist/` is not tracked anywhere

### Verification Commands

Document these standard commands in `docs/QUICKSTART.md`:

```bash
# Fresh setup
git clone --recurse-submodules <repo-url>
cd walsheetz
bun install
bun run setup

# Development
bun run dev:full

# Type checking
bun run typecheck

# Linting
bun run lint

# Testing
bun test

# Building
bun run build

# Update submodule
git submodule update --remote dreamlit-sdks
```

---

## Rollback Strategy

Each phase is tagged for easy rollback:

- **Phase 1 issues**: `git reset --hard migration/phase1-complete^`
- **Phase 2 issues**: `git reset --hard migration/phase1-complete`
- **Phase 3 issues**: `git reset --hard migration/phase2-complete`

Always commit after each major step within a phase for granular rollback.

---

## Notes & Decisions

### Why This Order?

1. **Structure First**: Moving files before TypeScript conversion prevents dealing with import paths twice
2. **TypeScript Second**: Converting to TS with the final structure in place means imports are correct from the start
3. **Strict Typing Last**: Enabling strict mode after basic types are in place allows incremental hardening

### Submodule Strategy

`dreamlit-sdks/` remains a read-only submodule. Updates happen in its own repository, then:
```bash
git submodule update --remote dreamlit-sdks
```

### Testing Strategy

Run tests after each major step. Keep tests passing throughout migration.

### Communication

Update team in standup after each phase completion. Migration should take approximately:
- Phase 1: 1-2 days
- Phase 2: 2-3 days
- Phase 3: 2-3 days
- Post-migration: 1 day

Total: ~1 week

---

## Migration Log

| Date | Phase | Milestone | Notes |
|------|-------|-----------|-------|
| 2025-11-06 | Planning | Document created | Initial migration plan defined |
|  |  |  |  |
|  |  |  |  |

---

**End of Migration Plan**
