# Scripts Module

Build and utility scripts for sub-wallet SDK development.

## Overview

Collection of scripts for building, testing, deployment, and maintenance of the sub-wallet SDK.

## Scripts

### Build Scripts
- `build.sh` - Build TypeScript and Move contracts
- `clean.sh` - Clean build artifacts
- `watch.sh` - Watch mode for development

### Test Scripts
- `test.sh` - Run all tests
- `test-unit.sh` - Unit tests only
- `test-integration.sh` - Integration tests
- `coverage.sh` - Generate coverage report

### Deployment Scripts
- `deploy-contracts.sh` - Deploy Move contracts
- `publish-npm.sh` - Publish to npm
- `bump-version.sh` - Bump package version

### Utility Scripts
- `generate-docs.sh` - Generate documentation
- `lint.sh` - Run linters
- `format.sh` - Format code

## Usage

### Building

```bash
# Build everything
./scripts/build.sh

# Clean build
./scripts/clean.sh && ./scripts/build.sh

# Watch mode
./scripts/watch.sh
```

### Testing

```bash
# All tests
./scripts/test.sh

# Unit tests only
./scripts/test-unit.sh

# With coverage
./scripts/coverage.sh
```

### Deployment

```bash
# Deploy contracts to testnet
./scripts/deploy-contracts.sh --network testnet

# Publish to npm
./scripts/publish-npm.sh --tag latest

# Bump version
./scripts/bump-version.sh patch
```

## Script Reference

### build.sh
```bash
#!/bin/bash
# Build TypeScript
bun run build

# Build Move contracts
cd move/walrus_subwallet
sui move build
```

### deploy-contracts.sh
```bash
#!/bin/bash
NETWORK=${1:-testnet}

cd move/walrus_subwallet
sui client publish \
  --gas-budget 100000000 \
  --network $NETWORK
```

### test.sh
```bash
#!/bin/bash
# Run TypeScript tests
bun test

# Run Move tests
cd move/walrus_subwallet
sui move test
```

## Environment Variables

```bash
SUI_NETWORK=testnet        # Sui network (testnet/mainnet)
PUBLISH_TAG=latest         # npm publish tag
SKIP_TESTS=false          # Skip tests during build
```

## Related Documentation

- [../](../) - Package root
- [../move/](../move/) - Move contracts

## Notes

- All scripts support dry-run mode with `--dry-run`
- Environment-specific configurations supported
- Error handling and rollback included
- CI/CD integration ready
