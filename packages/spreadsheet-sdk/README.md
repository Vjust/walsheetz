# @dreamlit/spreadsheet-sdk

React SDK for building Walrus-powered spreadsheet applications with blockchain integration.

## Features

- **React Hooks**: Complete set of hooks for spreadsheet state management
- **UI Components**: Pre-built spreadsheet components with Walrus/Sui integration
- **Luckysheet Integration**: Powered by Luckysheet for rich spreadsheet functionality
- **Blockchain Integration**: Built-in Sui blockchain adapters and services
- **Storage Adapters**: Seamless Walrus storage integration
- **Formula Engine**: Custom formula functions including Sui-specific formulas
- **Import/Export**: CSV, Excel import/export with Walrus storage
- **Autosave**: Automatic saving to Walrus with blockchain versioning
- **Wallet Integration**: Browser wallet connection and management
- **Network Management**: Multi-network support (testnet/mainnet)

## Installation

```bash
npm install @dreamlit/spreadsheet-sdk @dreamlit/walrus @dreamlit/walrus-sui-core react react-dom
# or
bun add @dreamlit/spreadsheet-sdk @dreamlit/walrus @dreamlit/walrus-sui-core react react-dom
```

**Important**: This package has **peer dependencies** on:
- `@dreamlit/walrus` - Core Walrus storage adapter
- `@dreamlit/walrus-sui-core` - Sui blockchain integration
- `react` ^18.0.0
- `react-dom` ^18.0.0

## Quick Start

### Basic Spreadsheet App

```jsx
import React from 'react';
import {
  SpreadsheetProvider,
  Spreadsheet,
  Header,
  StatusBar,
  SaveStatusBanner
} from '@dreamlit/spreadsheet-sdk';
import '@dreamlit/spreadsheet-sdk/dist/index.css';

function App() {
  return (
    <SpreadsheetProvider>
      <div className="app-container">
        <Header />
        <SaveStatusBanner />
        <Spreadsheet />
        <StatusBar />
      </div>
    </SpreadsheetProvider>
  );
}

export default App;
```

### Custom Hook Usage

```jsx
import { useSpreadsheet } from '@dreamlit/spreadsheet-sdk/hooks';

function MySpreadsheetComponent() {
  const {
    spreadsheetData,
    saveToBlockchain,
    isSaving,
    lastSaved,
    isConnected
  } = useSpreadsheet();

  const handleSave = async () => {
    const result = await saveToBlockchain();
    console.log('Saved with blob ID:', result.blobId);
  };

  return (
    <div>
      <button onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save to Walrus'}
      </button>
      <p>Last saved: {lastSaved ? new Date(lastSaved).toLocaleString() : 'Never'}</p>
    </div>
  );
}
```

## Package Structure

```
@dreamlit/spreadsheet-sdk/
├── /                     # Main entry (all exports)
├── /components           # UI components
├── /hooks               # React hooks
└── /services            # Services and utilities
```

## API Reference

### Components

#### Core Components

**`<SpreadsheetProvider>`**
- Context provider for spreadsheet state
- Must wrap all spreadsheet components
- Props: `initialData?`, `config?`

**`<Spreadsheet>`**
- Main spreadsheet grid component
- Uses Luckysheet for rendering
- Auto-initializes with provider data

**`<Header>`**
- Spreadsheet toolbar with save/import/export buttons
- Network selector and wallet connection
- Props: `title?`, `showNetworkSelector?`

**`<StatusBar>`**
- Bottom status bar showing wallet info
- Network status and connection state
- Cell selection info

**`<SaveStatusBanner>`**
- Displays save status and errors
- Auto-dismissing notifications
- Props: `position?`, `duration?`

#### Modal Components

**`<WalletModal>`**
- Wallet connection modal
- Supports multiple wallet providers
- Props: `isOpen`, `onClose`

**`<SaveDetailsModal>`**
- Shows save transaction details
- PoA certification info
- Explorer links

**`<ImportPreviewModal>`**
- Preview imported data before loading
- Format detection (CSV, Excel)
- Props: `data`, `onConfirm`, `onCancel`

#### Utility Components

**`<NetworkBadge>`**
- Network indicator badge
- Props: `network` ('testnet' | 'mainnet')

**`<NetworkMismatchWarning>`**
- Warns when wallet network doesn't match app
- Props: `expectedNetwork`, `actualNetwork`

**`<WalrusStatus>`**
- Walrus connection status indicator
- Health check display

**`<LoadingOverlay>`**
- Full-screen loading indicator
- Props: `message?`, `progress?`

### Hooks

#### Business Logic Hooks

**`useSpreadsheet()`**
Main spreadsheet state and actions hook.

```typescript
const {
  // State
  spreadsheetData: object,
  isSaving: boolean,
  isLoading: boolean,
  lastSaved: number,
  isDirty: boolean,
  isConnected: boolean,

  // Actions
  saveToBlockchain: () => Promise<SaveResult>,
  loadFromBlockchain: (blobId: string) => Promise<void>,
  updateCell: (row, col, value) => void,

  // Adapters
  blockchainAdapter: BlockchainAdapter,
  storageAdapter: StorageAdapter
} = useSpreadsheet();
```

**`useSpreadsheetAutosave(options?)`**
Automatic saving functionality.

```typescript
useSpreadsheetAutosave({
  interval: 30000,  // 30 seconds
  enabled: true
});
```

**`useSpreadsheetImport()`**
Import handling hook.

```typescript
const {
  importFile: (file: File) => Promise<void>,
  importFromUrl: (url: string) => Promise<void>,
  isImporting: boolean
} = useSpreadsheetImport();
```

#### Presentation Hooks

