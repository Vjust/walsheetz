# CLI Usage Guide

The `@walrus/subwallet-sdk` package includes a powerful command-line interface (CLI) for managing sub-wallets on Sui/Walrus blockchain.

## Installation

### Global Installation

Install globally to use the CLI from anywhere:

```bash
npm install -g @walrus/subwallet-sdk
# or
bun add -g @walrus/subwallet-sdk
```

After installation, the `walrus-wallet` command will be available:

```bash
walrus-wallet --help
```

### Local Usage (npx)

Run without installation using npx:

```bash
npx @walrus/subwallet-sdk wallets create 5
```

## Configuration

The CLI stores configuration in `~/.config/walrus-wallet/config.json`.

### Config File Location

- **macOS/Linux**: `~/.config/walrus-wallet/config.json`
- **Windows**: `%USERPROFILE%\.config\walrus-wallet\config.json`

### Available Settings

| Setting            | Description                          | Default                                |
| ------------------ | ------------------------------------ | -------------------------------------- |
| `rpcUrl`           | Sui RPC endpoint URL                 | `https://fullnode.testnet.sui.io:443` |
| `walletsDir`       | Directory to store wallet files      | `~/.walrus-wallets`                    |
| `network`          | Network name                         | `testnet`                              |
| `defaultSponsorKey`| Default sponsor private key (base64) | (none)                                 |

### Environment Variables

Environment variables override config file settings:

- `SUI_RPC_URL` - Sui RPC URL
- `WALLETS_DIR` - Wallets directory path
- `SUI_NETWORK` - Network name
- `SPONSOR_PRIVATE_KEY_B64` - Sponsor private key (base64)

### Managing Configuration

```bash
# Set a config value
walrus-wallet config set rpcUrl https://fullnode.mainnet.sui.io:443
walrus-wallet config set network mainnet
walrus-wallet config set walletsDir ~/my-wallets

# Get a specific value
walrus-wallet config get rpcUrl

# List all configuration
walrus-wallet config list
```

## Commands

### Wallet Management

#### Create Wallets

Create one or more sub-wallets:

```bash
# Create a single wallet
walrus-wallet wallets create

# Create multiple wallets
walrus-wallet wallets create 10

# Output as JSON
walrus-wallet wallets create 5 --json
```

#### List Wallets

List all existing wallets:

```bash
# Table format (default)
walrus-wallet wallets list

# JSON format
walrus-wallet wallets list --json
```

#### Show Wallet Details

Show details for a specific wallet:

```bash
walrus-wallet wallets show wallet-0

# JSON output
walrus-wallet wallets show wallet-0 --json
```

#### Remove Wallet

Remove a wallet (with confirmation):

```bash
# Interactive confirmation
walrus-wallet wallets remove wallet-0

# Skip confirmation
walrus-wallet wallets remove wallet-0 --force
```

### Balance Operations

#### Check All Balances

Check SUI and WAL balances for all wallets:

```bash
# Table format
walrus-wallet balance check

# JSON format
walrus-wallet balance check --json
```

#### Show Specific Balance

Check balance for a specific address:

```bash
walrus-wallet balance show 0x1234567890abcdef...
```

#### Aggregate Balance

Get total balance across all wallets:

```bash
walrus-wallet balance aggregate

# JSON output
walrus-wallet balance aggregate --json
```

### Funding Operations

#### Fund Wallets

Fund all wallets with SUI from a sponsor:

```bash
# Using sponsor key from env or config
walrus-wallet fund wallets 1.0 --sponsor-key <BASE64_KEY>

# Using environment variable
export SPONSOR_PRIVATE_KEY_B64="your_base64_key"
walrus-wallet fund wallets 0.5
```

#### Sponsored Transactions

Fund wallets using sponsored transactions (gasless for recipients):

```bash
walrus-wallet fund sponsored 1.0 --sponsor-key <BASE64_KEY>
```

#### Fund via Move Contract

Fund wallets through Move contract with on-chain policy enforcement:

```bash
walrus-wallet fund via-move 1.0 \
  --package-id 0xPACKAGE_ID \
  --sponsor-cap-id 0xSPONSOR_CAP_ID \
  --coin-object-id 0xCOIN_OBJECT_ID \
  --sponsor-key <BASE64_KEY>

# With optional policy ID
walrus-wallet fund via-move 1.0 \
  --package-id 0xPACKAGE_ID \
  --policy-id 0xPOLICY_ID \
  --sponsor-cap-id 0xSPONSOR_CAP_ID \
  --coin-object-id 0xCOIN_OBJECT_ID
```

