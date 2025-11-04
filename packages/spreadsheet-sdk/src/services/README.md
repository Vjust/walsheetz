# Services Module

Business services for spreadsheet functionality including import/export, formulas, and Luckysheet integration.

## Overview

This module contains service classes and utilities for spreadsheet operations, formula execution, import/export functionality, collaboration, and testing.

## Exports

### SpreadsheetImportExportService

Service for importing from and exporting to Excel/CSV files.

```javascript
import { SpreadsheetImportExportService } from '@dreamlit/spreadsheet-sdk/services';

const service = new SpreadsheetImportExportService();

// Import from Excel
const data = await service.importFromExcel(file);

// Export to Excel
const blob = await service.exportToExcel(spreadsheetData, 'MySpreadsheet');

// Export to CSV
const csvBlob = await service.exportToCSV(spreadsheetData);
```

---

### BlobLineageTracker

Service for tracking blob lineage and versioning.

```javascript
import { BlobLineageTracker } from '@dreamlit/spreadsheet-sdk/services';

const tracker = new BlobLineageTracker();

// Track new blob
await tracker.trackBlob(blobId, {
  parentBlobId,
  version: 2,
  metadata: { ... }
});

// Get lineage
const lineage = await tracker.getLineage(blobId);
```

---

### CollaborationService

Service for real-time collaboration features.

```javascript
import { CollaborationService } from '@dreamlit/spreadsheet-sdk/services';

const collab = new CollaborationService();

// Join session
await collab.join(spreadsheetId, userId);

// Broadcast changes
collab.broadcastChange(cellData);

// Listen for changes
collab.on('change', (change) => {
  console.log('Collaborator updated:', change);
});
```

---

### DeFiStateManager

Service for managing DeFi-related state.

```javascript
import { DeFiStateManager } from '@dreamlit/spreadsheet-sdk/services';

const defiManager = new DeFiStateManager();

// Track liquidity
await defiManager.trackLiquidity(poolId, amount);

// Get state
const state = defiManager.getState();
```

---

### FaucetService

Service for testnet faucet integration.

```javascript
import { FaucetService } from '@dreamlit/spreadsheet-sdk/services';

const faucet = new FaucetService();

// Request testnet tokens
await faucet.requestTokens(address);
```

---

### GridSizeManager

Service for managing spreadsheet grid size.

```javascript
import { GridSizeManager } from '@dreamlit/spreadsheet-sdk/services';

const gridManager = new GridSizeManager();

// Set size
gridManager.setSize({ rows: 1000, cols: 26 });

// Get size
const size = gridManager.getSize(); // { rows, cols }
```

## Service Categories

### Import/Export
- `SpreadsheetImportExportService` - Excel/CSV operations

### Data Management
- `BlobLineageTracker` - Blob versioning
- `GridSizeManager` - Grid sizing

### Collaboration
- `CollaborationService` - Real-time collaboration

### DeFi Integration
- `DeFiStateManager` - DeFi state management
- `FaucetService` - Testnet faucet

### Formulas & Integration
- See [./formulas/](./formulas/) - Formula functions
- See [./luckysheet/](./luckysheet/) - Luckysheet integration
- See [./testing/](./testing/) - Testing utilities

## Usage Examples

### Import/Export

```javascript
import { SpreadsheetImportExportService } from '@dreamlit/spreadsheet-sdk/services';

const service = new SpreadsheetImportExportService();

// Import Excel file
const handleFileUpload = async (file) => {
  const data = await service.importFromExcel(file);
  setSpreadsheetData(data);
};

// Export to Excel
const handleExport = async () => {
  const blob = await service.exportToExcel(spreadsheetData, 'MyData');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'MyData.xlsx';
  a.click();
};
```

### Collaboration

```javascript
import { CollaborationService } from '@dreamlit/spreadsheet-sdk/services';

const collab = new CollaborationService();

// Setup collaboration
await collab.join(spreadsheetId, currentUser);

// Listen for remote changes
collab.on('cellchange', ({ cell, value, user }) => {
  console.log(`${user} updated ${cell} to ${value}`);
  updateCell(cell, value);
});

// Broadcast local changes
const handleCellChange = (cell, value) => {
  collab.broadcastChange({ cell, value, user: currentUser });
};
```

## Related Modules

- [./formulas/](./formulas/) - Formula engine
- [./luckysheet/](./luckysheet/) - Luckysheet integration
- [./testing/](./testing/) - Testing utilities
- [../adapters/](../adapters/) - Adapters use services
- [../business/](../business/) - Business logic uses services

## Notes

- Services provide business logic abstraction
- Used by hooks and components
- Support dependency injection
- Include error handling and validation
