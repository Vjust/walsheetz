# Core Module

Core spreadsheet engine integration and functionality.

## Overview

This module contains the core spreadsheet engine implementation, wrapping Luckysheet with Walrus/Sui integration.

## Exports

### SpreadsheetEngine

Core engine class managing Luckysheet instance and spreadsheet operations.

```javascript
import { SpreadsheetEngine } from '@dreamlit/spreadsheet-sdk/core';

const engine = new SpreadsheetEngine({
  container: '#luckysheet',
  data: initialData,
  onDataChange: handleChange
});

// Initialize
engine.initialize();

// Get data
const data = engine.getData();

// Set data
engine.setData(newData);

// Destroy
engine.destroy();
```

**Methods:**
- `initialize()` - Initialize Luckysheet
- `getData()` - Get current spreadsheet data
- `setData(data)` - Set spreadsheet data
- `destroy()` - Cleanup and destroy instance
- `refresh()` - Refresh display
- `resize()` - Resize spreadsheet

## Usage

The SpreadsheetEngine is typically used internally by the Spreadsheet component:

```javascript
import { SpreadsheetEngine } from '@dreamlit/spreadsheet-sdk/core';

// Create engine
const engine = new SpreadsheetEngine({
  container: document.getElementById('spreadsheet'),
  data: spreadsheetData,
  options: {
    showToolbar: true,
    showFormulaBar: true
  }
});

// Initialize Luckysheet
await engine.initialize();

// Listen for changes
engine.on('datachange', (data) => {
  console.log('Data changed:', data);
});
```

## Related Modules

- [../components/](../components/) - Spreadsheet component uses engine
- [../services/luckysheet/](../services/luckysheet/) - Luckysheet integration

## Notes

- Wraps Luckysheet for easier integration
- Handles Luckysheet lifecycle
- Provides event-based change detection
- Used internally by Spreadsheet component
