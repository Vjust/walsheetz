# CLI Config

Configuration management for sub-wallet CLI.

## Overview

Handles CLI configuration including Sui CLI integration, network settings, and wallet storage paths.

## Features

- Auto-load from Sui CLI configuration
- Environment variable support
- Custom config file support
- Network-specific settings

## Configuration

```typescript
{
  network: 'testnet' | 'mainnet',
  rpcUrl: string,
  storagePath: string,
  sponsorAddress: string,      // Auto-synced from Sui CLI
  autoSync: boolean,
  confirmations: boolean
}
```

## Usage

```bash
# Use default config (from Sui CLI)
walrus-wallet wallets create 5

# Custom config file
walrus-wallet --config ./my-config.json wallets create 5

# Environment variables
WALRUS_NETWORK=testnet walrus-wallet balance check
```

## Related Modules

- [../](../) - CLI module
- [../commands/](../commands/) - Command implementations

## Notes

- Automatically loads from `~/.sui/sui_config/client.yaml`
- Supports config file overrides
- Network-specific RPC URLs
- Validates configuration on load
