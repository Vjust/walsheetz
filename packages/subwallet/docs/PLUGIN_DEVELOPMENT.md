# Plugin Development Guide

This guide shows you how to create custom plugins for the `walrus-wallet` CLI to add your own commands and integrate external APIs.

## Table of Contents

- [Quick Start](#quick-start)
- [Plugin Anatomy](#plugin-anatomy)
- [Using the SDK in Plugins](#using-the-sdk-in-plugins)
- [Best Practices](#best-practices)
- [Publishing](#publishing)
- [Example: Custom API Plugin](#example-custom-api-plugin)

## Quick Start

### 1. Initialize Plugin Project

```bash
mkdir walrus-wallet-plugin-myapi
cd walrus-wallet-plugin-myapi
npm init -y
```

### 2. Install Dependencies

```bash
npm install @oclif/core @walrus/subwallet-sdk
npm install --save-dev typescript @types/node
```

### 3. Configure package.json

```json
{
  "name": "walrus-wallet-plugin-myapi",
  "version": "1.0.0",
  "description": "Custom API integration for walrus-wallet",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "oclif": {
    "commands": "./dist/commands",
    "bin": "walrus-wallet",
    "topicSeparator": " "
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "prepack": "npm run build"
  },
  "keywords": [
    "walrus-wallet",
    "oclif-plugin"
  ]
}
```

### 4. Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 5. Create Your First Command

Create `src/commands/myapi/deploy.ts`:

```typescript
import { Args, Flags } from '@oclif/core'
import { BaseCommand } from '@walrus/subwallet-sdk/cli'
import { SubWalletOrchestrator } from '@walrus/subwallet-sdk'

export default class MyApiDeploy extends BaseCommand {
  static description = 'Deploy using custom API'

  static examples = [
    '<%= config.bin %> <%= command.id %> --blob-id abc123',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    'blob-id': Flags.string({
      description: 'Blob ID to deploy',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(MyApiDeploy)

    try {
      const orchestrator = this.getOrchestrator()

      // Your custom API integration here
      this.log(`Deploying blob ${flags['blob-id']}`)

      // Use orchestrator methods as needed
      const wallets = await orchestrator.loadWallets()
      this.log(`Using ${wallets.length} wallets`)

      this.output({ success: true, blobId: flags['blob-id'] })
    } catch (error) {
      this.handleError(error)
    }
  }
}
```

### 6. Build and Test Locally

```bash
npm run build

# Test locally by linking
npm link

# Now use your command
walrus-wallet myapi deploy --blob-id test123
```

## Plugin Anatomy

### Directory Structure

```
walrus-wallet-plugin-myapi/
├── package.json
├── tsconfig.json
├── src/
│   ├── commands/
│   │   └── myapi/
│   │       ├── deploy.ts
│   │       ├── list.ts
│   │       └── status.ts
│   └── lib/
│       ├── api-client.ts
│       └── helpers.ts
└── README.md
```

### Command Structure

Commands follow oclif conventions:

```typescript
import { Args, Flags } from '@oclif/core'
import { BaseCommand } from '@walrus/subwallet-sdk/cli'

export default class MyCommand extends BaseCommand {
  // Description shown in help
  static description = 'Command description'

  // Usage examples
  static examples = [
    '<%= config.bin %> <%= command.id %> --flag value',
  ]

  // Command-specific flags
  static flags = {
    ...BaseCommand.baseFlags,  // Include base flags (--json, --rpc-url, etc.)
    myFlag: Flags.string({
      description: 'My custom flag',
      required: false,
    }),
  }

  // Positional arguments
  static args = {
    myArg: Args.string({
      description: 'My argument',
      required: true,
    }),
  }

  // Command execution
  async run(): Promise<void> {
    const { args, flags } = await this.parse(MyCommand)

    try {
      // Your command logic here
      this.output({ result: 'success' })
    } catch (error) {
      this.handleError(error)
    }
  }
}
```

### Naming Conventions

**Command topics (namespaces):**
- Use lowercase with hyphens: `my-api`, `custom-ops`
- Directory structure: `commands/my-api/`

**Command names:**
- Use lowercase: `deploy`, `list`, `check-status`
- Full command: `walrus-wallet my-api deploy`

**Flags:**
- Use kebab-case: `--blob-id`, `--api-key`
- Boolean flags can have shortcuts: `-f` for `--force`

## Using the SDK in Plugins

### Accessing the Orchestrator

The `BaseCommand` class provides `getOrchestrator()`:

```typescript
import { BaseCommand } from '@walrus/subwallet-sdk/cli'

export default class MyCommand extends BaseCommand {
  async run(): Promise<void> {
    // Get configured orchestrator
    const orchestrator = this.getOrchestrator()

    // Use SDK methods
    const wallets = await orchestrator.loadWallets()
    const balances = await orchestrator.checkAllBalances()

    // Create new wallets
    await orchestrator.createWallets(5)

    // Fund wallets
    await orchestrator.fundWallets(sponsor, { amountPerWalletSui: 1.0 })
  }
}
```

### Accessing Configuration

Configuration is available via `this.config`:

```typescript
async run(): Promise<void> {
  // Access config values
  const rpcUrl = this.config.rpcUrl
  const walletsDir = this.config.walletsDir
  const network = this.config.network
}
```

### Using SDK Types

Import types from the SDK:

```typescript
import type {
  SubWalletOrchestrator,
  WalletData,
  BalanceInfo
} from '@walrus/subwallet-sdk'
```

### Custom Storage Adapters

Plugins can use custom storage adapters:

```typescript
import { NodeFsStorageAdapter } from '@walrus/subwallet-sdk'

const customStorage = new NodeFsStorageAdapter('/custom/path')

const orchestrator = new SubWalletOrchestrator({
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  storage: customStorage,
})
```

## Best Practices

### 1. Error Handling

Always use `handleError()` for consistent error messages:

```typescript
try {
  // Command logic
} catch (error) {
  this.handleError(error)  // Handles Error objects and unknown types
}
```

### 2. Output Formatting

Support both human-readable and JSON output:

```typescript
// Use this.output() for dual-format output
const data = { wallets: 10, total: 100 }
const table = formatWalletsTable(data)  // Human-readable

this.output(data, table)  // JSON if --json, table otherwise
```

### 3. Validation

Validate inputs before processing:

```typescript
import {
  validateSuiAddress,
  validatePositiveNumber,
  validateBase64
} from '@walrus/subwallet-sdk/cli'

const address = validateSuiAddress(args.address)
const amount = validatePositiveNumber(args.amount, 'Amount')
const key = validateBase64(flags.key, 'API key')
```

### 4. Async Operations with Spinners

Show progress for long operations:

```typescript
import { withSpinner } from '@walrus/subwallet-sdk/cli'

const result = await withSpinner(
  'Processing...',
  async () => expensiveOperation(),
  {
    successText: 'Processing complete',
    errorText: 'Processing failed',
  }
)
```

### 5. Configuration

Allow configuration via flags, config, and env vars:

```typescript
static flags = {
  ...BaseCommand.baseFlags,
  'api-key': Flags.string({
    description: 'API key',
    env: 'MY_API_KEY',  // Auto-read from environment
  }),
}
```

## Publishing

### 1. Prepare for Publishing

```bash
# Build
npm run build

# Test locally
npm link
walrus-wallet myapi deploy --help

# Unlink when done testing
npm unlink -g
```

### 2. Publish to npm

```bash
# Login to npm
npm login

# Publish
npm publish
```

### 3. Naming Convention

Name your plugin: `walrus-wallet-plugin-*` or `@yourorg/walrus-wallet-plugin-*`

### 4. Installation

Users install your plugin:

```bash
walrus-wallet plugins install walrus-wallet-plugin-myapi

# Or scoped
walrus-wallet plugins install @yourorg/walrus-wallet-plugin-myapi
```

## Example: Custom API Plugin

See [examples/plugin-custom-api](../examples/plugin-custom-api) for a complete working example that:

- Integrates with a custom REST API
- Uses the SubWalletOrchestrator to manage wallets
- Implements multiple commands
- Handles authentication
- Supports both JSON and table output
- Includes comprehensive error handling

### Key Files

- `src/commands/api/deploy.ts` - Deploy command
- `src/commands/api/status.ts` - Status check command
- `src/lib/api-client.ts` - API client wrapper
- `README.md` - Plugin documentation

## Resources

- [oclif Documentation](https://oclif.io/docs/introduction)
- [CLI Usage Guide](./CLI.md)
- [API Integration Guide](./API_INTEGRATION.md)
- [SubWalletOrchestrator API](../README.md#api-reference)

## Support

- Report issues: [GitHub Issues](https://github.com/yourorg/walrus-subwallet-sdk/issues)
- Ask questions: [Discussions](https://github.com/yourorg/walrus-subwallet-sdk/discussions)
