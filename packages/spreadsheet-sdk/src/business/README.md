# Business Module

Business logic and React hooks for spreadsheet state management.

## Overview

This module contains the core business logic for the spreadsheet SDK, including the main `useSpreadsheet` hook and specialized business hooks for autosave and import functionality.

## Exports

### useSpreadsheet

Main hook for spreadsheet state management, providing complete spreadsheet functionality.

```javascript
import { useSpreadsheet } from '@dreamlit/spreadsheet-sdk/business';

function SpreadsheetApp() {
  const {
    // State
    spreadsheetData,
    isSaving,
    isLoading,

    // Actions
    save,
    load,
    exportToExcel,
    importFromExcel,

    // Metadata
    lastSaved,
    blobId,
    txDigest
  } = useSpreadsheet({
    autoSave: true,
    autoSaveInterval: 30000
  });

  return <div>...</div>;
}
```

**Provides:**
- Spreadsheet state management
- Save/load operations
- Import/export functionality
- Autosave with configurable interval
- Transaction tracking
- Error handling

## Related Modules

- [./hooks/](./hooks/) - Specialized business hooks
- [../components/](../components/) - UI components use business logic
- [../services/](../services/) - Services called by business logic

## Notes

- Central hook for all spreadsheet operations
- Manages React state and side effects
- Integrates with Walrus and Sui blockchain
- Provides autosave and import/export
