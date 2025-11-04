# Sub-Wallet SDK Examples

Example applications and usage patterns for @walrus/subwallet-sdk.

## Overview

Examples demonstrating sub-wallet fleet management, sponsored transactions, and plugin development.

## Examples

### Basic Examples
- **Simple Fleet** - Create and manage wallet fleet
- **Sponsored Transactions** - Gasless worker transactions
- **CLI Usage** - Command-line wallet management
- **Browser Integration** - Browser-based wallet management

### Advanced Examples
- **Custom Plugin** - Extend CLI with custom commands
- **API Integration** - REST API for wallet management
- **Batch Operations** - Bulk wallet operations
- **Move Contract Integration** - On-chain policy enforcement

## Quick Start

### Basic Fleet Management

```typescript
import { SubWalletOrchestrator, NodeFsStorageAdapter } from '@walrus/subwallet-sdk';

const storage = new NodeFsStorageAdapter('./wallets');
const orchestrator = new SubWalletOrchestrator({
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  storage
});

// Create fleet
const wallets = await orchestrator.createWallets(10);
console.log('Created wallets:', wallets.map(w => w.address));

// Fund wallets
await orchestrator.fundWallets(sponsorKeypair, {
  amount: BigInt(100_000_000)
});

// Cleanup
await orchestrator.sweepToSponsor();
await orchestrator.clearWorkerWallets();
```

### CLI Example

```bash
# Install globally
npm install -g @walrus/subwallet-sdk

# Create wallets
walrus-wallet wallets create 5

# Fund wallets
walrus-wallet fund wallets 0.1 --sponsor-key ~/.sui/sui_config/sui.keystore

# Check balances
walrus-wallet balance check

# Clean up
walrus-wallet wallets clear --sweep
```

## Plugin Example

See [./plugin-custom-api/](./plugin-custom-api/) for custom plugin example.

```typescript
// custom-plugin.ts
export default {
  name: 'my-api',
  commands: {
    'api-fund': async (args) => {
      // Custom API funding logic
    }
  }
};
```

## Related Documentation

- [../src/cli/](../src/cli/) - CLI API
- [../src/sub-wallet-walrus/](../src/sub-wallet-walrus/) - Core API
- [../README.md](../README.md) - Package overview

## Notes

- Examples use testnet by default
- Sponsor wallet auto-synced from Sui CLI
- All examples include safety features
- Plugin system for extensibility
