# Sub-Wallet Walrus Module

Core sub-wallet implementation with Walrus integration, Move contracts, and wallet orchestration.

## Overview

Complete sub-wallet implementation featuring automatic sponsor bootstrapping, protected wallet operations, and Walrus storage integration.

## Structure

```
sub-wallet-walrus/
├── core/          # Core wallet logic
├── storage/       # Storage adapters
├── contracts/     # Move smart contracts
└── wrappers/      # Service wrappers
```

## Features

### Sponsor Wallet Protection
- Wallet 0 auto-synced with Sui CLI active address
- Protected from deletion
- Automatic gas sponsorship

### Worker Wallets
- Wallets 1-N are worker wallets
- Deletable only when balance = 0
- Sponsored transactions

### Safety Architecture

```
┌─────────────────────────────────────────┐
│         Wallet Protection Layer         │
├─────────────────────────────────────────┤
│  Wallet 0 (Sponsor)                     │
│  ✓ Synced with Sui CLI                 │
│  ✓ Protected from deletion             │
│  ✓ Can hold funds                       │
│  ✓ Pays gas for operations             │
├─────────────────────────────────────────┤
│  Wallets 1-N (Workers)                  │
│  ✓ Deletable when balance = 0          │
│  ✓ Use sponsored transactions           │
│  ✓ Auto-sweep before clear              │
└─────────────────────────────────────────┘
```

## Usage

```typescript
import { SubWalletOrchestrator } from '@walrus/subwallet-sdk';

const orchestrator = new SubWalletOrchestrator({
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  storage: new NodeFsStorageAdapter('./wallets')
});

// Wallet 0 auto-created
const wallets = await orchestrator.createWallets(10);

// Fund wallets (sponsor pays gas)
await orchestrator.fundWallets(sponsorKeypair, {
  amount: BigInt(100_000_000)
});

// Sweep before cleanup
await orchestrator.sweepToSponsor();
```

## Related Modules

- [./core/](./core/) - Core wallet logic
- [./storage/](./storage/) - Storage adapters
- [./contracts/](./contracts/) - Move contracts

## Notes

- Wallet 0 is special (sponsor)
- Worker wallets use sponsored transactions
- Auto-sweep prevents fund loss
- Storage adapters for browser/Node.js
