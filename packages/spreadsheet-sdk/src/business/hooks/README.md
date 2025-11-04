# Business Hooks

Specialized React hooks for spreadsheet business logic.

## Overview

This module contains focused hooks for specific business operations like autosave and import functionality.

## Exports

### useSpreadsheetAutosave

Hook for automatic spreadsheet saving with debouncing.

```javascript
import { useSpreadsheetAutosave } from '@dreamlit/spreadsheet-sdk/business/hooks';

function MyComponent() {
  const { save, isSaving, lastSaved } = useSpreadsheetAutosave({
    spreadsheetData,
    interval: 30000, // 30 seconds
    enabled: true
  });

  return <div>Last saved: {lastSaved}</div>;
}
```

---

### useSpreadsheetImport

Hook for importing spreadsheets from Excel/CSV files.

```javascript
import { useSpreadsheetImport } from '@dreamlit/spreadsheet-sdk/business/hooks';

function ImportButton() {
  const { importFile, isImporting, error } = useSpreadsheetImport({
    onImportComplete: (data) => {
      console.log('Imported:', data);
    }
  });

  return (
    <button onClick={() => importFile(file)} disabled={isImporting}>
      Import
    </button>
  );
}
```

## Usage

These hooks are typically used internally by the main `useSpreadsheet` hook but can also be used independently for custom implementations.

```javascript
import {
  useSpreadsheetAutosave,
  useSpreadsheetImport
} from '@dreamlit/spreadsheet-sdk/business/hooks';

function CustomSpreadsheet() {
  // Custom autosave
  const { save } = useSpreadsheetAutosave({
    spreadsheetData: myData,
    interval: 60000 // 1 minute
  });

  // Custom import
  const { importFile } = useSpreadsheetImport({
    onImportComplete: handleImport
  });

  return <div>...</div>;
}
```

## Related Modules

- [../](../) - Main useSpreadsheet hook
- [../../components/](../../components/) - UI components

## Notes

- Hooks follow React hooks rules
- Provide focused functionality
- Can be used independently or via useSpreadsheet
- Include debouncing and error handling
