# Components Module

React UI components for the Walrus-powered spreadsheet SDK.

## Overview

This module provides pre-built React components for building spreadsheet applications with Walrus/Sui integration, including spreadsheet UI, status indicators, modals, and network badges.

## Exports

### Core Components

```javascript
import {
  Spreadsheet,
  SpreadsheetProvider,
  Header,
  StatusBar,
  SaveStatusBanner,
  SaveStatusIndicator
} from '@dreamlit/spreadsheet-sdk/components';
```

### Spreadsheet Components
- `Spreadsheet` - Main spreadsheet component (Luckysheet wrapper)
- `SpreadsheetProvider` - Context provider for spreadsheet state
- `Header` - Spreadsheet header with title and actions
- `StatusBar` - Bottom status bar with info
- `SaveStatusBanner` - Save status notification banner
- `SaveStatusIndicator` - Compact save status indicator

### UI Components
- `WalletModal` - Wallet connection modal
- `SaveDetailsModal` - Save operation details modal
- `ImportButton` - File import button with preview
- `ExportButton` - Export to Excel/CSV button
- `ImportPreviewModal` - Import preview modal
- `LoadingOverlay` - Loading state overlay

### Status Components
- `WalrusStatus` - Walrus connection status
- `NetworkBadge` - Network indicator (testnet/mainnet)
- `NetworkMismatchWarning` - Network mismatch warning
- `Collaboration` - Collaboration indicator
- `ErrorBoundary` - Error boundary wrapper

## Usage

### Basic Spreadsheet App

```javascript
import {
  SpreadsheetProvider,
  Spreadsheet,
  Header,
  StatusBar
} from '@dreamlit/spreadsheet-sdk/components';

function App() {
  return (
    <SpreadsheetProvider>
      <Header />
      <Spreadsheet />
      <StatusBar />
    </SpreadsheetProvider>
  );
}
```

### With All Features

```javascript
import {
  SpreadsheetProvider,
  Spreadsheet,
  Header,
  StatusBar,
  SaveStatusBanner,
  WalletModal,
  ErrorBoundary
} from '@dreamlit/spreadsheet-sdk/components';

function FullApp() {
  return (
    <ErrorBoundary>
      <SpreadsheetProvider>
        <SaveStatusBanner />
        <Header />
        <Spreadsheet />
        <StatusBar />
        <WalletModal />
      </SpreadsheetProvider>
    </ErrorBoundary>
  );
}
```

## Component Categories

### Layout Components
- `MainLayout` - Main application layout
- `Header` - Top header bar
- `StatusBar` - Bottom status bar

### Spreadsheet Components
See [./spreadsheet/](./spreadsheet/) for detailed spreadsheet component docs.

### Modal Components
- `WalletModal` - Connect wallet
- `SaveDetailsModal` - Save details
- `ImportPreviewModal` - Preview import

### Status Components
- `SaveStatusBanner` / `SaveStatusIndicator`
- `WalrusStatus`
- `NetworkBadge`
- `NetworkMismatchWarning`

## Related Modules

- [./spreadsheet/](./spreadsheet/) - Spreadsheet-specific components
- [../business/](../business/) - Business logic hooks
- [../services/](../services/) - Services used by components

## Notes

- All components use SpreadsheetProvider context
- Components handle loading/error states automatically
- Styled with glassmorphism design
- Responsive and accessible
