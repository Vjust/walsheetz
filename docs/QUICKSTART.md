# WalSheetz Quick Start Guide

Get up and running with WalSheetz development in under 5 minutes.

## Prerequisites

- **Bun** 1.0+ ([Install Bun](https://bun.sh))
- **Node.js** 18.17+ (for some CLI tools)
- **Git** for version control

## Setup (3 commands)

```bash
# 1. Clone and enter the repository
git clone <your-repo-url> && cd walsheetz

# 2. Run automated setup
bun run setup

# 3. Start development
bun run dev
```

The setup script will:
- Validate your environment
- Install all dependencies
- Check port availability
- Display next steps

## Common Development Commands

### Development Servers

```bash
# Frontend only (port 3000)
bun run dev

# Bridge server only (port 3005)
bun run dev:bridge

# Both services (recommended for full-stack testing)
bun run dev:full
```

### Testing

```bash
# Run all tests
bun test

# Run tests in watch mode
bun run test:watch

# Run specific test file
bun test path/to/test.test.js
```

### Building

```bash
# Build all packages
bun run build

# Build specific package
bun run --filter @dreamlit/walrus build

# Clean build artifacts
bun run clean
```

### Code Quality

```bash
# Lint code
bun run lint

# Auto-fix lint issues
bun run lint:fix

# Type check
bun run typecheck

# Format code
bun run format
```

### System Health

```bash
# Run health checks on all services
bun run health

# Check configuration
cat docs/CONFIGURATION.md
```

## Project Structure

```
walsheetz/
├── packages/              # SDK packages
│   ├── walrus/           # Core Walrus storage
│   ├── walrus-sui-core/  # Blockchain integration
│   ├── spreadsheet-sdk/  # React spreadsheet components
│   ├── subwallet/        # Sub-wallet CLI
│   └── shared/           # Shared utilities
├── frontend/             # React application
├── blockchain/           # Bridge server
├── scripts/              # Automation scripts
├── docs/                 # Documentation
└── tests/                # Test setup
```

## Key Entry Points

| Path | Description |
|------|-------------|
| `frontend/main.jsx` | Frontend application entry |
| `frontend/presentation/App.jsx` | Root React component |
| `blockchain/websocket-grpc-bridge.js` | Bridge server |
| `packages/*/src/index.ts` | Package exports |

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Sui Network
SUI_NETWORK=testnet

# Bridge Configuration
BRIDGE_PORT=3005

# Walrus Publisher
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
```

See [CONFIGURATION.md](./CONFIGURATION.md) for complete environment setup.

## Development Workflows

### Adding a New Feature

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes in appropriate packages
3. Run tests: `bun test`
4. Build packages: `bun run build`
5. Test locally: `bun run dev:full`
6. Commit and push

### Working with Packages

```bash
# Install dependency in specific package
cd packages/walrus && bun add some-package

# Run package-specific script
bun run --filter @dreamlit/walrus test

# Link packages locally (automatic with workspaces)
# Just import: import { BrowserWalrusService } from '@dreamlit/walrus'
```

### Debugging

```bash
# Start with debug logging
bun run debug:bridge
bun run debug:frontend

# View logs in real-time
tail -f logs/bridge.log

# Use VSCode debugger (configured in .vscode/launch.json)
# Press F5 to start debugging
```

See [DEBUG-LOGGING.md](./DEBUG-LOGGING.md) for detailed debugging guide.

## Testing Your Changes

```bash
# 1. Run unit tests
bun test

# 2. Run smoke tests (end-to-end)
bun run test:smoke

# 3. Type check
bun run typecheck

# 4. Lint
bun run lint

# 5. Manual testing
bun run dev:full
# Open http://localhost:3000
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3005
lsof -i :3005

# Kill the process
kill -9 <PID>
```

### Build Failures

```bash
# Clean everything and rebuild
bun run clean
rm -rf node_modules
bun install
bun run build
```

### Test Failures

```bash
# Update snapshots
bun test -u

# Run specific test
bun test path/to/failing-test.test.js

# Debug test
bun test --inspect-brk path/to/test.test.js
```

### Dependency Issues

```bash
# Reinstall dependencies
rm -rf node_modules bun.lock
bun install
```

## Next Steps

- **Architecture Deep Dive**: [docs/README.md](./README.md)
- **Testing Guide**: [docs/TESTING.md](./TESTING.md)
- **Configuration Reference**: [docs/CONFIGURATION.md](./CONFIGURATION.md)
- **Debug & Logging**: [docs/DEBUG-LOGGING.md](./DEBUG-LOGGING.md)
- **Contributing**: See AGENTS.md files in each directory

## Getting Help

- **Issues**: File at [GitHub Issues](https://github.com/your-repo/issues)
- **Documentation**: Check `docs/` directory
- **Code Examples**: See `packages/*/examples/`
- **Tests**: Review `**/__tests__/` for usage examples

## Quick Reference Card

| Task | Command |
|------|---------|
| Setup | `bun run setup` |
| Dev frontend | `bun run dev` |
| Dev bridge | `bun run dev:bridge` |
| Dev both | `bun run dev:full` |
| Test | `bun test` |
| Build | `bun run build` |
| Clean | `bun run clean` |
| Lint | `bun run lint` |
| Format | `bun run format` |
| Health | `bun run health` |

---

**Ready to build?** Run `bun run dev` and open http://localhost:3000