**`useSpreadsheetLifecycle(config)`**
Manages Luckysheet initialization and cleanup.

**`useLuckysheetShortcuts(config)`**
Keyboard shortcuts (Ctrl+S for save, etc.).

**`useUnloadWarning()`**
Warns user when leaving with unsaved changes.

### Services

#### Formula Functions

**Custom Sui Functions**
```javascript
import { SuiFunctions } from '@dreamlit/spreadsheet-sdk/services';

// Available formulas:
// =SUI_BALANCE(address)
// =SUI_OBJECT(objectId)
// =SUI_GAS_PRICE()
// =SUI_EPOCH()
```

**WalSheetz Functions**
```javascript
import { WalSheetzFunctions } from '@dreamlit/spreadsheet-sdk/services';

// Available formulas:
// =WALRUS_STORE(data)
// =WALRUS_RETRIEVE(blobId)
// =BLOCKCHAIN_HASH(data)
```

#### Import/Export Service

```javascript
import { SpreadsheetImportExportService } from '@dreamlit/spreadsheet-sdk/services';

const service = new SpreadsheetImportExportService();

// Export to CSV
const csvBlob = await service.exportToCSV(spreadsheetData);

// Export to Excel
const excelBlob = await service.exportToExcel(spreadsheetData);

// Import from CSV
const data = await service.importFromCSV(file);
```

## Configuration

### Network Configuration

```jsx
import { getCurrentConfig } from '@dreamlit/walrus-sui-core/blockchain';

const config = getCurrentConfig();
console.log('Current network:', config.network); // 'testnet' | 'mainnet'
```

### Custom Styling

Import the base styles and override CSS variables:

```css
@import '@dreamlit/spreadsheet-sdk/dist/index.css';

:root {
  --spreadsheet-primary-color: #3b82f6;
  --spreadsheet-bg-color: #ffffff;
  --spreadsheet-border-color: #e5e7eb;
}
```

## Examples

### Complete Application

```jsx
import React from 'react';
import {
  SpreadsheetProvider,
  MainLayout,
  useSpreadsheet
} from '@dreamlit/spreadsheet-sdk';
import '@dreamlit/spreadsheet-sdk/dist/index.css';

function SpreadsheetApp() {
  return (
    <SpreadsheetProvider>
      <MainLayout />
    </SpreadsheetProvider>
  );
}

export default SpreadsheetApp;
```

### Custom Save Handler

```jsx
import { useSpreadsheet } from '@dreamlit/spreadsheet-sdk/hooks';
import { poaCertificationService } from '@dreamlit/walrus-sui-core/data-integrity';

function CustomSaveButton() {
  const { saveToBlockchain } = useSpreadsheet();

  const handleSave = async () => {
    try {
      const result = await saveToBlockchain();

      // Get PoA certificate
      const cert = await poaCertificationService.getCertificate(result.blobId);
      console.log('PoA Certificate:', cert);

      alert(`Saved! Blob ID: ${result.blobId}`);
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  return <button onClick={handleSave}>Save</button>;
}
```

### Import from Walrus

```jsx
import { useSpreadsheet } from '@dreamlit/spreadsheet-sdk/hooks';

function LoadFromWalrus({ blobId }) {
  const { loadFromBlockchain } = useSpreadsheet();

  const handleLoad = async () => {
    await loadFromBlockchain(blobId);
    alert('Spreadsheet loaded!');
  };

  return <button onClick={handleLoad}>Load Spreadsheet</button>;
}
```

## Dependencies

### Peer Dependencies (Required)
- `@dreamlit/walrus` ^1.0.0 - Core Walrus storage
- `@dreamlit/walrus-sui-core` ^1.0.0 - Sui blockchain integration
- `react` ^18.0.0
- `react-dom` ^18.0.0

### Direct Dependencies
- `@mysten/dapp-kit` - Sui dApp toolkit
- `@mysten/sui` - Sui SDK
- `@tanstack/react-query` - Data fetching
- `luckysheet` - Spreadsheet engine
- `luckyexcel` - Excel import
- `xlsx` - Excel processing
- `framer-motion` - Animations
- `lucide-react` - Icons

## Build Information

**Build Stats**:
- Main bundle: 1.07 MB (ESM)
- Components bundle: 1.07 MB (ESM)
- Business logic: 459 KB (ESM)
- Services: 81 KB (ESM)
- Styles: 73 KB (CSS)

**Tree-shaking**: Enabled - import only what you need!

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions

## Troubleshooting

### "Cannot find module '@dreamlit/walrus'"

Make sure you've installed the peer dependencies:
```bash
npm install @dreamlit/walrus @dreamlit/walrus-sui-core
```

### Luckysheet not rendering

Ensure you've imported the CSS:
```javascript
import '@dreamlit/spreadsheet-sdk/dist/index.css';
```

### Wallet connection fails

Check that your network configuration matches your wallet's network setting.

## Contributing

This package is part of the WalSheetz project. For issues and contributions, see the main repository.

## License

MIT

## Author

Dreamlit

## Changelog

### v1.0.0 (2025-11-02)

**Initial Release - Days 4-6 Complete**

- ✅ Full spreadsheet SDK extraction from WalSheetz
- ✅ Complete React component library
- ✅ Business logic hooks (useSpreadsheet, useSpreadsheetAutosave, useSpreadsheetImport)
- ✅ Presentation hooks (useSpreadsheetLifecycle, useLuckysheetShortcuts)
- ✅ Services (formula functions, import/export)
- ✅ Adapters (blockchain, storage)
- ✅ Build passing with 4 entry points
- ✅ Peer dependencies on @dreamlit/walrus and @dreamlit/walrus-sui-core
- ✅ Comprehensive documentation and examples
