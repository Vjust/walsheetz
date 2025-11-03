# Dreamlit SDKs

Collection of TypeScript SDKs for building on Walrus + Sui blockchain.

## Packages

- **[@dreamlit/walrus](./packages/walrus)** - Walrus decentralized storage adapter (Browser + Node.js)
- **[@dreamlit/walrus-sui-core](./packages/walrus-sui-core)** - Blockchain core with Walrus + Sui integration (CLI-compatible)
- **[@dreamlit/spreadsheet-sdk](./packages/spreadsheet-sdk)** - React-based spreadsheet SDK with Walrus storage

## Quick Start

```bash
# Install a package
npm install @dreamlit/walrus-sui-core

# Or use all packages
npm install @dreamlit/walrus @dreamlit/walrus-sui-core @dreamlit/spreadsheet-sdk
```

## Development

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun test

# Clean build artifacts
bun run clean
```

## Documentation

Each package has its own README with detailed documentation:
- [Walrus Storage Adapter](./packages/walrus/README.md)
- [Walrus + Sui Core](./packages/walrus-sui-core/README.md)
- [Spreadsheet SDK](./packages/spreadsheet-sdk/README.md)

## License

MIT
