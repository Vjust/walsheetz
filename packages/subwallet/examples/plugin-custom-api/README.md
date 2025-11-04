# Walrus Wallet Plugin: Custom API Demo

This is an example plugin for `walrus-wallet` CLI that demonstrates how to create custom commands and integrate external APIs with the SubWallet SDK.

## Features

- Deploy content using a custom API
- Automatically manage wallets for deployments
- Check deployment status
- List all deployments
- Full TypeScript support
- JSON and table output formats

## Installation

### For Development

```bash
# Clone or copy this example
cd examples/plugin-custom-api

# Install dependencies
npm install

# Build
npm run build

# Link locally for testing
npm link

# Now you can use the commands
walrus-wallet demo deploy "Hello World" --api-key test-key
```

### For End Users

```bash
# Install the plugin
walrus-wallet plugins install walrus-wallet-plugin-demo

# Use the commands
walrus-wallet demo deploy "My Content" --api-key YOUR_KEY
```

## Commands

### `walrus-wallet demo deploy CONTENT`

Deploy content using the custom API with automatic wallet management.

```bash
# Basic usage
walrus-wallet demo deploy "Hello World" --api-key YOUR_KEY

# Specify number of wallets
walrus-wallet demo deploy "My Content" --wallet-count 10 --api-key YOUR_KEY

# JSON output
walrus-wallet demo deploy "Test" --api-key YOUR_KEY --json

# Custom API URL
walrus-wallet demo deploy "Data" --api-key YOUR_KEY --api-url https://custom.api.com
```

**Flags:**
- `--api-key` (required) - API key for the custom service (or set `CUSTOM_API_KEY` env var)
- `--wallet-count` - Number of wallets to use (default: 3)
- `--api-url` - API base URL (default: https://api.example.com)
- `--json` - Output in JSON format

### `walrus-wallet demo status DEPLOYMENT_ID`

Check the status of a deployment.

```bash
# Check status
walrus-wallet demo status deploy-123 --api-key YOUR_KEY

# JSON output
walrus-wallet demo status deploy-456 --api-key YOUR_KEY --json
```

### `walrus-wallet demo list`

List all deployments.

```bash
# List deployments (table format)
walrus-wallet demo list --api-key YOUR_KEY

# JSON output
walrus-wallet demo list --api-key YOUR_KEY --json
```

## How It Works

### 1. Custom API Client

The plugin includes a custom API client (`src/lib/api-client.ts`) that wraps your API endpoints. Replace the mock implementation with actual HTTP requests to your API.

### 2. Commands Using BaseCommand

All commands extend `BaseCommand` from the SDK, which provides:
- Access to `SubWalletOrchestrator` via `this.getOrchestrator()`
- Configuration management via `this.config`
- Consistent error handling via `this.handleError()`
- JSON and human-readable output via `this.output()`

### 3. Integration with SDK

The `demo deploy` command demonstrates:
- Loading existing wallets
- Creating new wallets if needed
- Passing wallet addresses to the API
- Combining SDK wallet management with custom API calls

## Customization

### Replace Mock API

Edit `src/lib/api-client.ts` to make real HTTP requests:

```typescript
async deploy(data: any): Promise<DeploymentResult> {
  const response = await fetch(`${this.baseUrl}/deploy`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`)
  }

  return response.json()
}
```

### Add New Commands

Create new command files in `src/commands/demo/`:

```typescript
// src/commands/demo/mycommand.ts
import { BaseCommand } from '@walrus/subwallet-sdk/cli'

export default class DemoMyCommand extends BaseCommand {
  static description = 'My custom command'

  async run(): Promise<void> {
    const orchestrator = this.getOrchestrator()
    // Your logic here
  }
}
```

### Add Authentication

Store API keys in the CLI config:

```typescript
import { configManager } from '@walrus/subwallet-sdk/cli'

// Save key
configManager.set('customApiKey', 'your-key-here')

// Retrieve key
const apiKey = configManager.get('customApiKey') || flags['api-key']
```

## Publishing

1. Update `package.json` with your details
2. Build the plugin: `npm run build`
3. Test locally: `npm link`
4. Publish to npm: `npm publish`

Users can then install with:
```bash
walrus-wallet plugins install your-plugin-name
```

## Resources

- [Plugin Development Guide](../../docs/PLUGIN_DEVELOPMENT.md)
- [API Integration Guide](../../docs/API_INTEGRATION.md)
- [CLI Usage Guide](../../docs/CLI.md)
- [oclif Documentation](https://oclif.io)

## License

MIT
