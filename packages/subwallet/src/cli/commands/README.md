# CLI Commands

Command implementations for sub-wallet CLI operations.

## Overview

This module contains all CLI command implementations for wallet management, funding, balance checking, and utility operations.

## Commands

### Wallet Commands
- `create` - Create new worker wallets
- `list` - List all wallets with details
- `remove` - Remove specific wallet (with safety checks)
- `clear` - Clear all worker wallets
- `show` - Show wallet details

### Fund Commands
- `fund-wallets` - Fund all wallets
- `fund-wallet` - Fund specific wallet
- `sweep` - Sweep funds to sponsor

### Balance Commands
- `check` - Check all balances
- `sponsor-balance` - Check sponsor balance
- `total` - Total balance across all wallets

### Utility Commands
- `export` - Export wallet data
- `import` - Import wallet data
- `backup` - Backup wallets
- `restore` - Restore from backup

## Usage

Each command follows consistent patterns:

```typescript
class CreateCommand extends BaseCommand {
  async execute(args: CommandArgs) {
    // Command logic
  }
}
```

## Related Modules

- [../](../) - CLI module
- [../config/](../config/) - Configuration
- [../utils/](../utils/) - Utilities

## Notes

- Commands extend BaseCommand
- Automatic validation and error handling
- Consistent output formatting
- Interactive prompts for safety
