# Spreadsheet SDK Examples

Example applications demonstrating @dreamlit/spreadsheet-sdk usage with React and Walrus/Sui integration.

## Overview

This directory will contain example applications showing how to build spreadsheet applications with the Walrus-powered spreadsheet SDK.

## Planned Examples

### Basic Examples
- **Simple Spreadsheet** - Minimal spreadsheet app with save/load
- **With Autosave** - Spreadsheet with automatic saving
- **Import/Export** - Excel and CSV import/export
- **Wallet Integration** - Connect Sui wallet and sign transactions

### Advanced Examples
- **Collaborative Spreadsheet** - Real-time collaboration
- **DeFi Dashboard** - Financial calculations with Sui data
- **Data Analysis** - Advanced formulas and analytics
- **Custom Formulas** - Extending with custom formula functions

### Integration Examples
- **Next.js App** - Full Next.js application
- **Vite App** - Vite + React application
- **With State Management** - Redux or Zustand integration
- **Mobile Responsive** - Mobile-optimized spreadsheet

## Quick Start

### Basic Example

```javascript
import React from 'react';
import {
  SpreadsheetProvider,
  Spreadsheet,
  Header,
  StatusBar
} from '@dreamlit/spreadsheet-sdk';
import '@dreamlit/spreadsheet-sdk/dist/index.css';

function App() {
  return (
    <SpreadsheetProvider>
      <div className="app">
        <Header />
        <Spreadsheet />
        <StatusBar />
      </div>
    </SpreadsheetProvider>
  );
}

export default App;
```

### With Autosave

```javascript
import { useSpreadsheet } from '@dreamlit/spreadsheet-sdk/business';

function AutosaveSpreadsheet() {
  const {
    spreadsheetData,
    save,
    load,
    isSaving,
    lastSaved
  } = useSpreadsheet({
    autoSave: true,
    autoSaveInterval: 30000 // 30 seconds
  });

  return (
    <div>
      <div>Last saved: {lastSaved ? new Date(lastSaved).toLocaleString() : 'Never'}</div>
      <Spreadsheet data={spreadsheetData} />
    </div>
  );
}
```

### With Wallet

```javascript
import {
  SpreadsheetProvider,
  Spreadsheet,
  WalletModal
} from '@dreamlit/spreadsheet-sdk';
import { WalletProviders } from '@dreamlit/spreadsheet-sdk/providers';

function App() {
  return (
    <WalletProviders network="testnet">
      <SpreadsheetProvider>
        <Spreadsheet />
        <WalletModal />
      </SpreadsheetProvider>
    </WalletProviders>
  );
}
```

### Import/Export

```javascript
import {
  ImportButton,
  ExportButton
} from '@dreamlit/spreadsheet-sdk/components';

function SpreadsheetToolbar() {
  const { spreadsheetData, setSpreadsheetData } = useSpreadsheet();

  return (
    <div className="toolbar">
      <ImportButton onImport={setSpreadsheetData} />
      <ExportButton data={spreadsheetData} filename="my-data.xlsx" />
    </div>
  );
}
```

## Setup Instructions

### Prerequisites

```bash
# Install dependencies
npm install @dreamlit/spreadsheet-sdk
npm install @dreamlit/walrus @dreamlit/walrus-sui-core
npm install react react-dom
```

### Configuration

```javascript
// Configure for testnet
const config = {
  network: 'testnet',
  walrus: {
    aggregatorUrl: 'https://aggregator.walrus-testnet.walrus.space',
    publisherUrl: 'https://publisher.walrus-testnet.walrus.space'
  },
  sui: {
    rpcUrl: 'https://fullnode.testnet.sui.io:443'
  }
};
```

### Running Examples

```bash
# Clone repository
git clone git@github.com:Vjust/dreamlit-walrus-sdk.git
cd dreamlit-walrus-sdk/spreadsheet-sdk/examples

# Install dependencies
npm install

# Run example
npm run dev
```

## Example Structure

Each example follows this structure:

```
example-name/
├── src/
│   ├── App.jsx           # Main app component
│   ├── components/       # Custom components
│   └── config.js         # Configuration
├── package.json
└── README.md            # Example-specific docs
```

## Features Demonstrated

### Core Features
- Spreadsheet rendering with Luckysheet
- Save to Walrus decentralized storage
- Load from Walrus via blob ID
- Automatic content hashing and integrity
- Transaction tracking on Sui blockchain

### Advanced Features
- Wallet connection (Sui Wallet, Ethos, Suiet)
- Autosave with debouncing
- Import from Excel/CSV
- Export to Excel/CSV
- Custom formula functions
- Real-time collaboration
- Network switching (testnet/mainnet)

## Contributing

To add an example:

1. Create new directory in `examples/`
2. Include complete, runnable code
3. Add README with description and setup
4. Include package.json with dependencies
5. Document any special configuration

## Related Documentation

- [../src/components/](../src/components/) - Component API
- [../src/business/](../src/business/) - Business hooks
- [../src/services/](../src/services/) - Services API
- [../README.md](../README.md) - Package overview

## Coming Soon

Full example applications demonstrating:
- Production deployment
- Performance optimization
- Custom theming
- Advanced formulas
- Collaborative editing
- Mobile optimization
