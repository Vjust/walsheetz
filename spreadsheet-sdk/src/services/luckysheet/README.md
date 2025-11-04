# Luckysheet Module

Luckysheet spreadsheet engine integration and data transformation utilities.

## Overview

This module provides integration with the Luckysheet spreadsheet engine, including data transformation, configuration management, and custom enhancements.

## Exports

### LuckysheetAdapter

Adapter for Luckysheet instance management and configuration.

```javascript
import { LuckysheetAdapter } from '@dreamlit/spreadsheet-sdk/services/luckysheet';

const adapter = new LuckysheetAdapter({
  container: '#luckysheet',
  data: spreadsheetData,
  options: {
    showToolbar: true,
    showFormulaBar: true
  }
});

adapter.initialize();
```

---

### dataTransforms

Utilities for transforming data to/from Luckysheet format.

```javascript
import {
  toLuckysheetFormat,
  fromLuckysheetFormat
} from '@dreamlit/spreadsheet-sdk/services/luckysheet';

// Convert to Luckysheet format
const luckyData = toLuckysheetFormat(spreadsheetData);

// Convert from Luckysheet format
const normalData = fromLuckysheetFormat(luckyData);
```

---

### ensureLuckysheetNesting

Utility to ensure proper Luckysheet data nesting.

```javascript
import { ensureLuckysheetNesting } from '@dreamlit/spreadsheet-sdk/services/luckysheet';

const nested = ensureLuckysheetNesting(data);
```

---

### injectAtRenderTime

Runtime injection utilities for Luckysheet customization.

```javascript
import { injectAtRenderTime } from '@dreamlit/spreadsheet-sdk/services/luckysheet';

injectAtRenderTime(() => {
  // Custom rendering logic
});
```

---

### injectWZLocalePatch

Locale patch injection for WalSheetz customizations.

```javascript
import { injectWZLocalePatch } from '@dreamlit/spreadsheet-sdk/services/luckysheet';

injectWZLocalePatch();
```

---

### injectWzIntoSheets

Inject WalSheetz branding and customizations into sheets.

```javascript
import { injectWzIntoSheets } from '@dreamlit/spreadsheet-sdk/services/luckysheet';

injectWzIntoSheets(sheetData);
```

## Data Transformation

### toLuckysheetFormat

Convert standard data to Luckysheet format:

```javascript
import { toLuckysheetFormat } from '@dreamlit/spreadsheet-sdk/services/luckysheet';

const standardData = {
  sheets: [
    {
      name: 'Sheet1',
      cells: [[{ value: 'A1' }, { value: 'B1' }]]
    }
  ]
};

const luckyData = toLuckysheetFormat(standardData);
// Returns Luckysheet-compatible format
```

### fromLuckysheetFormat

Convert Luckysheet data to standard format:

```javascript
import { fromLuckysheetFormat } from '@dreamlit/spreadsheet-sdk/services/luckysheet';

const luckyData = luckysheet.getAllSheets();
const standardData = fromLuckysheetFormat(luckyData);
// Returns standard spreadsheet format
```

## Usage Examples

### Complete Integration

```javascript
import {
  LuckysheetAdapter,
  injectWZLocalePatch,
  injectAtRenderTime
} from '@dreamlit/spreadsheet-sdk/services/luckysheet';

// Apply patches
injectWZLocalePatch();

// Create adapter
const adapter = new LuckysheetAdapter({
  container: '#spreadsheet',
  data: initialData,
  options: {
    showToolbar: true,
    showFormulaBar: true,
    showSheetTabs: true
  }
});

// Custom rendering
injectAtRenderTime(() => {
  console.log('Luckysheet rendered');
});

// Initialize
await adapter.initialize();
```

### Data Import/Export

```javascript
import {
  toLuckysheetFormat,
  fromLuckysheetFormat
} from '@dreamlit/spreadsheet-sdk/services/luckysheet';

// Import external data
const handleImport = (externalData) => {
  const luckyData = toLuckysheetFormat(externalData);
  luckysheet.setAllSheetData(luckyData);
};

// Export data
const handleExport = () => {
  const luckyData = luckysheet.getAllSheets();
  const exportData = fromLuckysheetFormat(luckyData);
  return exportData;
};
```

## Testing

See [./__tests__/](../../../__tests__/) for data transformation tests:

```javascript
import { toLuckysheetFormat, fromLuckysheetFormat } from '@dreamlit/spreadsheet-sdk/services/luckysheet';

describe('Data Transforms', () => {
  it('should convert to Luckysheet format', () => {
    const result = toLuckysheetFormat(testData);
    expect(result).toHaveProperty('sheets');
  });

  it('should convert from Luckysheet format', () => {
    const result = fromLuckysheetFormat(luckyData);
    expect(result).toHaveProperty('cells');
  });
});
```

## Configuration

### Luckysheet Options

```javascript
{
  container: '#luckysheet',          // Container selector
  title: 'My Spreadsheet',           // Spreadsheet title
  lang: 'en',                        // Language
  showToolbar: true,                 // Show toolbar
  showFormulaBar: true,              // Show formula bar
  showSheetTabs: true,               // Show sheet tabs
  allowEdit: true,                   // Allow editing
  showinfobar: false,                // Hide info bar
  showsheetbar: true,                // Show sheet bar
  showstatisticBar: true,            // Show statistics
  enableAddRow: true,                // Enable add row
  enableAddCol: true,                // Enable add column
  userInfo: false,                   // Hide user info
  myFolderUrl: '',                   // Folder URL
  functionButton: '',                // Function button
  showConfigWindowResize: true,      // Show resize
  enablePage: false                  // Disable pagination
}
```

## Related Modules

- [../../core/](../../core/) - SpreadsheetEngine
- [../formulas/](../formulas/) - Custom formulas
- [../../components/](../../components/) - Spreadsheet component

## Notes

- Luckysheet is the underlying spreadsheet engine
- Data transformations ensure compatibility
- Patches provide WalSheetz customizations
- Adapter simplifies Luckysheet lifecycle management
- All transformations preserve data integrity