### Sweeping Operations

#### Sweep All Wallets

Sweep funds from all wallets to a target address:

```bash
# Sweep all funds
walrus-wallet sweep all 0xTARGET_ADDRESS

# Keep some SUI in each wallet
walrus-wallet sweep all 0xTARGET_ADDRESS --keep-amount 0.1
```

#### Sweep to Sponsor

Sweep all funds back to the sponsor address:

```bash
walrus-wallet sweep to-sponsor --sponsor-key <BASE64_KEY>

# Keep some SUI in wallets
walrus-wallet sweep to-sponsor --sponsor-key <BASE64_KEY> --keep-amount 0.05
```

### Plugin Management

The CLI supports plugins for extending functionality.

#### Install Plugin

```bash
# Install from npm
walrus-wallet plugins install @myorg/walrus-custom-plugin

# Install from git
walrus-wallet plugins install https://github.com/myorg/plugin.git

# Install from local path
walrus-wallet plugins install ./local-plugin
```

#### List Installed Plugins

```bash
walrus-wallet plugins list
```

#### Uninstall Plugin

```bash
walrus-wallet plugins uninstall @myorg/walrus-custom-plugin
```

## Global Flags

These flags are available on all commands:

| Flag            | Description                   | Default |
| --------------- | ----------------------------- | ------- |
| `--json`        | Output in JSON format         | false   |
| `--rpc-url`     | Override RPC URL              | (config)|
| `--wallets-dir` | Override wallets directory    | (config)|
| `--config`      | Use custom config file path   | (default)|
| `--help`        | Show help for command         | -       |

## Common Workflows

### Initial Setup

```bash
# 1. Configure CLI
walrus-wallet config set rpcUrl https://fullnode.testnet.sui.io:443
walrus-wallet config set network testnet
walrus-wallet config set walletsDir ~/.walrus-wallets

# 2. Create wallets
walrus-wallet wallets create 10

# 3. List created wallets
walrus-wallet wallets list
```

### Fund and Check Balances

```bash
# 1. Set sponsor key
export SPONSOR_PRIVATE_KEY_B64="your_base64_key"

# 2. Fund wallets
walrus-wallet fund wallets 1.0

# 3. Check balances
walrus-wallet balance check

# 4. View aggregate
walrus-wallet balance aggregate
```

### Cleanup and Recovery

```bash
# 1. Sweep all funds back to sponsor
walrus-wallet sweep to-sponsor --sponsor-key <BASE64_KEY>

# 2. Remove individual wallets if needed
walrus-wallet wallets remove wallet-0 --force
```

## Scripting with JSON Output

The `--json` flag makes the CLI perfect for scripting:

```bash
#!/bin/bash

# Create wallets and capture output
WALLETS=$(walrus-wallet wallets create 5 --json)

# Parse with jq
echo $WALLETS | jq -r '.[].address'

# Check balances
BALANCES=$(walrus-wallet balance check --json)

# Get total SUI
echo $BALANCES | jq -r 'map(.sui | tonumber) | add'
```

## Troubleshooting

### Common Issues

**"RPC URL is required"**
- Set via config: `walrus-wallet config set rpcUrl <URL>`
- Or use flag: `--rpc-url <URL>`
- Or env var: `export SUI_RPC_URL=<URL>`

**"Sponsor key is required"**
- Use flag: `--sponsor-key <BASE64_KEY>`
- Or env var: `export SPONSOR_PRIVATE_KEY_B64=<KEY>`
- Or set in config: `walrus-wallet config set defaultSponsorKey <KEY>`

**"Wallet not found"**
- List all wallets: `walrus-wallet wallets list`
- Ensure wallets directory is correct: `walrus-wallet config get walletsDir`

### Debug Mode

For verbose output, use the oclif debug environment variable:

```bash
DEBUG=* walrus-wallet wallets create 5
```

## Next Steps

- See [Plugin Development Guide](./PLUGIN_DEVELOPMENT.md) to create custom plugins
- See [API Integration Guide](./API_INTEGRATION.md) for integrating external APIs
- Explore the SDK programmatically: [README](../README.md)
