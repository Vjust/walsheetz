# Spreadsheet Components

Core spreadsheet UI components built on Luckysheet.

## Overview

Spreadsheet-specific React components providing the main spreadsheet interface, import/export functionality, and spreadsheet-related UI elements.

## Exports

### Main Components

#### Spreadsheet
Core spreadsheet component (Luckysheet wrapper).

```javascript
import { Spreadsheet } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<Spreadsheet
  initialData={data}
  onChange={handleChange}
  readOnly={false}
/>
```

#### SpreadsheetProvider
Context provider for spreadsheet state.

```javascript
import { SpreadsheetProvider } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<SpreadsheetProvider>
  <App />
</SpreadsheetProvider>
```

#### Header
Spreadsheet header with title, save button, and actions.

```javascript
import { Header } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<Header
  title="My Spreadsheet"
  onSave={handleSave}
  isSaving={false}
/>
```

#### StatusBar
Bottom status bar showing cell info and statistics.

```javascript
import { StatusBar } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<StatusBar
  selectedCell="A1"
  cellValue={123}
  rowCount={100}
  colCount={26}
/>
```

### Action Components

#### ImportButton
Button with file picker for importing Excel/CSV.

```javascript
import { ImportButton } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<ImportButton
  onImport={handleImport}
  acceptedFormats={['.xlsx', '.csv']}
/>
```

#### ExportButton
Button for exporting to Excel/CSV.

```javascript
import { ExportButton } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<ExportButton
  data={spreadsheetData}
  filename="export.xlsx"
  format="xlsx"
/>
```

### Modal Components

#### SaveDetailsModal
Modal showing save operation details.

```javascript
import { SaveDetailsModal } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<SaveDetailsModal
  isOpen={true}
  blobId="abc123"
  txDigest="0x..."
  onClose={handleClose}
/>
```

#### ImportPreviewModal
Modal for previewing imported data before applying.

```javascript
import { ImportPreviewModal } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<ImportPreviewModal
  isOpen={true}
  previewData={data}
  onConfirm={handleConfirm}
  onCancel={handleCancel}
/>
```

### Status Components

#### SaveStatusBanner
Full-width banner showing save status.

```javascript
import { SaveStatusBanner } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<SaveStatusBanner
  status="saving" // 'saving' | 'saved' | 'error'
  message="Saving to Walrus..."
/>
```

#### SaveStatusIndicator
Compact save status indicator.

```javascript
import { SaveStatusIndicator } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<SaveStatusIndicator
  isSaving={true}
  lastSaved={Date.now()}
  error={null}
/>
```

### Layout Components

#### MainLayout
Main spreadsheet application layout.

```javascript
import { MainLayout } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<MainLayout>
  <Header />
  <Spreadsheet />
  <StatusBar />
</MainLayout>
```

#### WalletModal
Wallet connection modal.

```javascript
import { WalletModal } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<WalletModal
  isOpen={true}
  onConnect={handleConnect}
  onClose={handleClose}
/>
```

#### LoadingOverlay
Loading state overlay.

```javascript
import { LoadingOverlay } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<LoadingOverlay
  isLoading={true}
  message="Loading spreadsheet..."
/>
```

#### NotificationContainer
Toast notification container.

```javascript
import { NotificationContainer } from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

<NotificationContainer />
```

## Usage Example

### Complete Spreadsheet App

```javascript
import {
  SpreadsheetProvider,
  Spreadsheet,
  Header,
  StatusBar,
  SaveStatusBanner,
  ImportButton,
  ExportButton,
  WalletModal,
  LoadingOverlay
} from '@dreamlit/spreadsheet-sdk/components/spreadsheet';

function App() {
  return (
    <SpreadsheetProvider>
      <SaveStatusBanner />
      <Header>
        <ImportButton />
        <ExportButton />
      </Header>
      <Spreadsheet />
      <StatusBar />
      <WalletModal />
      <LoadingOverlay />
    </SpreadsheetProvider>
  );
}
```

## Component Styling

Components use CSS modules for styling:
- `ExportButton.css`
- `ImportButton.css`
- `ImportPreviewModal.css`
- `LoadingOverlay.css`
- `SaveDetailsModal.css`
- `SaveStatusBanner.css`
- `SaveStatusIndicator.css`
- `WalletModal.css`

## Related Modules

- [../../business/](../../business/) - Business logic
- [../../services/](../../services/) - Services
- [../../hooks/](../../hooks/) - Custom hooks

## Notes

- All components integrate with SpreadsheetProvider context
- Luckysheet provides the core spreadsheet engine
- Components handle Walrus/Sui integration automatically
- Styled with glassmorphism design system
- Fully responsive and accessible
