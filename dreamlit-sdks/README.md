# Dreamlit SDKs

Official SDK packages for building decentralized applications with Walrus storage and Sui blockchain.

## Overview

The Dreamlit SDK suite provides modular, production-ready packages for integrating Walrus decentralized storage and Sui blockchain into your applications.

### 📦 Packages

| Package | Version | Description | Size |
|---------|---------|-------------|------|
| [@dreamlit/walrus](./packages/walrus/) | 1.0.0 | Core Walrus storage adapter | 146 KB |
| [@dreamlit/walrus-sui-core](./packages/walrus-sui-core/) | 1.0.0 | Sui blockchain integration | 1.52 MB (Node), 783 KB (Browser) |
| [@dreamlit/spreadsheet-sdk](./packages/spreadsheet-sdk/) | 1.0.0 | React spreadsheet SDK | 1.07 MB |

### 🎯 Choose Your Package

**Building a CLI tool or Node.js app?**
→ Start with `@dreamlit/walrus` + `@dreamlit/walrus-sui-core/node`

**Building a web application?**
→ Use `@dreamlit/walrus` + `@dreamlit/walrus-sui-core/browser`

**Building a spreadsheet app?**
→ Use all three: `@dreamlit/spreadsheet-sdk` (includes the others as peer dependencies)

## Quick Start

### Installation

```bash
# Install core Walrus storage
npm install @dreamlit/walrus

# Add Sui blockchain integration
npm install @dreamlit/walrus-sui-core

# For spreadsheet apps, add the React SDK
npm install @dreamlit/spreadsheet-sdk react react-dom
```

### Usage Examples

#### 1. Simple Storage (Walrus Only)

```javascript
import { browserWalrusService } from '@dreamlit/walrus';

// Store data
const { blobId } = await browserWalrusService.storeBlob({
  myData: 'value'
});

// Retrieve data
const { data } = await browserWalrusService.retrieveBlob(blobId);
console.log('Retrieved:', data);
```

#### 2. Storage + Blockchain (Node.js)

```javascript
import { nodeWalrusService } from '@dreamlit/walrus-sui-core/node';
import { suiService } from '@dreamlit/walrus-sui-core/blockchain';

// Store to Walrus
const { blobId } = await nodeWalrusService.storeBlob(data);

// Record on Sui blockchain
await suiService.recordBlobId(blobId);

// Get network info
const network = await suiService.getNetworkInfo();
console.log('Sui network:', network);
```

#### 3. Full Spreadsheet App (React)

```jsx
import React from 'react';
import {
  SpreadsheetProvider,
  MainLayout
} from '@dreamlit/spreadsheet-sdk';
import '@dreamlit/spreadsheet-sdk/dist/index.css';

function App() {
  return (
    <SpreadsheetProvider>
      <MainLayout />
    </SpreadsheetProvider>
  );
}

export default App;
```

## Architecture

### Package Dependencies

```
@dreamlit/spreadsheet-sdk
    ├── @dreamlit/walrus-sui-core (peer)
    │   └── @dreamlit/walrus (peer)
    ├── react (peer)
    └── react-dom (peer)

@dreamlit/walrus-sui-core
    └── @dreamlit/walrus (peer)

@dreamlit/walrus
    ├── @mysten/walrus
    └── @mysten/sui
```

## Development

### Prerequisites

- **Bun** ≥ 1.0.0 (recommended) or Node.js ≥ 18
- **TypeScript** ≥ 5.0 (for type checking)

### Setup

```bash
# Clone repository
git clone <repository-url>
cd dreamlit-sdks

# Install dependencies
bun install

# Build all packages
cd packages/walrus && bun run build
cd ../walrus-sui-core && bun run build
cd ../spreadsheet-sdk && bun run build

# Run tests
bun test
```

### Workspace Structure

This is a **Bun workspace monorepo**. Packages are automatically linked:

```json
{
  "workspaces": ["packages/*"]
}
```

Changes to one package are immediately available to others during development.

## Documentation

### Package Documentation

- **[@dreamlit/walrus README](./packages/walrus/README.md)** - Storage adapter documentation
- **[@dreamlit/walrus-sui-core README](./packages/walrus-sui-core/README.md)** - Blockchain integration guide
- **[@dreamlit/spreadsheet-sdk README](./packages/spreadsheet-sdk/README.md)** - React SDK reference

### Additional Guides

- [STATUS.md](./STATUS.md) - Extraction progress and statistics

## Testing

```bash
# Run all tests
bun test

# Run package-specific tests
cd packages/walrus && bun test
cd packages/walrus-sui-core && bun test
cd packages/spreadsheet-sdk && bun test
```

## Publishing

```bash
# Publish to npm (requires authentication)
cd packages/walrus && npm publish --access public
cd packages/walrus-sui-core && npm publish --access public
cd packages/spreadsheet-sdk && npm publish --access public
```

## License

MIT

## Extraction History

These packages were extracted from the [WalSheetz](https://github.com/your-org/walsheetz) monolith:

- **2025-11-02**: Initial extraction (Days 1-6)
  - Day 1: @dreamlit/walrus (26 files, ~2,500 LOC)
  - Days 2-3: @dreamlit/walrus-sui-core (73 files, ~25,000 LOC)
  - Days 4-6: @dreamlit/spreadsheet-sdk (90 files, ~15,000 LOC)
  - Total: ~42,500 LOC extracted across 189 files

See [STATUS.md](./STATUS.md) for detailed extraction progress.
