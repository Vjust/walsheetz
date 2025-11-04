# CLI Module

Command-line interface for @walrus/subwallet-sdk with plugin system and Sui CLI integration.

## Overview

Comprehensive CLI for managing sub-wallet fleets, featuring automatic sponsor wallet bootstrapping, plugin system, and safe wallet operations.

## Structure

```
cli/
├── base-command.ts         # Base command class
├── commands/               # Command implementations
├── config/                 # CLI configuration
└── utils/                  # CLI utilities
```

## Commands

### Wallet Management
- `wallets create <count>` - Create worker wallets
- `wallets list` - List all wallets
- `wallets remove <id>` - Remove wallet (with safety checks)
- `wallets clear` - Remove all worker wallets (keeps sponsor)

### Funding Operations
- `fund wallets <amount>` - Fund all wallets
- `fund wallet <id> <amount>` - Fund specific wallet
- `sweep to-sponsor` - Sweep funds back to sponsor

### Balance Operations
- `balance check` - Check all balances
- `balance sponsor` - Check sponsor balance

## Usage

```bash
# Global install
npm install -g @walrus/subwallet-sdk

# Create wallets (wallet 0 auto-created from Sui CLI)
walrus-wallet wallets create 5

# Fund wallets
walrus-wallet fund wallets 0.1 --sponsor-key <KEY>

# Check balances
walrus-wallet balance check

# Clean up
walrus-wallet wallets clear --sweep
```

## Plugin System

Extend functionality with custom plugins:

```typescript
// my-plugin.ts
export default {
  name: 'my-plugin',
  commands: {
    'my-command': async (args) => {
      // Custom command logic
    }
  }
};
```

```bash
walrus-wallet plugin install ./my-plugin.ts
walrus-wallet my-command
```

## Safety Features

- Wallet 0 (sponsor) cannot be deleted
- Cannot delete wallets with funds
- Auto-sweep before bulk operations
- Confirmation prompts for destructive operations

## Related Modules

- [./commands/](./commands/) - Command implementations
- [./config/](./config/) - Configuration
- [./utils/](./utils/) - Utilities

## Notes

- Wallet 0 auto-synced with Sui CLI
- Supports sponsored transactions
- Plugin system for extensibility
- Safe operations with built-in protections
