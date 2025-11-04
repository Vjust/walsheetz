# Core Module

Core wallet orchestration logic for sub-wallet fleet management.

## Overview

Core implementation of SubWalletOrchestrator with wallet lifecycle management, sponsorship, and safety features.

## Exports

### SubWalletOrchestrator

Main class for managing sub-wallet fleets.

```typescript
class SubWalletOrchestrator {
  async createWallets(count: number): Promise<Wallet[]>;
  async fundWallets(sponsor: Keypair, options: FundOptions): Promise<void>;
  async sweepToSponsor(): Promise<void>;
  async removeWallet(id: number): Promise<void>;
  async clearWorkerWallets(): Promise<void>;
  getWallet(id: number): Wallet;
  getAllWallets(): Wallet[];
  getSponsorWallet(): Wallet;
}
```

### WalletManager

Low-level wallet management.

```typescript
class WalletManager {
  createWallet(): Wallet;
  deleteWallet(id: number): void;
  getBalance(address: string): Promise<bigint>;
  transfer(from: Keypair, to: string, amount: bigint): Promise<void>;
}
```

## Usage

```typescript
import { SubWalletOrchestrator } from '@walrus/subwallet-sdk/core';

const orchestrator = new SubWalletOrchestrator({
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  storage
});

// Create wallet fleet
const wallets = await orchestrator.createWallets(5);

// Fund with sponsored transactions
await orchestrator.fundWallets(sponsorKeypair, {
  amount: BigInt(100_000_000),
  walletIds: [1, 2, 3]
});

// Safe cleanup
await orchestrator.sweepToSponsor();
await orchestrator.clearWorkerWallets();
```

## Safety Features

- Wallet 0 deletion protection
- Balance check before deletion
- Auto-sweep in bulk operations
- Sponsored transaction support

## Related Modules

- [../storage/](../storage/) - Storage layer
- [../../cli/](../../cli/) - CLI interface

## Notes

- Orchestrator is the main entry point
- WalletManager handles low-level operations
- All operations respect safety constraints
- Supports both browser and Node.js
