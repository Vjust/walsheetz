# Changelog

All notable changes to @walrus/subwallet-sdk will be documented in this file.

## [0.1.0] - 2025-11-01

### Added

#### Core Features
- `SubWalletManager` class for wallet orchestration
  - Create wallets programmatically
  - Check balances across multiple wallets
  - Fund wallets from sponsor account
  - Sweep funds back to main wallet
  - Parallel operations with configurable concurrency

- `SponsoredTransactions` class for gasless operations
  - Dual-signature sponsored transfers
  - Batch sponsor operations
  - Custom transaction builder support

- `SubWalletOrchestrator` facade
  - High-level API combining manager + sponsor
  - Utility methods for formatting/parsing
  - Convenient sponsor operations

#### Storage Adapters
- `MemoryStorageAdapter` - In-memory storage for browser/testing
- `NodeFsStorageAdapter` - Filesystem storage compatible with original YAML format

#### TypeScript Support
- Full type definitions
- ESM module format
- Source maps for debugging
- Declaration maps for better IDE support

#### Examples
- Node.js CLI example
- React/Next.js browser example
- Custom storage adapter examples (localStorage, IndexedDB)

#### Documentation
- Comprehensive README with API reference
- Migration guide from shell scripts
- Usage examples for Node and browser
- Test suite with vitest

### Ported from Shell Scripts
- `walrus-wallet-manager.sh` → `SubWalletManager`
  - check_all_balances → `checkAllBalances()`
  - sweep_all_to_main → `sweepWallets()`
  - distribute_funds → `fundWallets()`
  - create_inventory → Storage adapter system

- `wallet-batch-ops.sh` → Parallel operations
  - parallel_balance_check → `checkAllBalances()` with concurrency
  - mass_transfer → `fundWallets()` / `sweepWallets()`
  - execute_on_all → Built into all operations

- `scripts/sponsor_batch.js` → `SponsoredTransactions`
  - sponsorTransferSui → `sponsorTransferSui()`
  - cmdFund → `batchSponsorTransfers()`

### Technical Details
- TypeScript 5.3+
- @mysten/sui.js ^0.54.0
- Node.js 18.17+ required
- Browser compatible (ESM)
- Zero dependencies for core (aside from @mysten/sui.js)

### Breaking Changes
- N/A (initial release)

### Deprecated
- N/A (initial release)

### Security
- Keypairs stored encrypted in base64 format
- Compatible with Sui keystore format
- No plaintext private keys in storage

## [Unreleased]

### Planned Features
- React hooks for wallet operations
- Vue composables
- CLI tool package
- Wallet import/export utilities
- Gas estimation helpers
- Transaction batching optimizations
- Multi-sponsor support
- Webhook support for transaction monitoring

