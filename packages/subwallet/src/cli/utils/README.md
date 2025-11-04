# CLI Utils

Utility functions for sub-wallet CLI operations.

## Overview

Utilities for formatting output, handling user input, file operations, and CLI-specific helpers.

## Utilities

### Formatting
- `formatBalance()` - Format SUI amounts
- `formatAddress()` - Format addresses (truncated)
- `formatTable()` - Format data as table
- `colorize()` - Add terminal colors

### Input/Output
- `prompt()` - Interactive prompts
- `confirm()` - Confirmation dialogs
- `spinner()` - Loading spinners
- `progress()` - Progress bars

### File Operations
- `loadWallets()` - Load wallet data
- `saveWallets()` - Save wallet data
- `backupWallets()` - Backup wallets
- `validatePath()` - Validate file paths

### Validation
- `validateAddress()` - Validate Sui addresses
- `validateAmount()` - Validate SUI amounts
- `validateWalletId()` - Validate wallet IDs

## Usage

```typescript
import { formatBalance, confirm, spinner } from './utils';

const formatted = formatBalance(1000000000); // "1.0 SUI"

const shouldContinue = await confirm('Continue?');

const spin = spinner('Processing...');
// ... operation
spin.stop();
```

## Related Modules

- [../](../) - CLI module
- [../commands/](../commands/) - Uses utilities

## Notes

- Terminal-friendly formatting
- Cross-platform compatibility
- Error handling included
- Consistent UX patterns
